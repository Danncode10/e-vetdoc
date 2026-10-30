"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAuth, requireRole, CLINIC_ROLES } from "@/services/authorization";
import type { Tables, TablesInsert } from "@/types/supabase";
import { sendInvoiceCreatedEmail, sendInvoicePaidEmail } from "./email";

export type Invoice = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;
export type Payment = Tables<"payments">;

export type InvoiceWithDetails = Invoice & {
  invoice_items: InvoiceItem[];
  payments: Payment[];
  owner: { id: string; full_name: string | null; email: string | null; phone: string | null } | null;
};

const VAT_RATE = 0.12;

// --- Staff guard ---
async function requireStaff() {
  const { profile } = await requireRole(CLINIC_ROLES);
  return profile;
}

/**
 * List all invoices. Staff only.
 */
export async function listInvoices(filters?: {
  status?: Invoice["status"];
  ownerId?: string;
  limit?: number;
  offset?: number;
}) {
  await requireStaff();
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(
      `*, owner:profiles!invoices_owner_id_profiles_id_fk (id, full_name, email, phone)`
    )
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters?.limit) query = query.limit(filters.limit);
  if (filters?.offset) query = query.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 50) - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * Get full invoice details including items and payments.
 */
export async function getInvoiceById(id: string): Promise<InvoiceWithDetails | null> {
  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `*, invoice_items(*), payments(*), owner:profiles!invoices_owner_id_profiles_id_fk (id, full_name, email, phone)`
    )
    .eq("id", id)
    .single();

  if (error) return null;
  return data as InvoiceWithDetails;
}

/**
 * Create a new draft invoice.
 */
export async function createInvoice(input: {
  ownerId: string;
  encounterId?: string;
  dueDate?: string;
}): Promise<Invoice> {
  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      owner_id: input.ownerId,
      encounter_id: input.encounterId ?? null,
      due_date: input.dueDate ?? null,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/dashboard/billing");
  return data;
}

/**
 * Add a line item to an invoice (draft only).
 */
export async function addInvoiceItem(
  invoiceId: string,
  item: { description: string; quantity: number; unitPrice: number; isVatable: boolean }
): Promise<InvoiceItem> {
  await requireStaff();

  if (!item.description.trim()) throw new Error("Description is required");
  if (item.quantity <= 0) throw new Error("Quantity must be greater than 0");
  if (item.unitPrice < 0) throw new Error("Unit price cannot be negative");

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoice_items")
    .insert({
      invoice_id: invoiceId,
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price: item.unitPrice,
      is_vatable: item.isVatable,
    })
    .select()
    .single();

  if (error) throw error;

  await recalculateInvoiceTotals(invoiceId);
  revalidatePath(`/dashboard/billing/${invoiceId}`);
  return data;
}

/**
 * Remove a line item.
 */
export async function removeInvoiceItem(invoiceId: string, itemId: string): Promise<void> {
  await requireStaff();
  const supabase = await createClient();

  const { error } = await supabase.from("invoice_items").delete().eq("id", itemId);
  if (error) throw error;

  await recalculateInvoiceTotals(invoiceId);
  revalidatePath(`/dashboard/billing/${invoiceId}`);
}

/**
 * Recalculate and persist invoice totals from its current line items.
 * This is always called server-side to ensure accuracy.
 */
async function recalculateInvoiceTotals(invoiceId: string): Promise<void> {
  const supabase = await createClient();

  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId);

  if (itemsError) throw itemsError;

  let vatableSales = 0;
  let vatExemptSales = 0;

  for (const item of items ?? []) {
    const lineTotal = Number(item.quantity) * Number(item.unit_price);
    if (item.is_vatable) {
      vatableSales += lineTotal;
    } else {
      vatExemptSales += lineTotal;
    }
  }

  const vatAmount = vatableSales * VAT_RATE;
  const totalAmount = vatableSales + vatAmount + vatExemptSales;

  const { error } = await supabase
    .from("invoices")
    .update({
      vatable_sales: vatableSales.toFixed(2),
      vat_exempt_sales: vatExemptSales.toFixed(2),
      vat_amount: vatAmount.toFixed(2),
      total_amount: totalAmount.toFixed(2),
    })
    .eq("id", invoiceId);

  if (error) throw error;
}

/**
 * Finalize a draft invoice → transitions to 'unpaid'.
 */
export async function finalizeInvoice(invoiceId: string): Promise<Invoice> {
  await requireStaff();
  const supabase = await createClient();

  // Ensure invoice has at least one item
  const { count } = await supabase
    .from("invoice_items")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);

  if (!count || count === 0) {
    throw new Error("Cannot finalize an invoice with no line items.");
  }

  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "unpaid" })
    .eq("id", invoiceId)
    .eq("status", "draft") // Only draft invoices can be finalized
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error("Invoice not found or is not in draft status.");

  // Send transactional email
  await sendInvoiceCreatedEmail(invoiceId);

  revalidatePath(`/dashboard/billing/${invoiceId}`);
  revalidatePath("/dashboard/billing");
  return data;
}

/**
 * Record a payment against an invoice.
 * Automatically updates invoice status to 'partial' or 'paid'.
 */
