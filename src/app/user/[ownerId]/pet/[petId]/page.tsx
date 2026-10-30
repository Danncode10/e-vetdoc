import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  Calendar,
  User,
  Stethoscope,
  ExternalLink,
  Clock,
} from "lucide-react";
import { getStaffPetRecord } from "@/services/pets";
import { getPetClinicalHistory } from "@/services/clinical";
import { requireRole, CLINIC_ROLES } from "@/services/authorization";
import { notFound } from "next/navigation";

function fmtDate(isoOrDate: string | Date | null | undefined) {
  if (!isoOrDate) return "Date not recorded";
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return String(isoOrDate);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  booked: {
    label: "Booked",
    badge: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
  },
  diagnosed: {
    label: "Diagnosed",
    badge: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  },
  paid: {
    label: "Paid",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  },
  completed: {
    label: "Completed",
    badge: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  },
};

export default async function PetRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ ownerId: string; petId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireRole(CLINIC_ROLES);
  const { ownerId, petId } = await params;
  const resolvedSearchParams = await searchParams;
  const isFromPets = resolvedSearchParams?.from === "pets";

  const [pet, clinicalHistory] = await Promise.all([
    getStaffPetRecord(ownerId, petId),
    getPetClinicalHistory(petId).catch(() => []),
  ]);

  if (!pet) notFound();

  const backHref = isFromPets ? "/dashboard?tab=pets" : `/user/${ownerId}`;
  const backLabel = isFromPets ? "Back to pets" : "Back to owner record";

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-12">
      {/* Back Navigation Link */}
      <Link
        href={backHref}
        className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group"
      >
        <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" aria-hidden="true" />
        {backLabel}
      </Link>

      {/* Header */}
      <header className="border-b border-border pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Pet Clinical File</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">{pet.name}</h1>
        <p className="mt-2 text-sm capitalize text-muted-foreground">
          {[pet.species === "other" ? pet.species_detail : pet.species, pet.breed, pet.sex].filter(Boolean).join(" · ")}
        </p>
      </header>

      {/* Pet Demographics Grid */}
      <dl className="grid gap-4 rounded-2xl border border-border bg-card p-5 text-sm sm:grid-cols-2 lg:grid-cols-4 shadow-xs">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Date of birth</dt>
          <dd className="mt-1 font-semibold text-foreground">{pet.date_of_birth ? fmtDate(pet.date_of_birth) : "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Age</dt>
          <dd className="mt-1 font-semibold text-foreground">
            {pet.age === null || pet.age === undefined ? "Unknown" : `${pet.age} ${pet.age === 1 ? "year" : "years"}`}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Colour</dt>
          <dd className="mt-1 font-semibold capitalize text-foreground">{pet.color ?? "Unknown"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-muted-foreground">Notes</dt>
          <dd className="mt-1 font-semibold text-foreground truncate" title={pet.notes ?? undefined}>
            {pet.notes ?? "No notes recorded"}
          </dd>
        </div>
      </dl>

      {/* Pet Owners Section */}
      <section aria-labelledby="owners-heading" className="space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 id="owners-heading" className="text-base font-semibold text-foreground flex items-center gap-2">
            <User className="size-4 text-primary" /> Pet Owners
          </h2>
          <span className="text-xs text-muted-foreground font-medium">
            {pet.owners.length} {pet.owners.length === 1 ? "Owner" : "Owners"}
          </span>
        </div>
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {pet.owners.map((owner: any) => (
            <li
              key={owner.id}
              className="flex min-h-14 flex-col justify-center gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs">
                  {owner.fullName ? owner.fullName.charAt(0).toUpperCase() : "O"}
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">{owner.fullName || owner.email || "Owner profile"}</p>
                  {owner.email && <p className="text-xs text-muted-foreground">{owner.email}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs capitalize text-muted-foreground">
                  {owner.relationship.replace("_", " ")}
                </span>
                {owner.isPrimaryContact && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Primary Contact
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Medical Records & Clinical History Section */}
      <section aria-labelledby="medical-record-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" aria-hidden="true" />
            <h2 id="medical-record-heading" className="text-lg font-semibold text-foreground">
              Medical Records & Clinical History
            </h2>
          </div>
          <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
            {clinicalHistory.length} {clinicalHistory.length === 1 ? "Record" : "Records"}
          </span>
        </div>

        {clinicalHistory.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center">
            <ClipboardList className="mx-auto size-10 text-muted-foreground/50 mb-3" strokeWidth={1.5} />
            <h3 className="text-base font-semibold text-foreground">No clinical records found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              Clinical encounters will appear here once an appointment is diagnosed or recorded.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {clinicalHistory.map((item: any) => {
              const enc = item.encounter;
              const notes = item.notes;
              const diagnoses = item.diagnoses || [];
              const appt = enc.appointment;
              const apptStatus = appt?.status || (enc.status === "signed" ? "diagnosed" : "booked");
              const cfg = STATUS_CONFIG[apptStatus] || {
                label: apptStatus,
                badge: "bg-muted text-muted-foreground border-border",
              };
              const appointmentTargetId = enc.appointment_id || appt?.id;
              const targetHref = appointmentTargetId
                ? `/dashboard/appointments/${appointmentTargetId}`
                : `/dashboard/encounters/${enc.id}`;

              return (
                <div
                  key={enc.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/50 hover:shadow-md"
                >
                  <div className="space-y-3">
                    {/* Card Header: Service & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-base text-foreground leading-tight">
                          {appt?.services?.name || "General Visit"}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <Stethoscope className="size-3.5 text-primary shrink-0" />
                          <span>Dr. {enc.veterinarian?.full_name || "Staff Veterinarian"}</span>
                        </p>
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold shrink-0 capitalize ${cfg.badge}`}
                      >
                        {cfg.label}
                      </span>
                    </div>

                    {/* Date & Time */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1 border-t border-border/50">
                      <Calendar className="size-3.5 text-primary shrink-0" />
                      <span>{fmtDate(enc.signed_at || enc.created_at || appt?.scheduled_start)}</span>
                    </div>

                    {/* Chief Complaint / Reason */}
                    {(notes?.chief_complaint || enc.notes || appt?.reason) && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Reason / Complaint: </span>
                        <span className="text-foreground/90 line-clamp-2">
                          {notes?.chief_complaint || enc.notes || appt?.reason}
                        </span>
                      </div>
                    )}

                    {/* Diagnoses Pills if any */}
                    {diagnoses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {diagnoses.map((d: any) => (
                          <span
                            key={d.id}
                            className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground border border-border/60"
                          >
                            {d.description}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Redirect Link to Appointment */}
                  <div className="pt-4 mt-3 border-t border-border flex justify-end">
                    <Link
                      href={targetHref}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                    >
                      View Appointment <ExternalLink className="size-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
