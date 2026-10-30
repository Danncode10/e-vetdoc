"use client";

import * as React from "react";
import { PawPrint, Pencil, Plus, Search, Calendar, User, Dog, Cat, Sparkles, X, ExternalLink, Stethoscope, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PetTrash } from "@/components/dashboard/pets/pet-trash";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PetForm } from "@/components/dashboard/pets/pet-form";
import { OwnerPetMedicalDialog } from "@/components/dashboard/pets/owner-pet-medical-dialog";
import { listPetsForCurrentUser, trashPet, updateOwnedPet, type PetFormInput } from "@/services/pets";
import type { UserRole } from "@/lib/dashboard-features";

type PetRecord = Awaited<ReturnType<typeof listPetsForCurrentUser>>[number];
type PetOwnerLink = {
  owner_profile_id: string;
  is_primary_contact: boolean;
};

function toPetForm(pet: PetRecord): PetFormInput {
  return {
    name: pet.name,
    species: pet.species,
    speciesDetail: pet.species_detail ?? "",
    breed: pet.breed ?? "",
    sex: pet.sex,
    dateOfBirth: pet.date_of_birth ?? "",
    age: pet.age?.toString() ?? "",
    color: pet.color ?? "",
    notes: pet.notes ?? "",
  };
}

function primaryOwnerId(pet: PetRecord): string | null {
  const ownerLinks = pet.pet_owners as unknown as PetOwnerLink[];
  return ownerLinks.find((link) => link.is_primary_contact)?.owner_profile_id ?? ownerLinks[0]?.owner_profile_id ?? null;
}

