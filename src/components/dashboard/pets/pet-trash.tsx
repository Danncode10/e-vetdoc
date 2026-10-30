"use client";

import * as React from "react";
import { Loader2, PawPrint, RotateCcw, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { listTrashedPets, purgePet, restorePet } from "@/services/pets";

type TrashedPet = Awaited<ReturnType<typeof listTrashedPets>>[number];

function ownerNames(pet: TrashedPet) {
  return (pet.pet_owners ?? [])
    .map((link) => {
      const p = link.profiles as { full_name?: string | null; email?: string | null } | null;
      return p?.full_name || p?.email;
    })
    .filter(Boolean)
    .join(", ");
}

/** Pets in Trash: Admin/Staff restore; only Admin deletes permanently (typed confirmation). */
export function PetTrash({ role, onChanged }: { role: string; onChanged: () => void }) {
  const [pets, setPets] = React.useState<TrashedPet[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [purgeTarget, setPurgeTarget] = React.useState<TrashedPet | null>(null);

  React.useEffect(() => {
    listTrashedPets()
      .then(setPets)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Could not load Trash."))
      .finally(() => setIsLoading(false));
  }, []);

  async function restore(pet: TrashedPet) {
    setBusyId(pet.id);
    const result = await restorePet(pet.id);
    setBusyId(null);
    if (result.error !== undefined) {
      toast.error(result.error);
      return;
    }
    toast.success("Pet restored", { description: `${pet.name} is back in the Pet Registry.` });
    setPets((cur) => cur.filter((p) => p.id !== pet.id));
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
        Pets in Trash are hidden and can&apos;t be booked. Nothing has been deleted: restore them any time.
        {role === "admin" ? " Only an Administrator can delete a pet permanently." : ""}
      </p>
      {pets.length === 0 ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-8 text-center">
          <Trash2 className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
          <p className="text-sm font-medium text-foreground">Trash is empty.</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pets.map((pet) => (
            <li key={pet.id} data-testid={`trashed-pet-${pet.name}`} className="flex flex-col gap-4 rounded-2xl border border-dashed border-border bg-card p-5">
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <PawPrint className="h-4 w-4 text-primary" /> {pet.name}
                </p>
                <p className="text-xs capitalize text-muted-foreground">{[pet.species, pet.breed].filter(Boolean).join(" · ")}</p>
                {ownerNames(pet) && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5" /> {ownerNames(pet)}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" data-testid="restore-pet" className="min-h-12 gap-2" disabled={busyId === pet.id} onClick={() => restore(pet)}>
                  {busyId === pet.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Restore
                </Button>
                {role === "admin" && (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="purge-pet"
                    className="min-h-12 gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={busyId === pet.id}
                    onClick={() => setPurgeTarget(pet)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete permanently
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={Boolean(purgeTarget)}
        title={`Are you sure you want to permanently delete ${purgeTarget?.name ?? "this pet"}?`}
        description="This deletes the pet with all of its appointments, medical records (SOAP notes, diagnoses, treatments, prescriptions) and the invoices for those visits."
        confirmLabel="Delete pet permanently"
        requireTypedConfirmation="DELETE"
        isPending={busyId === purgeTarget?.id}
        onOpenChange={(open) => { if (!open && !busyId) setPurgeTarget(null); }}
        onConfirm={async () => {
          if (!purgeTarget) return;
          setBusyId(purgeTarget.id);
          const result = await purgePet(purgeTarget.id);
          setBusyId(null);
          if (result.error !== undefined) {
            toast.error(result.error);
            return;
          }
          toast.success("Pet deleted permanently", { description: `${purgeTarget.name} and its records were removed.` });
          setPets((cur) => cur.filter((p) => p.id !== purgeTarget.id));
          setPurgeTarget(null);
        }}
      />
    </div>
  );
}
