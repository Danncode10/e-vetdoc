"use client";

import { appointmentStatusLabel } from "@/lib/appointment-status";

import * as React from "react";
import {
  PawPrint,
  Users,
  CalendarDays,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Clock,
  ScrollText,
  Receipt,
  Heart,
  PlusCircle,
  Calendar,
  Activity,
  CheckCircle2,
  AlertCircle,
  Stethoscope,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { DashboardTabId, UserRole } from "@/lib/dashboard-features";
import { isFeatureEnabled } from "@/lib/dashboard-features";
import {
  getOwnerDashboardSummary,
  getAdminDashboardSummary,
  type OwnerDashboardSummary,
  type AdminDashboardSummary,
} from "@/services/dashboard";

interface OverviewTabProps {
  displayName: string;
  setTab: (tab: DashboardTabId) => void;
  role: UserRole;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatAppointmentTime(apt: {
  scheduled_start?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
}): string {
  if (apt.preferred_date) {
    const parts = apt.preferred_date.split("-");
    let dateStr = apt.preferred_date;
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      dateStr = `${MONTHS[monthIdx]} ${day}, ${year}`;
    }

    if (apt.preferred_time) {
      const timeParts = apt.preferred_time.split(":");
      if (timeParts.length >= 2) {
        let hour = parseInt(timeParts[0], 10);
        const min = timeParts[1];
        const ampm = hour >= 12 ? "PM" : "AM";
        hour = hour % 12 || 12;
        return `${dateStr} at ${hour}:${min} ${ampm}`;
      }
    }
    return dateStr;
  }

  if (apt.scheduled_start) {
    const d = new Date(apt.scheduled_start);
    if (!isNaN(d.getTime())) {
      const month = MONTHS[d.getMonth()];
      const day = d.getDate();
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
    }
  }

  return "Date pending";
}

const ADMIN_QUICK_ACTIONS = [
  {
    icon: PawPrint,
    label: "Pets",
    description: "Medical profiles, species, breeds, and patient demographics",
    badge: "Pet Registry",
    tab: "pets" as DashboardTabId,
    feature: "pets" as const,
    iconTheme: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  {
    icon: CalendarDays,
    label: "Appointments",
    description: "Manage clinical schedule, requests, and triage visits",
    badge: "Booking Hub",
    tab: "appointments" as DashboardTabId,
    feature: "appointments" as const,
    iconTheme: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  {
    icon: Users,
    label: "Owners",
    description: "Client directory, emergency contacts, and co-owner links",
    badge: "Client Directory",
    tab: "owners" as DashboardTabId,
    feature: "owners" as const,
    iconTheme: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  },
  {
    icon: Receipt,
    label: "Billing",
    description: "Official invoices, BIR tax breakdown, and receipts",
    badge: "Billing & Receipts",
    tab: "billing" as DashboardTabId,
    feature: "billing" as const,
    iconTheme: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  {
    icon: ScrollText,
    label: "Audit Logs",
    description: "Review staff activity, diagnostic history, and system events",
    badge: "Admin Audit",
    tab: "logs" as DashboardTabId,
    feature: "admin-or-staff" as const,
    iconTheme: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  },
];

export function OverviewTab({ displayName, setTab, role }: OverviewTabProps) {
  const [ownerSummary, setOwnerSummary] = React.useState<OwnerDashboardSummary | null>(null);
  const [adminSummary, setAdminSummary] = React.useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    if (role === "owner") {
      getOwnerDashboardSummary()
        .then((data) => setOwnerSummary(data))
        .catch((err) => console.error("Failed to load owner overview:", err))
        .finally(() => setLoading(false));
    } else {
      getAdminDashboardSummary()
        .then((data) => setAdminSummary(data))
        .catch((err) => console.error("Failed to load admin overview:", err))
        .finally(() => setLoading(false));
    }
  }, [role]);

  const visibleActions = ADMIN_QUICK_ACTIONS.filter((card) => isFeatureEnabled(card.feature, role));
  const todayDateStr = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-xs">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="w-3.5 h-3.5" />
                {role === "owner" ? "Pet Parent Portal" : "Clinic Command Center"}
              </span>
              {role && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground capitalize">
                  <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                  {role}
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Hello, {displayName}
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {role === "owner"
                ? "Here is the latest care, appointment schedule, and medical updates for your pets."
                : "Here is what is happening at your veterinary clinic today."}
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground bg-muted/40 border border-border/60 rounded-2xl px-4 py-2.5 self-start sm:self-auto">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <span>{todayDateStr}</span>
          </div>
        </div>
      </div>

      {/* ADMIN & STAFF VIEW */}
      {role !== "owner" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="rounded-2xl border border-border bg-card p-4 hover:border-emerald-500/40 transition-all shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <PawPrint className="size-5" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-foreground font-mono">
                    {loading ? "—" : adminSummary?.petCount ?? 0}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground">Active Patients</div>
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border border-border bg-card p-4 hover:border-blue-500/40 transition-all shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  <CalendarDays className="size-5" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-foreground font-mono">
                    {loading ? "—" : adminSummary?.activeAppointmentsCount ?? 0}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground">Appointments</div>
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border border-border bg-card p-4 hover:border-purple-500/40 transition-all shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                  <Users className="size-5" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-foreground font-mono">
                    {loading ? "—" : adminSummary?.ownerCount ?? 0}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground">Pet Owners</div>
                </div>
              </div>
            </Card>

            <Card className="rounded-2xl border border-border bg-card p-4 hover:border-amber-500/40 transition-all shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Receipt className="size-5" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-bold text-foreground font-mono">
                    {loading ? "—" : adminSummary?.unpaidInvoicesCount ?? 0}
                  </div>
                  <div className="text-[11px] font-medium text-muted-foreground">Unpaid Invoices</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Recent Appointments & Queue */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                Recent Booking & Clinical Queue
              </h2>
              <button
                onClick={() => setTab("appointments")}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                View full schedule →
              </button>
            </div>

            {loading ? (
              <Card className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
                <Activity className="size-5 animate-pulse text-primary mx-auto mb-2" />
                Loading clinic metrics...
              </Card>
            ) : !adminSummary || adminSummary.recentAppointments.length === 0 ? (
              <Card className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
                No recent appointments found.
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {adminSummary.recentAppointments.map((apt) => (
                  <Card
                    key={apt.id}
                    className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all cursor-pointer shadow-2xs"
                    onClick={() => setTab("appointments")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">
                            {apt.pet_name}
                          </span>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                            {apt.service_name}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Owner: <span className="font-medium text-foreground">{apt.owner_name}</span>
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Clock className="size-3 text-primary" />
                          {formatAppointmentTime(apt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary capitalize">
                        {appointmentStatusLabel(apt.status)}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Clean Quick Access Hub for Admin */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Management & Operations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {visibleActions.map(({ icon: Icon, label, description, badge, tab, iconTheme }) => (
                <Card
                  key={tab}
                  className="group relative rounded-2xl border border-border bg-card hover:border-primary/50 transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs"
                  onClick={() => setTab(tab)}
                >
                  <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex size-11 items-center justify-center rounded-xl border ${iconTheme} transition-transform duration-150 group-hover:scale-105`}>
                        <Icon className="size-5" />
                      </div>
                      <span className="text-[10px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-lg bg-muted text-muted-foreground border border-border/50">
                        {badge}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        {label}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>

                    <div className="pt-1 flex items-center text-xs font-semibold text-primary gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Open {label.toLowerCase()}</span>
                      <ArrowRight className="size-3.5" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PET OWNER VIEW */}
      {role === "owner" && ownerSummary && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Upcoming Appointments Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                Upcoming Appointments & Visits
              </h2>
              <button
                onClick={() => setTab("appointments")}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                View all visits →
              </button>
            </div>

            {ownerSummary.upcomingAppointments.length === 0 ? (
              <Card className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">No upcoming visits scheduled</p>
                    <p className="text-xs text-muted-foreground">
                      Book routine vaccinations, checkups, or surgical consultations with our veterinary team.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setTab("appointments")}
                    className="rounded-xl gap-2 text-xs font-semibold cursor-pointer shrink-0"
                  >
                    <PlusCircle className="size-3.5" />
                    Book an Appointment
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ownerSummary.upcomingAppointments.map((apt) => (
                  <Card
                    key={apt.id}
                    className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all cursor-pointer"
                    onClick={() => setTab("appointments")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">
                            {apt.pet?.name || "Pet"}
                          </span>
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                            {apt.service?.name || "Consultation"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="size-3 text-primary" />
                          {formatAppointmentTime(apt)}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary capitalize">
                        {appointmentStatusLabel(apt.status)}
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Linked Pets Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1.5">
                <Heart className="size-3.5 text-primary" />
                My Pets ({ownerSummary.pets.length})
              </h2>
              <button
                onClick={() => setTab("pets")}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Manage pets →
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {ownerSummary.pets.map((pet) => (
                <Card
                  key={pet.id}
                  className="rounded-2xl border border-border bg-card p-4 hover:shadow-xs hover:border-primary/40 transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <PawPrint className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-foreground truncate">{pet.name}</h4>
                        <span className="text-[10px] uppercase font-semibold rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                          {pet.relationship_type.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize truncate">
                        {pet.species} {pet.breed ? `· ${pet.breed}` : ""}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setTab("pets")}
                          className="h-7 text-[11px] rounded-lg px-2.5 font-semibold cursor-pointer"
                        >
                          View Records
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setTab("appointments")}
                          className="h-7 text-[11px] rounded-lg px-2.5 font-semibold cursor-pointer"
                        >
                          Book Visit
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Owner Quick Access Grid */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Quick Access Hub
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {visibleActions.map(({ icon: Icon, label, description, badge, tab, iconTheme }) => (
                <Card
                  key={tab}
                  className="group relative rounded-2xl border border-border bg-card hover:border-primary/50 transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs"
                  onClick={() => setTab(tab)}
                >
                  <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`flex size-11 items-center justify-center rounded-xl border ${iconTheme} transition-transform duration-150 group-hover:scale-105`}>
                        <Icon className="size-5" />
                      </div>
                      <span className="text-[10px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-lg bg-muted text-muted-foreground border border-border/50">
                        {badge}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        {label}
                      </h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {description}
                      </p>
                    </div>

                    <div className="pt-1 flex items-center text-xs font-semibold text-primary gap-1 group-hover:translate-x-1 transition-transform">
                      <span>Open {label.toLowerCase()}</span>
                      <ArrowRight className="size-3.5" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