export async function recordPayment(input: {
  invoiceId: string;
  amountPaid: number;
  method: "cash" | "gcash" | "card" | "bank_transfer";
  referenceNumber?: string;
}): Promise<Payment> {
  const staff = await requireStaff();
  const supabase = await createClient();

  if (input.amountPaid <= 0) throw new Error("Payment amount must be greater than 0.");

  // Get current invoice to validate
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("*, payments(amount_paid)")
    .eq("id", input.invoiceId)
    .single();

  if (invoiceError || !invoice) throw new Error("Invoice not found.");
  if (invoice.status === "paid") throw new Error("This invoice is already fully paid.");
  if (invoice.status === "voided") throw new Error("This invoice has been voided.");
  if (invoice.status === "draft") throw new Error("Finalize the invoice before recording payment.");

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      invoice_id: input.invoiceId,
      amount_paid: input.amountPaid,
      method: input.method,
      reference_number: input.referenceNumber ?? null,
      recorded_by: staff.id,
    })
    .select()
    .single();

  if (paymentError) throw paymentError;

  // Recalculate total paid and update invoice status
  const { data: allPayments } = await supabase
    .from("payments")
    .select("amount_paid")
    .eq("invoice_id", input.invoiceId);

  const totalPaid = (allPayments ?? []).reduce((sum, p) => sum + Number(p.amount_paid), 0);
  const invoiceTotal = Number(invoice.total_amount);

  let newStatus: Invoice["status"] = "partial";
  if (totalPaid >= invoiceTotal) {
    newStatus = "paid";
  }

  await supabase.from("invoices").update({ status: newStatus }).eq("id", input.invoiceId);

  // Send transactional email if fully paid
  if (newStatus === "paid") {
    await sendInvoicePaidEmail(input.invoiceId);
  }

  revalidatePath(`/dashboard/billing/${input.invoiceId}`);
  revalidatePath("/dashboard/billing");
  return payment;
}

/**
 * Void an invoice (staff only, only if draft or unpaid).
 */
export async function voidInvoice(invoiceId: string): Promise<void> {
  await requireStaff();
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .update({ status: "voided" })
    .eq("id", invoiceId)
    .in("status", ["draft", "unpaid"]);

  if (error) throw error;
  revalidatePath(`/dashboard/billing/${invoiceId}`);
  revalidatePath("/dashboard/billing");
}

/**
 * Quick-bill an appointment in one action:
 *  1. Create a draft invoice linked to the appointment
 *  2. Add the consultation line item
 *  3. Finalize the invoice (→ unpaid)
 *  4. Record the payment (→ paid)
 *  5. Flip appointment status to "paid"
 *
 * Returns the created invoice ID for navigation.
 */
export async function quickBillAppointment(input: {
  appointmentId: string;
  ownerId: string;
  encounterId?: string;
  serviceDescription: string;
  amount: number;
  isVatable: boolean;
  method: "cash" | "gcash" | "card" | "bank_transfer";
  referenceNumber?: string;
}): Promise<{ invoiceId: string; receiptNumber: string }> {
  const staff = await requireStaff();
  const supabase = await createClient();

  if (input.amount <= 0) throw new Error("Amount must be greater than 0.");
  if (!input.serviceDescription.trim()) throw new Error("Service description is required.");

  // 1. Create invoice
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      owner_id: input.ownerId,
      encounter_id: input.encounterId ?? null,
      status: "draft",
    })
    .select()
    .single();
  if (invErr) throw invErr;

  // 2. Add line item
  const { error: itemErr } = await supabase.from("invoice_items").insert({
    invoice_id: invoice.id,
    description: input.serviceDescription.trim(),
    quantity: 1,
    unit_price: input.amount,
    is_vatable: input.isVatable,
  });
  if (itemErr) throw itemErr;

  // 3. Compute and persist totals
  const vatAmount = input.isVatable ? input.amount * VAT_RATE : 0;
  const vatableSales = input.isVatable ? input.amount : 0;
  const vatExemptSales = input.isVatable ? 0 : input.amount;
  const totalAmount = input.amount + vatAmount;

  await supabase.from("invoices").update({
    vatable_sales: vatableSales.toFixed(2),
    vat_exempt_sales: vatExemptSales.toFixed(2),
    vat_amount: vatAmount.toFixed(2),
    total_amount: totalAmount.toFixed(2),
    status: "unpaid",
  }).eq("id", invoice.id);

  // 4. Record payment
  const { data: payment, error: payErr } = await supabase
    .from("payments")
    .insert({
      invoice_id: invoice.id,
      amount_paid: totalAmount,
      method: input.method,
      reference_number: input.referenceNumber ?? null,
      recorded_by: staff.id,
    })
    .select("receipt_number")
    .single();
  if (payErr) throw payErr;

  // 5. Mark invoice as paid
  await supabase.from("invoices").update({ status: "paid" }).eq("id", invoice.id);

  // 6. Update appointment status to "paid"
  await supabase
    .from("appointments")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("id", input.appointmentId);

  // Send transactional email
  await sendInvoicePaidEmail(invoice.id);

  revalidatePath(`/dashboard/appointments/${input.appointmentId}`);
  revalidatePath("/dashboard/billing");

  return {
    invoiceId: invoice.id,
    receiptNumber: payment.receipt_number ?? "",
  };
}

/**
 * List invoices and payment receipts belonging to the authenticated owner.
 */
export async function getOwnerInvoices(): Promise<InvoiceWithDetails[]> {
  const { profile } = await requireAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_items(*),
      payments(*),
      owner:profiles!invoices_owner_id_profiles_id_fk (id, full_name, email, phone)
    `)
    .eq("owner_id", profile.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as InvoiceWithDetails[]) ?? [];
}

/**
 * Get a specific invoice by ID for the authenticated owner or staff.
 */
export async function getOwnerInvoiceById(id: string): Promise<InvoiceWithDetails | null> {
  const { profile } = await requireAuth();
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(`
      *,
      invoice_items(*),
      payments(*),
      owner:profiles!invoices_owner_id_profiles_id_fk (id, full_name, email, phone)
    `)
    .eq("id", id);

  // If caller is an owner, strictly restrict to their own invoice
  if (profile.role === "owner") {
    query = query.eq("owner_id", profile.id);
  }

  const { data, error } = await query.single();
  if (error) return null;
  return data as InvoiceWithDetails;
}


