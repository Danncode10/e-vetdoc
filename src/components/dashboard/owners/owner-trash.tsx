"use client";

import * as React from "react";
import { Loader2, Mail, PawPrint, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { deleteOwnerCompletely, listTrashedOwners, restoreOwner } from "@/services/pets";

type TrashedOwner = Awaited<ReturnType<typeof listTrashedOwners>>[number];

function fmtDateTime(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** Owners moved to Trash: Admin/Staff restore them; only Admin deletes permanently. */
export function OwnerTrash({ role, onChanged }: { role: string; onChanged: () => void }) {
  const [owners, setOwners] = React.useState<TrashedOwner[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = React.useState<TrashedOwner | null>(null);

  const load = React.useCallback(async () => {
    try {
      setOwners(await listTrashedOwners());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load Trash.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function restore(owner: TrashedOwner) {
    setBusyId(owner.id);
    const result = await restoreOwner(owner.id);
    setBusyId(null);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Owner restored", { description: `${owner.email ?? "The account"} is back in the Owner Directory and can sign in again.` });
    setOwners((current) => current.filter((o) => o.id !== owner.id));
    onChanged();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Owners in Trash can&apos;t sign in and are hidden from the directory. Nothing has been deleted: restore them any time.
        {role === "admin" ? " Only an Administrator can delete an owner permanently." : ""}
      </p>

      {owners.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <Trash2 className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">Trash is empty.</p>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {owners.map((owner) => {
            const trashedBy = owner.deleted_by_profile as { full_name?: string | null; email?: string | null } | null;
            const petCount = owner.pet_owners?.length ?? 0;
            return (
              <li
                key={owner.id}
                data-testid={`trashed-owner-${owner.email}`}
                className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-card p-5"
              >
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">{owner.full_name || "Owner profile"}</p>
                  {owner.email && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3.5 w-3.5" /> {owner.email}
                    </p>
                  )}
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <PawPrint className="h-3.5 w-3.5" /> {petCount} {petCount === 1 ? "pet" : "pets"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Moved to Trash {fmtDateTime(owner.deleted_at)}
                    {trashedBy ? ` by ${trashedBy.full_name || trashedBy.email}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    data-testid="restore-owner"
                    className="min-h-12 flex-1 gap-2"
                    disabled={busyId === owner.id}
                    onClick={() => restore(owner)}
                  >
                    {busyId === owner.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Restore
                  </Button>
                  {role === "admin" && (
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="purge-owner"
                      className="min-h-12 flex-1 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busyId === owner.id}
                      onClick={() => setPurgeTarget(owner)}
                    >
                      <Trash2 className="h-4 w-4" /> Delete permanently
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmationDialog
        open={Boolean(purgeTarget)}
        title={`Are you sure you want to permanently delete ${purgeTarget?.full_name || purgeTarget?.email || "this owner"}?`}
        description="This deletes the owner's login, profile, pets they alone own, appointments, medical records, invoices and payments. Pets shared with another owner are kept."
        confirmLabel="Delete owner permanently"
        requireTypedConfirmation="DELETE"
        isPending={busyId === purgeTarget?.id}
        onOpenChange={(open) => {
          if (!open && !busyId) setPurgeTarget(null);
        }}
        onConfirm={async () => {
          if (!purgeTarget) return;
          setBusyId(purgeTarget.id);
          const result = await deleteOwnerCompletely(purgeTarget.id);
          setBusyId(null);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Owner deleted permanently", { description: `${purgeTarget.email ?? "The account"} and all of its data were removed.` });
          setOwners((current) => current.filter((o) => o.id !== purgeTarget.id));
          setPurgeTarget(null);
        }}
      />
    </div>
  );
}
