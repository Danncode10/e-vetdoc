"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RotateCcw, ShieldCheck, Stethoscope, Trash2, UserCog, UserPlus, UserRoundCheck, UserRoundX, X, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  addExistingStaff,
  purgeStaffMember,
  restoreStaffMember,
  setStaffActive,
  trashStaffMember,
  updateStaffRole,
  type StaffMember,
  type TrashedStaffMember,
} from "@/services/staff";
import { isOnline, lastSeenLabel, PRESENCE_HEARTBEAT_MS } from "@/lib/presence";

type StaffRole = "admin" | "staff" | "veterinarian";
type ManageableRole = StaffRole | "owner";
type PresenceFilter = "all" | "online" | "offline";

const PRESENCE_FILTERS: Array<{ id: PresenceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
];

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

/** A deactivated account cannot open the dashboard, so it always counts as offline. */
function isMemberOnline(member: StaffMember, now: number) {
  return member.is_active && isOnline(member.last_seen_at, now);
}

function PresenceBadge({ member, now }: { member: StaffMember; now: number }) {
  if (!member.is_active) {
    return (
      <span
        data-testid="staff-presence"
        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive"
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-destructive" />
        Deactivated
      </span>
    );
  }
  const online = isOnline(member.last_seen_at, now);
  return (
    <span
      data-testid="staff-presence"
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
        online ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      }`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${online ? "bg-primary" : "bg-muted-foreground/50"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}

export function StaffManagement({ staff, trashed = [] }: { staff: StaffMember[]; trashed?: TrashedStaffMember[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [presence, setPresence] = useState<PresenceFilter>("all");
  const [trashTarget, setTrashTarget] = useState<StaffMember | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<TrashedStaffMember | null>(null);
  const [now, setNow] = useState(() => Date.now());
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
  const onlineCount = staff.filter((member) => isMemberOnline(member, now)).length;
  const presenceCounts: Record<PresenceFilter, number> = {
    all: staff.length,
    online: onlineCount,
    offline: staff.length - onlineCount,
  };
  const visibleStaff = staff.filter((member) => {
    if (presence === "all") return true;
    return isMemberOnline(member, now) === (presence === "online");
  });

  // Keep Online/Offline current while the Team page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [router]);

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
      setTrashTarget(null);
      setPurgeTarget(null);
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
            <p className="text-xs text-muted-foreground font-medium">Staff</p>
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
          <div className="flex flex-wrap gap-2 pt-3" role="group" aria-label="Filter staff by online status">
            {PRESENCE_FILTERS.map((filter) => (
              <Button
                key={filter.id}
                type="button"
                variant={presence === filter.id ? "default" : "outline"}
                aria-pressed={presence === filter.id}
                data-testid={`staff-filter-${filter.id}`}
                className="min-h-12 gap-2 rounded-xl px-4"
                onClick={() => setPresence(filter.id)}
              >
                {filter.id !== "all" && (
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${filter.id === "online" ? "bg-primary" : "bg-muted-foreground/50"}`}
                  />
                )}
                {filter.label}
                <span className="rounded-full bg-background/20 px-1.5 text-xs font-semibold">{presenceCounts[filter.id]}</span>
              </Button>
            ))}
          </div>
        </div>

        {staff.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
            <UserRoundCheck className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">No staff accounts added yet.</p>
          </div>
        ) : visibleStaff.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 p-8 text-center">
            <Users className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">
              {presence === "online" ? "No clinic staff are online right now." : "Every clinic staff member is online right now."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {visibleStaff.map((member) => {
              const currentRole = member.role as StaffRole;
              const draftRole = roleDrafts[member.id] ?? currentRole;
              const editingRole = editingRoleId === member.id;
              const memberConfirmation = confirmation?.id === member.id ? confirmation : null;
              const finalAdmin = isFinalActiveAdmin(member);

              return (
                <article key={member.id} data-testid={`staff-card-${member.email}`} className="p-4 sm:p-6 space-y-4 hover:bg-muted/10 transition-colors">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-base font-bold text-foreground">{staffName(member)}</p>
                        <RoleBadge role={currentRole} />
                        <PresenceBadge member={member} now={now} />
                      </div>
                      <p className="truncate text-xs sm:text-sm text-muted-foreground">
                        {member.email ?? "No email recorded"}
                      </p>
                      {member.is_active && member.last_seen_at && !isOnline(member.last_seen_at, now) && (
                        <p data-testid="staff-last-seen" className="text-xs text-muted-foreground">
                          {lastSeenLabel(member.last_seen_at, now)}
                        </p>
                      )}
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
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-testid="trash-staff"
                        className="flex-1 sm:flex-initial gap-1.5 text-xs h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={isPending}
                        onClick={() => setTrashTarget(member)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Trash
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

      {/* Team Trash */}
      <section data-testid="team-trash" className="rounded-2xl border border-dashed border-border bg-card overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border space-y-1">
          <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Trash2 className="h-5 w-5 text-muted-foreground" /> Trash
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Team members in Trash can&apos;t sign in. Nothing is deleted until you choose Delete permanently.
          </p>
        </div>
        {trashed.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
            <Trash2 className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">Trash is empty.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {trashed.map((member) => (
              <li
                key={member.id}
                data-testid={`trashed-staff-${member.email}`}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-base font-bold text-foreground">{staffName(member)}</p>
                    <RoleBadge role={member.role as StaffRole} />
                  </div>
                  <p className="truncate text-xs sm:text-sm text-muted-foreground">{member.email ?? "No email recorded"}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    data-testid="restore-staff"
                    className="flex-1 sm:flex-initial gap-1.5 min-h-12 sm:min-h-9"
                    disabled={isPending}
                    onClick={() => run(() => restoreStaffMember(member.id))}
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restore
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="purge-staff"
                    className="flex-1 sm:flex-initial gap-1.5 min-h-12 sm:min-h-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={isPending}
                    onClick={() => setPurgeTarget(member)}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete permanently
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmationDialog
        open={Boolean(trashTarget)}
        title={`Move ${trashTarget ? staffName(trashTarget) : "this team member"} to Trash?`}
        description="They are signed out and removed from the roster. Nothing is deleted: you can restore them from Trash at any time."
        confirmLabel="Move to Trash"
        isPending={isPending}
        onOpenChange={(open) => { if (!open) setTrashTarget(null); }}
        onConfirm={() => { if (trashTarget) run(() => trashStaffMember(trashTarget.id)); }}
      />

      <ConfirmationDialog
        open={Boolean(purgeTarget)}
        title={`Are you sure you want to permanently delete ${purgeTarget ? staffName(purgeTarget) : "this team member"}?`}
        description="This deletes their login and profile. Team members who wrote medical or billing records can't be deleted (those records belong to patients' history); keep them in Trash instead."
        confirmLabel="Delete permanently"
        requireTypedConfirmation="DELETE"
        isPending={isPending}
        onOpenChange={(open) => { if (!open) setPurgeTarget(null); }}
        onConfirm={() => { if (purgeTarget) run(() => purgeStaffMember(purgeTarget.id)); }}
      />

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

