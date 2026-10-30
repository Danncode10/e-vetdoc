"use client";

import * as React from "react";
import { Check, Inbox, Loader2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import {
  approveRegistration,
  listGrantableRoles,
  listPendingRegistrations,
  rejectRegistration,
  type PendingRegistration,
} from "@/services/approvals";
import { roleLabel, type UserRole } from "@/lib/roles";

const selectClass =
  "min-h-12 w-full rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring sm:w-44";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function ApprovalsTab() {
  const [registrations, setRegistrations] = React.useState<PendingRegistration[]>([]);
  const [grantableRoles, setGrantableRoles] = React.useState<UserRole[]>([]);
  const [roleDrafts, setRoleDrafts] = React.useState<Record<string, UserRole>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<PendingRegistration | null>(null);

  React.useEffect(() => {
    const loadRegistrations = async () => {
      try {
        const [pending, roles] = await Promise.all([listPendingRegistrations(), listGrantableRoles()]);
        setRegistrations(pending);
        setGrantableRoles(roles);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load registrations.");
      } finally {
        setIsLoading(false);
      }
    };

    void loadRegistrations();
  }, []);

  function draftRoleFor(registration: PendingRegistration): UserRole {
    const draft = roleDrafts[registration.id];
    if (draft) return draft;
    if (registration.requested_role && grantableRoles.includes(registration.requested_role)) return registration.requested_role;
    return "owner";
  }

  async function runAction(id: string, action: () => Promise<{ error?: string; success?: string }>) {
    setBusyId(id);
    const result = await action();
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(result.success);
    setRejectTarget(null);
    setRegistrations((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Registration approvals</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          New accounts cannot sign in until they are approved. Review each request and confirm the role.
        </p>
      </div>

      {isLoading ? (
        <Card className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading registrations…
        </Card>
      ) : registrations.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Inbox className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-foreground">No pending registrations</p>
          <p className="text-xs text-muted-foreground">New sign-ups will appear here for approval.</p>
        </Card>
      ) : (
        <ul className="space-y-3" aria-label="Pending registrations">
          {registrations.map((registration) => {
            const requested = registration.requested_role;
            const requestedNeedsAdmin = Boolean(requested && !grantableRoles.includes(requested));
            const isBusy = busyId === registration.id;
            return (
              <li key={registration.id} data-testid={`registration-${registration.email}`}>
                <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {registration.full_name?.trim() || "Name not set"}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">{registration.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested: <span className="font-medium text-foreground">{requested ? roleLabel(requested) : "Not chosen yet"}</span>
                      {" · "}Signed up {formatDate(registration.created_at)}
                    </p>
                    {requestedNeedsAdmin && (
                      <p className="text-xs font-medium text-destructive">Only an Admin can review {roleLabel(requested)} requests.</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="sr-only" htmlFor={`approve-role-${registration.id}`}>
                      Role for {registration.email}
                    </label>
                    <select
                      id={`approve-role-${registration.id}`}
                      className={selectClass}
                      value={draftRoleFor(registration)}
                      disabled={requestedNeedsAdmin || isBusy}
                      onChange={(event) =>
                        setRoleDrafts({ ...roleDrafts, [registration.id]: event.target.value as UserRole })
                      }
                    >
                      {grantableRoles.map((role) => (
                        <option key={role} value={role}>
                          {roleLabel(role)}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="min-h-12 gap-1.5"
                      disabled={requestedNeedsAdmin || isBusy}
                      onClick={() =>
                        runAction(registration.id, () =>
                          approveRegistration({ id: registration.id, role: draftRoleFor(registration) }),
                        )
                      }
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-12 gap-1.5 text-destructive"
                      disabled={requestedNeedsAdmin || isBusy}
                      onClick={() => setRejectTarget(registration)}
                    >
                      <X className="h-4 w-4" />
                      Disapprove
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmationDialog
        open={Boolean(rejectTarget)}
        title={`Disapprove ${rejectTarget?.email ?? "this registration"}?`}
        description="They will not be able to sign in. This cannot be undone from the dashboard."
        confirmLabel="Disapprove registration"
        isPending={Boolean(rejectTarget && busyId === rejectTarget.id)}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        onConfirm={() => {
          if (rejectTarget) void runAction(rejectTarget.id, () => rejectRegistration({ id: rejectTarget.id }));
        }}
      />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <UserCheck className="h-4 w-4 text-primary" /> Approvals and disapprovals are recorded in Logs.
      </p>
    </div>
  );
}
