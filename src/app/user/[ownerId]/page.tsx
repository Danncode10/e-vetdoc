import Link from "next/link";
import {
  ArrowLeft,
  PawPrint,
  CalendarDays,
  Calendar,
  Clock,
  Stethoscope,
  ExternalLink,
  Mail,
  Phone,
  User,
  CheckCircle2,
} from "lucide-react";
import { getOwnerRegistryDetail } from "@/services/pets";
import { listOwnerAppointments } from "@/services/appointments";
import { requireRole, CLINIC_ROLES } from "@/services/authorization";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function fmtPreferredDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(y, m - 1, d));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  requested: {
    label: "Pending approval",
    badge: "bg-muted text-foreground border-dashed border-muted-foreground/60",
  },
  booked: {
    label: "Approved",
    badge: "bg-primary text-primary-foreground border-primary",
  },
  diagnosed: {
    label: "Diagnosed",
    badge: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
  },
  paid: {
    label: "Paid",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  completed: {
    label: "Completed",
    badge: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950/40 dark:text-green-300",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-300",
  },
};

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "OW";
}

export default async function OwnerRecordPage({ params }: { params: Promise<{ ownerId: string }> }) {
  await requireRole(CLINIC_ROLES);
  const { ownerId } = await params;
  
  const [owner, appointments] = await Promise.all([
    getOwnerRegistryDetail(ownerId),
    listOwnerAppointments(ownerId).catch(() => []),
  ]);

  if (!owner) notFound();

  const activeVisits = appointments.filter((a: any) => ["booked"].includes(a.status));
  const completedVisits = appointments.filter((a: any) => a.status === "completed");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-12">
      {/* Back Link */}
      <Link
        href="/dashboard?tab=owners"
        className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Owner Directory
      </Link>

      {/* Header Profile Card */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-xl border border-primary/20 shadow-xs">
              {getInitials(owner.fullName, owner.email)}
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">Owner Profile</span>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{owner.fullName || "Owner Record"}</h1>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-1">
                {owner.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{owner.email}</span>
                  </div>
                )}
                {owner.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{owner.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-3 pt-4 md:pt-0 border-t md:border-t-0 border-border">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-center min-w-[90px]">
              <p className="text-xs text-muted-foreground font-medium">Pets</p>
              <p className="text-lg font-bold text-foreground">{owner.linkedPets.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-center min-w-[90px]">
              <p className="text-xs text-muted-foreground font-medium font-medium">Total Visits</p>
              <p className="text-lg font-bold text-foreground">{appointments.length}</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-center min-w-[90px]">
              <p className="text-xs text-primary font-medium">Active Visits</p>
              <p className="text-lg font-bold text-primary">{activeVisits.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Appointment History Section */}
      <section className="space-y-4" aria-labelledby="appointments-heading">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" strokeWidth={1.5} />
            <h2 id="appointments-heading" className="text-lg font-semibold text-foreground">
              Appointment History & Requests
            </h2>
          </div>
          <span className="text-xs font-semibold text-muted-foreground rounded-full bg-muted px-2.5 py-0.5 border border-border">
            {appointments.length} {appointments.length === 1 ? "Record" : "Records"}
          </span>
        </div>

        {appointments.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <CalendarDays className="w-8 h-8 text-muted-foreground mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">No appointments recorded</p>
            <p className="text-xs text-muted-foreground mt-1">This owner has not requested any appointments yet.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {appointments.map((app: any) => {
              const cfg = STATUS_CONFIG[app.status] || { label: app.status, badge: "bg-muted text-muted-foreground" };
              return (
                <div
                  key={app.id}
                  className="group relative flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-sm font-bold text-foreground">{app.services?.name || "General Visit"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Patient: <span className="font-semibold text-foreground">{app.pets?.name || "Pet"}</span></p>
                    </div>
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
                      <span>{app.scheduled_start ? fmtDate(app.scheduled_start) : app.preferred_date ? fmtPreferredDate(app.preferred_date) : "Date TBD"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-primary shrink-0" strokeWidth={1.5} />
                      <span>{app.scheduled_start ? fmtTime(app.scheduled_start) : app.preferred_time || "Time TBD"}</span>
                    </div>
                    {app.reason && (
                      <div className="flex items-start gap-2 pt-2 border-t border-border/50">
                        <Stethoscope className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.5} />
                        <span className="line-clamp-2 text-foreground/80">{app.reason}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-3 border-t border-border">
                    <Link
                      href={`/dashboard/appointments/${app.id}`}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-input bg-background py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                      View Details & Notes
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Linked Pets Section */}
      <section className="space-y-4" aria-labelledby="linked-pets-heading">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <PawPrint className="w-5 h-5 text-primary" strokeWidth={1.5} />
            <h2 id="linked-pets-heading" className="text-lg font-semibold text-foreground">
              Linked Patients & Pets
            </h2>
          </div>
          <span className="text-xs font-semibold text-muted-foreground rounded-full bg-muted px-2.5 py-0.5 border border-border">
            {owner.linkedPets.length} {owner.linkedPets.length === 1 ? "Pet" : "Pets"}
          </span>
        </div>

        {owner.linkedPets.length === 0 ? (
          <div className="flex min-h-32 flex-col items-center justify-center text-center rounded-2xl border border-border bg-card p-6">
            <PawPrint className="mb-2 w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">No pets are currently linked to this owner.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {owner.linkedPets.map((pet) => (
              <div
                key={pet.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-xs hover:border-primary/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <PawPrint className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{pet.name}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {[pet.species, pet.breed].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <Link
                  href={`/user/${owner.id}/pet/${pet.id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors shrink-0"
                >
                  Medical Record
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