function SpeciesBadge({ species, detail }: { species: string; detail?: string | null }) {
  const isDog = species.toLowerCase() === "dog";
  const isCat = species.toLowerCase() === "cat";
  const label = species === "other" && detail ? detail : species;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold border capitalize ${
        isDog
          ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
          : isCat
          ? "bg-purple-50 text-purple-900 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800"
          : "bg-teal-50 text-teal-900 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800"
      }`}
    >
      {isDog ? (
        <Dog className="w-3.5 h-3.5 shrink-0" />
      ) : isCat ? (
        <Cat className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <PawPrint className="w-3.5 h-3.5 shrink-0" />
      )}
      {label}
    </span>
  );
}

export function PetsTab({ role }: { role: UserRole }) {
  const router = useRouter();
  const [pets, setPets] = React.useState<PetRecord[]>([]);
  const [query, setQuery] = React.useState("");
  const [speciesFilter, setSpeciesFilter] = React.useState<string>("all");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [editingPet, setEditingPet] = React.useState<PetRecord | null>(null);
  const [selectedMedicalPet, setSelectedMedicalPet] = React.useState<PetRecord | null>(null);
  const [view, setView] = React.useState<"registry" | "trash">("registry");
  const [trashTarget, setTrashTarget] = React.useState<PetRecord | null>(null);
  const [isTrashing, setIsTrashing] = React.useState(false);
  const canTrash = role === "admin" || role === "staff";

  const loadPets = React.useCallback(async () => {
    try {
      const records = await listPetsForCurrentUser();
      setPets(records);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not load the pet registry.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void loadPets(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPets]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPets = pets.filter((pet) => {
    const matchesSearch = [pet.name, pet.species, pet.species_detail, pet.breed]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);

    const matchesSpecies =
      speciesFilter === "all"
        ? true
        : pet.species.toLowerCase() === speciesFilter.toLowerCase();

    return matchesSearch && matchesSpecies;
  });

  const canEdit = role === "owner" || role === "admin" || role === "staff";
  const canOpenRecord = role === "admin" || role === "staff" || role === "veterinarian";

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Pet Registry</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {role === "owner"
              ? "Keep records updated for your registered pets."
              : "Search patient profiles and inspect clinical records."}
          </p>
        </div>
        {canTrash && (
          <div className="flex gap-2" role="group" aria-label="Pet Registry or Trash">
            <Button
              type="button"
              data-testid="view-pets"
              variant={view === "registry" ? "default" : "outline"}
              aria-pressed={view === "registry"}
              className="min-h-12 gap-2"
              onClick={() => setView("registry")}
            >
              <PawPrint className="h-4 w-4" /> Pets
            </Button>
            <Button
              type="button"
              data-testid="view-pet-trash"
              variant={view === "trash" ? "default" : "outline"}
              aria-pressed={view === "trash"}
              className="min-h-12 gap-2"
              onClick={() => setView("trash")}
            >
              <Trash2 className="h-4 w-4" /> Trash
            </Button>
          </div>
        )}
        {role === "owner" && (
          <Button
            onClick={() => router.push("/dashboard/pets/new")}
            className="w-full sm:w-auto gap-2 min-h-12 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add New Pet
          </Button>
        )}
      </div>

      {view === "trash" ? (
        <PetTrash role={role ?? ""} onChanged={() => void loadPets()} />
      ) : (
      <>
      {/* Controls: Search + Filter Pills */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, species, or breed…"
            className="min-h-12 w-full rounded-xl border border-input bg-card pl-10 pr-10 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Species Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: "all", label: "All Species" },
            { id: "dog", label: "Dogs" },
            { id: "cat", label: "Cats" },
            { id: "other", label: "Exotic & Other" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSpeciesFilter(item.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors shrink-0 ${
                speciesFilter === item.id
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {editingPet && (
        <PetForm
          initialValue={toPetForm(editingPet)}
          title="Update pet details"
          description="Only information you are permitted to manage can be changed here."
          submitLabel="Save changes"
          onCancel={() => setEditingPet(null)}
          onSubmit={async (value) => {
            await updateOwnedPet(editingPet.id, value);
            setEditingPet(null);
            setIsLoading(true);
            await loadPets();
          }}
        />
      )}

      {/* Patients Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : filteredPets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <PawPrint className="mx-auto h-10 w-10 text-muted-foreground mb-3" strokeWidth={1.5} />
          <p className="font-semibold text-foreground">
            {query || speciesFilter !== "all" ? "No pets match your criteria." : "No pets registered yet."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {query || speciesFilter !== "all"
              ? "Try resetting your search or species filter."
              : "Add your first pet to start tracking medical records."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filteredPets.map((pet) => {
            const ownerProfileId = primaryOwnerId(pet);
            return (
              <div
                key={pet.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md"
              >
                {/* Header */}
                <div className="p-5 flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-foreground leading-tight">
                          {pet.name}
                        </h3>
                        <SpeciesBadge species={pet.species} detail={pet.species_detail} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[pet.breed, pet.sex].filter(Boolean).join(" · ")}
                      </p>
                    </div>

                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-xs hover:bg-muted text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingPet(pet)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </Button>
                    )}
                  </div>

                  {/* Info Metadata */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-border/60">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span className="truncate">
                        {pet.age !== null && pet.age !== undefined
                          ? `Age: ${pet.age} ${pet.age === 1 ? "year" : "years"}`
                          : pet.date_of_birth
                          ? (() => {
                              const d = new Date(pet.date_of_birth);
                              if (isNaN(d.getTime())) return "Age: Unknown";
                              const today = new Date();
                              let y = today.getFullYear() - d.getFullYear();
                              const m = today.getMonth() - d.getMonth();
                              if (m < 0 || (m === 0 && today.getDate() < d.getDate())) y--;
                              const calc = Math.max(0, y);
                              return `Age: ${calc} ${calc === 1 ? "year" : "years"}`;
                            })()
                          : "Age: Unknown"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-primary" />
                      <span className="truncate capitalize">{pet.color || "Color: Unknown"}</span>
                    </div>
                  </div>

                  {/* Owners list for staff */}
                  {role !== "owner" && pet.pet_owners && pet.pet_owners.length > 0 && (
                    <div className="pt-2 border-t border-border/60">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Pet Owners
                      </p>
                      <div className="space-y-1">
                        {pet.pet_owners.map((link: any) => (
                          <div key={link.id} className="flex items-center gap-2 text-xs text-foreground">
                            <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">
                              {link.profiles?.full_name || link.profiles?.email || "Owner profile"}
                            </span>
                            {link.is_primary_contact && (
                              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.2 rounded">
                                Primary
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Action */}
                {canOpenRecord ? (
                  <div className="border-t border-border px-5 py-3 bg-muted/20 flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 text-xs h-9"
                      disabled={!ownerProfileId}
                      onClick={() => ownerProfileId && router.push(`/user/${ownerProfileId}/pet/${pet.id}?from=pets`)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Clinical Pet Record
                    </Button>
                    {canTrash && (
                      <Button
                        type="button"
                        variant="ghost"
                        data-testid={`trash-pet-${pet.name}`}
                        className="w-full gap-2 text-xs min-h-12 sm:min-h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setTrashTarget(pet)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Move to Trash
                      </Button>
                    )}
                  </div>
                ) : role === "owner" ? (
                  <div className="border-t border-border px-5 py-3 bg-muted/20 flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1 gap-2 text-xs h-9 font-semibold"
                      onClick={() => setSelectedMedicalPet(pet)}
                    >
                      <Stethoscope className="w-3.5 h-3.5 text-primary" />
                      Health & Medical Records
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      </>
      )}

      <ConfirmationDialog
        open={Boolean(trashTarget)}
        title={`Move ${trashTarget?.name ?? "this pet"} to Trash?`}
        description="The pet is hidden and can't be booked. Nothing is deleted: you can restore it from Trash at any time."
        confirmLabel="Move to Trash"
        isPending={isTrashing}
        onOpenChange={(open) => { if (!open && !isTrashing) setTrashTarget(null); }}
        onConfirm={async () => {
          if (!trashTarget) return;
          setIsTrashing(true);
          const result = await trashPet(trashTarget.id);
          setIsTrashing(false);
          if (result.error !== undefined) {
            toast.error(result.error);
            return;
          }
          toast.success("Moved to Trash", { description: `${trashTarget.name} can be restored from Trash.` });
          setPets((cur) => cur.filter((p) => p.id !== trashTarget.id));
          setTrashTarget(null);
        }}
      />

      {/* Owner Medical Record Dialog */}
      {selectedMedicalPet && (
        <OwnerPetMedicalDialog
          open={Boolean(selectedMedicalPet)}
          onOpenChange={(open) => {
            if (!open) setSelectedMedicalPet(null);
          }}
          pet={selectedMedicalPet}
        />
      )}
    </div>
  );
}

