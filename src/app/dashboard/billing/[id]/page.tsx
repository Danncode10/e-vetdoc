import { requireRole, CLINIC_ROLES } from "@/services/authorization";
import { getInvoiceById } from "@/services/billing";
import { notFound } from "next/navigation";
import { InvoiceDetail } from "@/components/dashboard/billing/invoice-detail";

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(CLINIC_ROLES);
  const { id } = await params;

  const invoice = await getInvoiceById(id);
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-4xl w-full px-4 py-6">
      <InvoiceDetail invoice={invoice} />
    </div>
  );
}
