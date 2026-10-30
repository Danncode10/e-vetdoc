"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  PawPrint,
  CalendarDays,
  User,
  Mail,
  Phone,
  Clock,
  Calendar,
  Stethoscope,
  ExternalLink,
  Download,
  History,
  FileText,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChevronRight,
  Sparkles,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cancelAppointment } from "@/services/appointments";
import { CancelModal } from "@/components/dashboard/appointments/cancel-modal";
import { cancelAudienceFor } from "@/lib/cancellation-reasons";
import { QuickBillingDialog } from "@/components/dashboard/billing/quick-billing-dialog";
import { useRouter } from "next/navigation";
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const STATUS_CONFIG: Record<string, { label: string; badge: string; dot: string }> = {
  booked: {
    label: "Booked",
    badge: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  diagnosed: {
    label: "Diagnosed",
    badge: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  paid: {
    label: "Paid",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  completed: {
    label: "Completed",
    badge: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950/40 dark:text-green-300",
    dot: "bg-green-500",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-300",
    dot: "bg-red-500",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status.replace("_", " "),
    badge: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} shrink-0`} />
      {cfg.label}
    </span>
  );
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "OW";
}

interface AppointmentDetailViewProps {
  appointment: any;
  ownerAppointments: any[];
  ownerPets: any[];
  userRole?: string;
  onStartEncounter?: () => Promise<void>;
  existingEncounter?: { id: string; status: string } | null;
  encounterDetails?: any;
}

export function AppointmentDetailView({
  appointment,
  ownerAppointments,
  ownerPets,
  userRole,
  onStartEncounter,
  existingEncounter,
  encounterDetails,
}: AppointmentDetailViewProps) {
  const [activeTab, setActiveTab] = React.useState<"pets" | "history">("pets");
  const [isStarting, setIsStarting] = React.useState(false);
  const [showCancelModal, setShowCancelModal] = React.useState(false);
  const [showBillingDialog, setShowBillingDialog] = React.useState(false);
  const router = useRouter();
  const isClinicTeam = userRole === "admin" || userRole === "staff" || userRole === "veterinarian";
  // Billing is the front desk's job (Admin/Staff); vets do the medical work.
  const canBill = userRole === "admin" || userRole === "staff";
  // A new encounter only makes sense for a visit that is still booked.
  const canStartEncounter = appointment.status === "booked";

  const owner = appointment.owner || appointment.profiles;
  const petProfile = appointment.pets;
  const service = appointment.services;
  const vet = appointment.veterinarian;

  const scheduledStart = appointment.scheduled_start;
  const scheduledEnd = appointment.scheduled_end;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 print:py-4 print:px-0">
      {/* ── Top Navigation Bar ── */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard?tab=appointments"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to appointments
        </Link>
        <div className="flex items-center gap-2">
          {existingEncounter ? (
            isClinicTeam ? (
              <Link
                href={`/dashboard/encounters/${existingEncounter.id}`}
                className="inline-flex items-center gap-2 text-xs h-9 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm font-medium"
              >
                <Stethoscope className="h-3.5 w-3.5" />
                {existingEncounter.status === "signed" ? "View Finalized Record" : "View / Edit Encounter"}
              </Link>
            ) : (
              <Link
                href={`/dashboard/appointments/${appointment.id}/prescriptions`}
                className="inline-flex items-center gap-2 text-xs h-9 px-3 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm font-medium"
              >
                <FileText className="h-3.5 w-3.5" />
                View Prescription
              </Link>
            )
          ) : (
            isClinicTeam && canStartEncounter && onStartEncounter && (
              <Button
                variant="default"
                size="sm"
                className="gap-2 text-xs"
                disabled={isStarting}
                onClick={async () => {
                  setIsStarting(true);
                  try {
                    await onStartEncounter();
                  } catch (e) {
                    console.error(e);
                    toast.error(e instanceof Error ? e.message : "Could not start the encounter.");
                    setIsStarting(false);
                  }
                }}
              >
                <Stethoscope className="h-3.5 w-3.5" />
                {isStarting ? "Starting..." : "Start Encounter"}
              </Button>
            )
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-2 text-xs h-9"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Print Details
          </Button>
          {/* ── Charge & Mark Paid button ── */}
          {canBill && appointment.status !== "paid" && (
            <button
              onClick={() => {
                if (appointment.status !== "diagnosed") {
                  toast.error("Encounter not signed", {
                    description: "The appointment encounter must be Signed & Locked before you can charge and mark paid.",
                  });
                  return;
                }
                setShowBillingDialog(true);
              }}
              className={`inline-flex items-center gap-2 text-xs h-9 px-3 rounded-md shadow-sm font-medium transition-colors ${
                appointment.status === "diagnosed"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              Charge & Mark Paid
            </button>
          )}
        </div>
      </div>

      {/* ── Quick Billing Dialog ── */}
      {canBill && (
        <QuickBillingDialog
          appointmentId={appointment.id}
          serviceDescription={service?.name ?? "Veterinary Consultation"}
          suggestedAmount={service?.price_from ? Number(service.price_from) : 0}
          open={showBillingDialog}
          onOpenChange={setShowBillingDialog}
        />
      )}

      {/* ── Header Title & Reference ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">Appointment Record</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="font-mono text-xs text-muted-foreground">ID: {appointment.id.slice(0, 8)}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {service?.name || "Veterinary Visit"}
          </h1>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      {/* ── Section 1: User (Owner) & Appointment Quick Overview ── */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* User / Owner Details Card */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-primary" /> Owner Information
            </span>
            <Link
              href={`/user/${appointment.owner_id}`}
              className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              Profile <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm border border-primary/20">
              {getInitials(owner?.full_name, owner?.email)}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-base font-bold text-foreground leading-tight truncate">
                {owner?.full_name || "Pet Owner"}
              </p>
              {owner?.email && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{owner.email}</span>
                </div>
              )}
              {owner?.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span>{owner.phone}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Schedule & Service Overview Card */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" /> Schedule & Service
            </span>
            {vet?.full_name && (
              <span className="text-xs text-muted-foreground">Vet: <strong className="text-foreground">{vet.full_name}</strong></span>
            )}
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <span>
                {scheduledStart
                  ? fmtDate(scheduledStart)
                  : appointment.preferred_date
                  ? appointment.preferred_date
                  : "Date Pending"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>
                {scheduledStart
                  ? `${fmtTime(scheduledStart)} ${scheduledEnd ? `– ${fmtTime(scheduledEnd)}` : ""}`
                  : appointment.preferred_time || "Time Pending"}
              </span>
            </div>

            {appointment.reason && (
              <div className="pt-2 border-t border-border/50 text-muted-foreground">
                <span className="font-semibold text-foreground">Reason: </span>
                <span>{appointment.reason}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 2: 2 Navigation Tabs (Pets Tab & Appointment History Tab) ── */}
      <div className="space-y-4">
        {/* Tab Buttons Bar */}
        <div className="flex items-center gap-2 border-b border-border pb-1">
          <button
            onClick={() => setActiveTab("pets")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "pets"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <PawPrint className="h-4 w-4" />
            Pets Details
            {ownerPets?.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === "pets" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {ownerPets.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === "history"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <History className="h-4 w-4" />
            Appointment History
            {ownerAppointments?.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                activeTab === "history" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}>
                {ownerAppointments.length}
              </span>
            )}
          </button>
        </div>

        {/* ── TAB 1: PETS DETAILS ── */}
        {activeTab === "pets" && (
          <div className="space-y-4">
            {/* Primary Patient Pet Card */}
            <div className="rounded-2xl border-2 border-primary/30 bg-card p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-primary/10 text-primary font-bold text-[10px] uppercase tracking-wider px-3 py-1 rounded-bl-xl border-l border-b border-primary/20">
                Patient for this appointment
              </div>

              <div className="flex items-start gap-4 mb-5">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <PawPrint className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">{petProfile?.name || "Patient Pet"}</h3>
                  <p className="text-sm text-muted-foreground capitalize">
                    {[petProfile?.species, petProfile?.breed].filter(Boolean).join(" • ") || "Species details"}
                  </p>
                </div>
              </div>

              {/* Grid of Details */}
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 bg-muted/30 p-4 rounded-xl border border-border/60">
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Sex</p>
                  <p className="font-semibold text-foreground capitalize">{petProfile?.sex || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Date of Birth</p>
                  <p className="font-semibold text-foreground">{petProfile?.date_of_birth || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Age</p>
                  <p className="font-semibold text-foreground">{petProfile?.age ? `${petProfile.age} yrs` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Color / Markings</p>
                  <p className="font-semibold text-foreground">{petProfile?.color || "—"}</p>
                </div>
                {petProfile?.notes && (
                  <div className="col-span-2 sm:col-span-2">
                    <p className="text-xs text-muted-foreground font-medium">Medical Notes</p>
                    <p className="font-semibold text-foreground">{petProfile.notes}</p>
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="mt-4 flex justify-end">
                <Link
                  href={`/user/${appointment.owner_id}/pet/${petProfile?.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-input bg-background px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  View Full Medical Record
                </Link>
              </div>
            </div>

            {/* Cancel Appointment Button */}
            {userRole !== "veterinarian" && ["booked", "requested", "scheduled", "confirmed"].includes(appointment.status) && (
              <div className="mt-8 rounded-xl border border-destructive/20 bg-destructive/5 p-5 flex items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-destructive">Cancel this appointment</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {userRole === "owner"
                      ? "This action cannot be undone. You will need to book a new appointment if you change your mind."
                      : "This action cannot be undone. The owner will need to book a new appointment."}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowCancelModal(true)}
                  className="shrink-0"
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel Appointment
                </Button>
              </div>
            )}
          </div>
        )}

        {showCancelModal && (
          <CancelModal
            appointment={appointment}
            audience={cancelAudienceFor(userRole)}
            onClose={() => setShowCancelModal(false)}
            onConfirm={async (reason) => {
              try {
                await cancelAppointment(appointment.id, reason);
                toast.success("Appointment cancelled successfully");
                setShowCancelModal(false);
                router.refresh();
              } catch (error: any) {
                toast.error(error.message || "Failed to cancel appointment");
              }
            }}
          />
        )}

        {/* ── TAB 2: APPOINTMENT HISTORY ── */}
        {activeTab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Showing all appointment records for <strong className="text-foreground">{owner?.full_name || "this owner"}</strong>
              </p>
              <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full border border-border">
                Total: {ownerAppointments.length}
              </span>
            </div>

            {ownerAppointments.length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center">
                <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-sm font-semibold text-foreground">No past appointments found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ownerAppointments.map((app: any) => {
                  const isCurrent = app.id === appointment.id;
                  const appCfg = STATUS_CONFIG[app.status] || { label: app.status, badge: "bg-muted text-muted-foreground" };
                  return (
                    <div
                      key={app.id}
                      className={`rounded-xl border p-4 transition-all ${
                        isCurrent
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                          : "border-border bg-card hover:border-border/80"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-foreground">{app.services?.name || "Visit"}</p>
                          {isCurrent && (
                            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Currently Viewing
                            </span>
                          )}
                        </div>
                        <StatusBadge status={app.status} />
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground mb-3">
                        <div className="flex items-center gap-2">
                          <PawPrint className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>Patient: <strong className="text-foreground">{app.pets?.name || "Pet"}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>
                            {app.scheduled_start
                              ? fmtDate(app.scheduled_start)
                              : app.preferred_date || "Date TBD"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 col-span-2">
                          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>
                            {app.scheduled_start
                              ? fmtTime(app.scheduled_start)
                              : app.preferred_time || "Time TBD"}
                          </span>
                        </div>
                      </div>

                      {app.reason && (
                        <p className="text-xs text-foreground bg-muted/40 p-2.5 rounded-lg border border-border/50 mb-3">
                          <span className="text-muted-foreground font-medium">Reason: </span>
                          {app.reason}
                        </p>
                      )}

                      {/* Timeline breakdown */}
                      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                        {app.requested_at && <span>Requested: {fmtDateTime(app.requested_at)}</span>}
                        {app.confirmed_at && <span>• Confirmed: {fmtDateTime(app.confirmed_at)}</span>}
                        {app.completed_at && <span>• Completed: {fmtDateTime(app.completed_at)}</span>}
                        {app.cancelled_at && <span>• Cancelled: {fmtDateTime(app.cancelled_at)}</span>}
                      </div>

                      {!isCurrent && (
                        <div className="mt-3 flex justify-end">
                          <Link
                            href={`/dashboard/appointments/${app.id}`}
                            className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                          >
                            Open Appointment <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
