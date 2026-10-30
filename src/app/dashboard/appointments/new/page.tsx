import { AppointmentRequestForm } from "@/components/dashboard/appointment-request-form";
import { requireRole, CLINIC_ROLES } from "@/services/authorization";

export default async function NewAppointmentPage() {
  await requireRole(["owner", ...CLINIC_ROLES]);
  return <AppointmentRequestForm />;
}