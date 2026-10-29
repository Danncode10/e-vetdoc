"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, ShieldCheck, Stethoscope, UserCog, UserPlus, UserRoundCheck, UserRoundX, X, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { addExistingStaff, setStaffActive, updateStaffRole, type StaffMember } from "@/services/staff";

type StaffRole = "admin" | "staff" | "veterinarian";
type ManageableRole = StaffRole | "owner";

const inputClass = "min-h-12 w-full rounded-xl border border-input bg-card px-3.5 text-sm text-foreground outline-none ring-ring transition-all focus-visible:ring-2 focus-visible:border-primary";

const roleBadgeStyles: Record<StaffRole, string> = {
  admin: "bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  staff: "bg-muted text-foreground border-border",
  veterinarian: "bg-teal-50 text-teal-900 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
};

function RoleBadge({ role }: { role: StaffRole }) {
  const Icon = role === "admin" ? ShieldCheck : role === "staff" ? UserCog : Stethoscope;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${roleBadgeStyles[role]}`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0 text-primary" />
      {roleLabel(role)}
    </span>
  );
}

function roleLabel(role: ManageableRole) {
  if (role === "admin") return "Administrator";
  if (role === "staff") return "Staff";
  if (role === "veterinarian") return "Veterinarian";
  return "Pet owner";
}

function staffName(member: StaffMember) {
  return member.full_name?.trim() || "Name not set";
}

const roleOptions: Array<{
  value: ManageableRole;
  label: string;
  description: string;
  Icon: typeof ShieldCheck;
}> = [
  { value: "veterinarian", label: "Veterinarian", description: "Can access clinic staff tools and manage clinical records.", Icon: Stethoscope },
  { value: "staff", label: "Staff", description: "Runs the front desk: approvals, appointments, schedules, and billing. Cannot manage the team.", Icon: UserCog },
  { value: "admin", label: "Administrator", description: "Can manage staff, access clinic settings, and oversee data.", Icon: ShieldCheck },
  { value: "owner", label: "Pet owner", description: "Removes clinic-staff access while keeping the personal account active.", Icon: UserRoundCheck },
];

export function StaffManagement({ staff }: { staff: StaffMember[] }) {
  const [isPending, startTransition] = useTransition();
  const [newStaff, setNewStaff] = useState({ email: "", role: "veterinarian" as StaffRole });
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, ManageableRole>>({});
  const [confirmation, setConfirmation] = useState<
    | { id: string; kind: "role"; nextRole: ManageableRole }
    | { id: string; kind: "status"; nextIsActive: boolean }
    | null
  >(null);

  const activeAdminCount = staff.filter((member) => member.role === "admin" && member.is_active).length;
  const activeVetCount = staff.filter((member) => member.role === "veterinarian" && member.is_active).length;
  const activeTotalCount = staff.filter((member) => member.is_active).length;

  function run(action: () => Promise<{ error?: string; success?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.success) toast.success(result.success);
      setConfirmation(null);
      setEditingRoleId(null);
    });
  }

  function isFinalActiveAdmin(member: StaffMember) {
    return member.role === "admin" && member.is_active && activeAdminCount <= 1;
  }

  const statusConfirmation = confirmation?.kind === "status" ? confirmation : null;
  const confirmedMember = statusConfirmation ? staff.find((member) => member.id === statusConfirmation.id) : null;

  return (
    <div className="space-y-6 pb-6">
      {/* Team Summary Counter Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Active Staff</p>
            <p className="text-xl font-bold text-foreground">{activeTotalCount}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Administrators</p>
            <p className="text-xl font-bold text-foreground">{activeAdminCount}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Veterinarians</p>
            <p className="text-xl font-bold text-foreground">{activeVetCount}</p>
          </div>
        </div>
      </div>

      {/* Add Staff Section */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-5">
        <div>
          <h3 className="text-lg font-bold tracking-tight text-foreground">Add a Team Member</h3>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            The team member must have an active E-VetDoc account. Enter their registered email address to assign a clinic role.
          </p>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const result = await addExistingStaff(newStaff);
              if (result.success) setNewStaff({ email: "", role: "veterinarian" });
              return result;
            });
          }}
        >
          <label className="space-y-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
            Email Address
            <input
              className={inputClass}
              type="email"
              placeholder="e.g. vet@clinic.com"
              value={newStaff.email}
              onChange={(event) => setNewStaff({ ...newStaff, email: event.target.value })}
              required
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
            Staff Role
            <select
              className={inputClass}
              value={newStaff.role}
              onChange={(event) => setNewStaff({ ...newStaff, role: event.target.value as StaffRole })}
            >
              <option value="veterinarian">Veterinarian</option>
              <option value="staff">Staff</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <div className="sm:col-span-2 pt-1">
            <Button className="w-full sm:w-auto min-h-12 px-6 gap-2" type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Add to Clinic Team
            </Button>
          </div>
        </form>
      </section>

      {/* Staff Roster */}
      <section className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border space-y-1">
          <h3 className="text-lg font-bold text-foreground">Clinic Staff Roster</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage active roles, permissions, or suspend staff access.
          </p>
        </div>

        {staff.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
            <UserRoundCheck className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">No staff accounts added yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {staff.map((member) => {
              const currentRole = member.role as StaffRole;
              const draftRole = roleDrafts[member.id] ?? currentRole;
              const editingRole = editingRoleId === member.id;
              const memberConfirmation = confirmation?.id === member.id ? confirmation : null;
              const finalAdmin = isFinalActiveAdmin(member);

              return (
                <article key={member.id} className="p-4 sm:p-6 space-y-4 hover:bg-muted/10 transition-colors">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-bold text-foreground">{staffName(member)}</p>
                        <RoleBadge role={currentRole} />
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            member.is_active
                              ? "bg-green-500/10 text-green-700 dark:text-green-400"
                              : "bg-red-500/10 text-red-700 dark:text-red-400"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${member.is_active ? "bg-green-500" : "bg-red-500"}`} />
                          {member.is_active ? "Active" : "Deactivated"}
                        </span>
                      </div>
                      <p className="truncate text-xs sm:text-sm text-muted-foreground">
                        {member.email ?? "No email recorded"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1 sm:flex-initial gap-1.5 text-xs h-9"
                        disabled={isPending}
                        onClick={() => {
                          setConfirmation(null);
                          setRoleDrafts({ ...roleDrafts, [member.id]: currentRole });
                          setEditingRoleId(editingRole ? null : member.id);
                        }}
                      >
                        <UserCog className="w-3.5 h-3.5" />
                        Change Role
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={`flex-1 sm:flex-initial gap-1.5 text-xs h-9 ${
                          member.is_active
                            ? "text-destructive hover:text-destructive hover:bg-destructive/10"
                            : "text-primary hover:bg-primary/10"
                        }`}
                        disabled={isPending}
                        onClick={() => {
                          setEditingRoleId(null);
                          setConfirmation({ id: member.id, kind: "status", nextIsActive: !member.is_active });
                        }}
                      >
                        {member.is_active ? <UserRoundX className="w-3.5 h-3.5" /> : <UserRoundCheck className="w-3.5 h-3.5" />}
                        {member.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </div>

                  {/* Role Selector Drawer */}
                  {editingRole && (
                    <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-3">
                      <fieldset>
                        <legend className="text-xs font-bold text-foreground uppercase tracking-wider mb-2">
                          Select New Role for {staffName(member)}
                        </legend>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {roleOptions.map(({ value, label, description, Icon }) => (
                            <label key={value} className="block cursor-pointer">
                              <input
                                checked={draftRole === value}
                                className="peer sr-only"
                                name={`staff-role-${member.id}`}
                                onChange={() => setRoleDrafts({ ...roleDrafts, [member.id]: value })}
                                type="radio"
                                value={value}
                              />
                              <div className="flex flex-col p-3 rounded-xl border border-border bg-card transition-all peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:ring-2 peer-checked:ring-primary h-full">
                                <div className="flex items-center gap-2 mb-1">
                                  <Icon className="w-4 h-4 text-primary shrink-0" />
                                  <span className="text-xs font-bold text-foreground">{label}</span>
                                </div>
                                <span className="text-[11px] text-muted-foreground leading-tight">
                                  {description}
                                </span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <div className="flex gap-2 justify-end pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setEditingRoleId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5"
                          disabled={isPending || draftRole === currentRole}
                          onClick={() => setConfirmation({ id: member.id, kind: "role", nextRole: draftRole })}
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Save Role
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Confirmation callout */}
                  {memberConfirmation?.kind === "role" && (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                        <div className="space-y-1 text-xs">
                          <p className="font-bold text-foreground">
                            {memberConfirmation.nextRole === "owner"
                              ? `Return ${staffName(member)} to pet-owner access?`
                              : `Change ${staffName(member)} to ${roleLabel(memberConfirmation.nextRole)}?`}
                          </p>
                          <p className="text-muted-foreground">
                            {memberConfirmation.nextRole === "owner"
                              ? "This removes clinic-staff privileges but keeps their personal E-VetDoc profile intact."
                              : finalAdmin && memberConfirmation.nextRole !== "admin"
                              ? "This is the last active administrator. Please assign another admin before changing this role."
                              : "This role update will take effect immediately."}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setConfirmation(null)}>
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isPending || (finalAdmin && memberConfirmation.nextRole !== "admin")}
                          onClick={() => {
                            run(() => updateStaffRole({ id: member.id, role: memberConfirmation.nextRole }));
                          }}
                        >
                          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          Confirm Change
                        </Button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmationDialog
        open={Boolean(statusConfirmation && confirmedMember)}
        title={`${statusConfirmation?.nextIsActive ? "Reactivate" : "Deactivate"} ${confirmedMember ? staffName(confirmedMember) : "staff member"}?`}
        description={
          statusConfirmation?.nextIsActive
            ? "This restores full dashboard access for this team member."
            : "This suspends dashboard access for this team member while preserving their account record."
        }
        confirmLabel={statusConfirmation?.nextIsActive ? "Reactivate staff member" : "Deactivate staff member"}
        isPending={isPending}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        onConfirm={() => {
          if (!statusConfirmation) return;
          run(() => setStaffActive({ id: statusConfirmation.id, isActive: statusConfirmation.nextIsActive }));
        }}
      />
    </div>
  );
}

