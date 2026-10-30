import { ADMIN_STAFF_ROLES, requireRole } from "@/services/authorization";

// Only Admin and Staff create or edit schedules (they set the booking limit).
export default async function ScheduleEditorLayout({ children }: { children: React.ReactNode }) {
  await requireRole(ADMIN_STAFF_ROLES);
  return children;
}
