"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Plus,
  ExternalLink,
  XCircle,
  Clock,
  Loader2,
  Calendar,
  Stethoscope,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  User,
  SlidersHorizontal,
} from "lucide-react";
import { listOwnerAppointments, listAppointments, cancelAppointment } from "@/services/appointments";
import type { UserRole } from "@/lib/dashboard-features";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CancelModal } from "@/components/dashboard/appointments/cancel-modal";
import { cancelAudienceFor } from "@/lib/cancellation-reasons";
import { AutoCancelledBadge, AutoCancelledNotice } from "@/components/dashboard/appointments/auto-cancelled";

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

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string; stripe: string }> = {
  booked: {
    label: "Booked",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-700",
    stripe: "bg-blue-500",
  },
  diagnosed: {
    label: "Diagnosed",
    dot: "bg-amber-500",
    badge: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700",
    stripe: "bg-amber-400",
  },
  paid: {
    label: "Paid",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700",
    stripe: "bg-emerald-500",
  },
  completed: {
    label: "Completed",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700",
    stripe: "bg-green-500",
  },
  cancelled: {
    label: "Cancelled",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-700",
    stripe: "bg-red-400",
  },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    dot: "bg-muted-foreground",
    badge: "bg-muted text-muted-foreground border-border",
    stripe: "bg-muted",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} shrink-0`} />
      {cfg.label}
    </span>
  );
}

interface CancelModalProps {
  appointment: any;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

export function AppointmentsTab({ role, userId }: { role: UserRole; userId: string }) {
  const router = useRouter();
  const [appointments, setAppointments] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [cancelTarget, setCancelTarget] = React.useState<any | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [dateFilter, setDateFilter] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState(1);
  const PAGE_SIZE = 6;

  async function loadAppointments() {
    setIsLoading(true);
    try {
      const data = role === "owner"
        ? await listOwnerAppointments(userId)
        : await listAppointments();
      setAppointments(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  React.useEffect(() => {
    loadAppointments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userId]);

  // Reset page to 1 when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter]);

  async function handleCancelConfirm(reason: string) {
    if (!cancelTarget) return;
    await cancelAppointment(cancelTarget.id, reason);
    toast.success("Appointment cancelled", {
      description: role === "owner"
        ? `Your ${cancelTarget.services?.name || "appointment"} has been cancelled.`
        : `${cancelTarget.pets?.name || "The patient"}'s ${cancelTarget.services?.name || "appointment"} has been cancelled.`,
    });
    setCancelTarget(null);
    await loadAppointments();
  }

  // Veterinarians do not manage bookings; only owners and the front desk can cancel.
  const canCancel = (status: string) => role !== "veterinarian" && ["booked"].includes(status);

  // Filter appointments
  const filteredAppointments = React.useMemo(() => {
    return appointments.filter((app) => {
      // 1. Status Filter
      if (statusFilter !== "all") {
        if (app.status !== statusFilter) return false;
      }

      // 2. Date Filter
      if (dateFilter) {
        const appDate = app.scheduled_start
          ? app.scheduled_start.slice(0, 10)
          : app.preferred_date
          ? app.preferred_date.slice(0, 10)
          : "";
        if (appDate !== dateFilter) return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const petName = app.pets?.name?.toLowerCase() || "";
        const serviceName = app.services?.name?.toLowerCase() || "";
        const ownerName = app.owner?.full_name?.toLowerCase() || "";
        const reason = app.reason?.toLowerCase() || "";
        const match =
          petName.includes(q) ||
          serviceName.includes(q) ||
          ownerName.includes(q) ||
          reason.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [appointments, statusFilter, dateFilter, searchQuery]);

  // Pagination calculations
  const totalItems = filteredAppointments.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedAppointments = React.useMemo(() => {
    const start = (validCurrentPage - 1) * PAGE_SIZE;
    return filteredAppointments.slice(start, start + PAGE_SIZE);
  }, [filteredAppointments, validCurrentPage, PAGE_SIZE]);

  const hasActiveFilters = searchQuery !== "" || statusFilter !== "all" || dateFilter !== "";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateFilter("");
    setCurrentPage(1);
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground tracking-tight">Appointments</h2>
            <p className="mt-1 text-[14px] text-muted-foreground">
              Manage appointment requests, scheduling, and check-ins.
            </p>
          </div>
          {role === "owner" && (
            <Link
              href="/dashboard/appointments/new"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" strokeWidth={1.5} />
              Request appointment
            </Link>
          )}
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[240px]">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search pet, service, owner, or reason…"
                className="w-full rounded-xl border border-input bg-background pl-10 pr-9 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-md"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-auto">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full sm:w-auto rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              {dateFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDateFilter("")}
                  className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear Date
                </Button>
              )}
            </div>
          </div>

          {/* Status Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Status:
              </span>
              {[
                { id: "all", label: "All" },
                { id: "booked", label: "Booked" },
                { id: "diagnosed", label: "Diagnosed" },
                { id: "paid", label: "Paid" },
                { id: "cancelled", label: "Cancelled" },
              ].map((tab) => {
                const isActive = statusFilter === tab.id;
                const count = tab.id === "all"
                  ? appointments.length
                  : appointments.filter(a => a.status === tab.id).length;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/15 text-muted-foreground"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1 ml-auto"
              >
                <X className="h-3 w-3" />
                Reset all filters
              </button>
            )}
          </div>
        </div>

        {/* List Content */}
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-52 animate-pulse rounded-2xl bg-muted" />
            <div className="h-52 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : filteredAppointments.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center">
            <CalendarDays className="w-10 h-10 text-muted-foreground mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-base font-semibold text-foreground">
              {hasActiveFilters ? "No matching appointments found" : "No appointments yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasActiveFilters
                ? "Try adjusting your search query, status, or date filter."
                : "Schedule a visit to get started."}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {paginatedAppointments.map((app) => {
                const cfg = STATUS_CONFIG[app.status];
                return (
                  <div key={app.id} data-testid={`appointment-card-${app.id}`} className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md">
                    <div className={`h-0.5 w-full ${cfg?.stripe ?? "bg-muted"}`} />

                    <div className="p-5 flex-1">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <p className="text-base font-semibold text-foreground leading-tight">
                            {app.pets?.name || "Unknown Pet"}
                          </p>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {app.services?.name || "General Visit"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <StatusBadge status={app.status} />
                          {app.auto_cancelled && <AutoCancelledBadge />}
                        </div>
                      </div>

                      <div className="space-y-2 text-sm">
                        {role !== "owner" && app.owner?.full_name && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <User className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} />
                            <span className="font-medium text-foreground">{app.owner.full_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                          <span>
                            {app.scheduled_start ? fmtDate(app.scheduled_start) : app.preferred_date ? fmtPreferredDate(app.preferred_date) : "Date TBD"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} />
                          <span>
                            {app.scheduled_start ? fmtTime(app.scheduled_start) : app.preferred_time ? (() => { const [h, m] = app.preferred_time.split(":").map(Number); const p = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${p}`; })() : "Time TBD"}
                          </span>
                        </div>
                        {app.reason && (
                          <div className="flex items-start gap-2 text-muted-foreground pt-2 border-t border-border/50 mt-2">
                            <Stethoscope className="h-3.5 w-3.5 shrink-0 mt-0.5" strokeWidth={1.5} />
                            <span className="line-clamp-2 text-foreground/80">{app.reason}</span>
                          </div>
                        )}
                        {app.auto_cancelled && <AutoCancelledNotice className="mt-2" />}
                      </div>
                    </div>

                    <div className="border-t border-border px-5 py-3 flex gap-2 bg-muted/20">
                      <Button
                        variant="outline"
                        className="flex-1 gap-2 text-xs h-9"
                        onClick={() => router.push(`/dashboard/appointments/${app.id}`)}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View details
                      </Button>
                      {canCancel(app.status) && (
                        <Button
                          variant="ghost"
                          className="flex-1 gap-2 text-xs h-9 text-destructive hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all"
                          onClick={() => setCancelTarget(app)}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Cancel appointment
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">{(validCurrentPage - 1) * PAGE_SIZE + 1}</span> to{" "}
                  <span className="font-semibold text-foreground">{Math.min(validCurrentPage * PAGE_SIZE, totalItems)}</span> of{" "}
                  <span className="font-semibold text-foreground">{totalItems}</span> appointments
                </p>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={validCurrentPage === 1}
                    className="h-8 px-2.5 text-xs gap-1"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </Button>

                  <div className="flex items-center gap-1 px-2">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`h-7 w-7 rounded-lg text-xs font-medium transition-all ${
                          validCurrentPage === p
                            ? "bg-primary text-primary-foreground font-bold shadow-xs"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={validCurrentPage === totalPages}
                    className="h-8 px-2.5 text-xs gap-1"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {cancelTarget && (
        <CancelModal
          appointment={cancelTarget}
          audience={cancelAudienceFor(role)}
          onConfirm={handleCancelConfirm}
          onClose={() => setCancelTarget(null)}
        />
      )}
    </>
  );
}
