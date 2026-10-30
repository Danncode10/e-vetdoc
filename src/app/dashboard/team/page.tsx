import { requireRole } from "@/services/authorization";
import { listStaff, listTrashedStaff } from "@/services/staff";
import { StaffManagement } from "@/components/staff-management";
import { ShieldCheck } from "lucide-react";

export default async function TeamPage() {
  await requireRole(["admin"]);
  const [staff, trashed] = await Promise.all([listStaff(), listTrashedStaff()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">Team Management</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add existing accounts, update roles, and deactivate clinic staff.</p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[12px] font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          Admin Only
        </div>
      </div>

      <StaffManagement staff={staff} trashed={trashed} />
    </div>
  );
}
