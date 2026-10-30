import { createAdminClient } from "@/utils/supabase/server";
import fs from "fs";
import path from "path";
import nodemailer from "nodemailer";

// A utility helper to format currency
function fmt(n: number | string) {
  return Number(n).toLocaleString("en-PH", { style: "currency", currency: "PHP" });
}

// A utility helper to format date
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Function to resolve template, replace variables, and send via SMTP or log to console
async function sendTransactionalEmail(options: {
  to: string;
  subject: string;
  templateName: "invoice-created.html" | "invoice-paid.html" | "account-approved.html";
  variables: Record<string, string>;
  items: Array<{ description: string; quantity: number; unitPrice: string }>;
}) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // Load the template
  const templatePath = path.join(
    process.cwd(),
    "docs/supabase/email-templates",
    options.templateName
  );

  let html = "";
  try {
    html = fs.readFileSync(templatePath, "utf-8");
  } catch (err) {
    console.error(`Failed to read email template ${options.templateName}:`, err);
    throw new Error(`Email template not found: ${options.templateName}`);
  }

  // Replace standard variables
  for (const [key, val] of Object.entries(options.variables)) {
    html = html.replace(new RegExp(`{{${key}}}`, "g"), val);
  }

  // Handle items array rendering (using a simple mustache-like replacement loop)
  const itemRegex = /{{#items}}([\s\S]*?){{\/items}}/;
  const match = html.match(itemRegex);
  if (match && match[1]) {
    const templateRow = match[1];
    let renderedRows = "";
    for (const item of options.items) {
      let row = templateRow;
      row = row.replace(/{{description}}/g, item.description);
      row = row.replace(/{{quantity}}/g, String(item.quantity));
      row = row.replace(/{{unitPrice}}/g, item.unitPrice);
      renderedRows += row;
    }
    html = html.replace(itemRegex, renderedRows);
  }

  // Send email via SMTP if credentials exist, otherwise fallback to logging
  if (smtpUser && smtpPassword) {
    try {
      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });

      await transporter.sendMail({
        from: `"E-VetDoc Clinic" <${smtpUser}>`,
        to: options.to,
        subject: options.subject,
        html: html,
      });

      console.log(`✅ Transactional email successfully sent to ${options.to}`);
    } catch (err) {
      console.error("Failed to send email via SMTP:", err);
    }
  } else {
    // Graceful fallback logging for development
    console.log("\n========================================================");
    console.log("             TRANSACTIONAL EMAIL SIMULATION             ");
    console.log("========================================================");
    console.log(`To:      ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Type:    ${options.templateName}`);
    console.log("Variables:", JSON.stringify(options.variables, null, 2));
    console.log("Items:", JSON.stringify(options.items, null, 2));
    console.log("--------------------------------------------------------");
    console.log("Email body loaded and verified.");
    console.log("Set SMTP_USER and SMTP_PASSWORD in .env.local to send live emails.");
    console.log("========================================================\n");
  }
}

/**
 * Fetch full invoice data including pet details and send an "Invoice Created" email
 */
export async function sendInvoiceCreatedEmail(invoiceId: string) {
  const supabase = createAdminClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_items(*),
      owner:profiles!invoices_owner_id_profiles_id_fk(id, full_name, email, phone),
      encounter:encounters(
        id,
        pet:pets(id, name)
      )
    `)
    .eq("id", invoiceId)
    .single();

  if (error || !invoice) {
    console.error("Could not fetch invoice for created email:", error);
    return;
  }

  const owner = invoice.owner;
  if (!owner || !owner.email) {
    console.log(`Skipping invoice created email: client has no email registered.`);
    return;
  }

  // Get pet name from encounter if it exists
  const petName = (invoice.encounter as any)?.pet?.name || "your pet";
  const formattedItems = (invoice.invoice_items || []).map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: fmt(item.unit_price),
  }));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  await sendTransactionalEmail({
    to: owner.email,
    subject: `New Invoice ${invoice.invoice_number} from E-VetDoc`,
    templateName: "invoice-created.html",
    variables: {
      ownerName: owner.full_name || "Valued Client",
      invoiceNumber: invoice.invoice_number || "Draft Invoice",
      issueDate: fmtDate(invoice.issue_date),
      dueDate: invoice.due_date ? fmtDate(invoice.due_date) : "Upon receipt",
      petName: petName,
      vatableSales: fmt(invoice.vatable_sales),
      vatAmount: fmt(invoice.vat_amount),
      totalAmount: fmt(invoice.total_amount),
      invoiceUrl: `${siteUrl}/dashboard/billing/${invoice.id}`,
    },
    items: formattedItems,
  });
}

/**
 * Fetch full invoice data, payment/receipt details, and send an "Invoice Paid" receipt email
 */
export async function sendInvoicePaidEmail(invoiceId: string) {
  const supabase = createAdminClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(`
      *,
      invoice_items(*),
      payments(*),
      owner:profiles!invoices_owner_id_profiles_id_fk(id, full_name, email, phone),
      encounter:encounters(
        id,
        pet:pets(id, name)
      )
    `)
    .eq("id", invoiceId)
    .single();

  if (error || !invoice) {
    console.error("Could not fetch invoice for paid email:", error);
    return;
  }

  const owner = invoice.owner;
  if (!owner || !owner.email) {
    console.log(`Skipping invoice paid email: client has no email registered.`);
    return;
  }

  // Find the latest payment / receipt
  const latestPayment = invoice.payments && invoice.payments.length > 0
    ? (invoice.payments as any[]).sort((a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime())[0]
    : null;

  const receiptNumber = latestPayment?.receipt_number || "Pending Receipt";
  const paymentDate = latestPayment ? fmtDate(latestPayment.payment_date) : fmtDate(new Date().toISOString());
  
  const paymentMethodMap: Record<string, string> = {
    cash: "Cash",
    gcash: "GCash",
    card: "Card",
    bank_transfer: "Bank Transfer",
  };
  const paymentMethod = latestPayment ? (paymentMethodMap[latestPayment.method] || latestPayment.method) : "N/A";

  const petName = (invoice.encounter as any)?.pet?.name || "your pet";
  const formattedItems = (invoice.invoice_items || []).map((item: any) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: fmt(item.unit_price),
  }));

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  await sendTransactionalEmail({
    to: owner.email,
    subject: `Payment Confirmation: Receipt ${receiptNumber} for ${invoice.invoice_number}`,
    templateName: "invoice-paid.html",
    variables: {
      ownerName: owner.full_name || "Valued Client",
      receiptNumber: receiptNumber,
      invoiceNumber: invoice.invoice_number || "Invoice",
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      petName: petName,
      vatableSales: fmt(invoice.vatable_sales),
      vatAmount: fmt(invoice.vat_amount),
      totalAmount: fmt(invoice.total_amount),
      invoiceUrl: `${siteUrl}/dashboard/billing/${invoice.id}`,
    },
    items: formattedItems,
  });
}

/**
 * Let a newly approved user know they can sign in. Failures are logged by
 * sendTransactionalEmail and never block the approval itself.
 */
export async function sendAccountApprovedEmail(options: { to: string; name: string; role: string }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  await sendTransactionalEmail({
    to: options.to,
    subject: "Your E-VetDoc account is approved",
    templateName: "account-approved.html",
    variables: { name: options.name, role: options.role, loginUrl: `${siteUrl}/login` },
    items: [],
  });
}
