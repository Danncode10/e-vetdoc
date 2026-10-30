import { requireRole, ADMIN_STAFF_ROLES } from "@/services/authorization";
import { createClient } from "@/utils/supabase/server";
import { InvoiceBuilder } from "@/components/dashboard/billing/invoice-builder";

export default async function NewInvoicePage() {
  await requireRole(ADMIN_STAFF_ROLES);
  const supabase = await createClient();

  // Fetch all owner profiles for the owner selector
  const { data: owners } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("role", "owner")
    .eq("is_active", true)
    .order("full_name");

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-6">
      <InvoiceBuilder owners={owners ?? []} />
    </div>
  );
}
