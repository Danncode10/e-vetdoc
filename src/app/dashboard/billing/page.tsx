import { requireRole, ADMIN_STAFF_ROLES } from "@/services/authorization";
import { listInvoices } from "@/services/billing";
import { InvoiceList } from "@/components/dashboard/billing/invoice-list";

export default async function BillingPage() {
  await requireRole(ADMIN_STAFF_ROLES);
  const invoices = await listInvoices({ limit: 100 });

  return (
    <div className="mx-auto max-w-6xl w-full px-4 py-6">
      <InvoiceList invoices={invoices} />
    </div>
  );
}
