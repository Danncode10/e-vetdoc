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
  CheckCircle2,
  Hourglass,
} from "lucide-react";
import {
  listOwnerAppointments,
  listAppointments,
  cancelAppointment,
  approveAppointment,
  getPendingSlotUsage,
  type SlotUsage,
} from "@/services/appointments";
import { AppointmentStatusBadge, statusStripe } from "@/components/dashboard/appointments/status-badge";
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
  const [slotUsage, setSlotUsage] = React.useState<Record<string, SlotUsage>>({});
  const [approvingId, setApprovingId] = React.useState<string | null>(null);
  const canApprove = role === "admin" || role === "staff";

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
      if (canApprove) setSlotUsage(await getPendingSlotUsage().catch(() => ({})));
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

  async function handleApprove(app: any) {
    setApprovingId(app.id);
    try {
      await approveAppointment(app.id);
      toast.success("Appointment approved", {
        description: `${app.pets?.name || "The patient"}'s ${app.services?.name || "appointment"} is confirmed.`,
      });
      await loadAppointments();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not approve this appointment.");
      await loadAppointments();
    } finally {
      setApprovingId(null);
    }
  }

  // Veterinarians do not manage bookings; only owners and the front desk can cancel.
  const canCancel = (status: string) => role !== "veterinarian" && ["requested", "booked"].includes(status);
  const pendingCount = appointments.filter((a) => a.status === "requested").length;

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

        {/* Pending approvals banner */}
        {role !== "owner" && pendingCount > 0 && (
          <div
            data-testid="pending-approvals-banner"
            className="flex flex-col gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {pendingCount} {pendingCount === 1 ? "appointment is" : "appointments are"} waiting for approval
                </p>
                <p className="text-xs text-muted-foreground">
                  {canApprove
                    ? "Approve each request within its schedule's limit. Requests still pending after their date are cancelled automatically."
                    : "Admin or Staff approve requests. Veterinarians can view them."}
                </p>
              </div>
            </div>
            <Button variant="outline" className="min-h-12 shrink-0" onClick={() => setStatusFilter("requested")}>
              Review pending
            </Button>
          </div>
        )}

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
                { id: "requested", label: "Pending" },
                { id: "booked", label: "Approved" },
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
                    data-testid={`status-filter-${tab.id}`}
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
                const usage = slotUsage[app.id];
                const slotFull = usage ? usage.approved >= usage.capacity : false;
                return (
                  <div key={app.id} data-testid={`appointment-card-${app.id}`} className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md">
                    <div className={`${app.status === "booked" ? "h-1" : "h-0.5"} w-full ${statusStripe(app.status)}`} />

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
                          <AppointmentStatusBadge status={app.status} />
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
                        {app.status === "requested" && (
                          <p
                            data-testid="pending-note"
                            className="mt-2 flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/50 p-2.5 text-xs text-muted-foreground"
                          >
                            <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              {role === "owner"
                                ? "Waiting for the clinic to approve your request."
                                : usage
                                  ? `${usage.approved} of ${usage.capacity} places approved in this schedule.`
                                  : "Waiting for Admin or Staff approval."}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="border-t border-border px-5 py-3 flex flex-wrap gap-2 bg-muted/20">
                      {app.status === "requested" && role !== "owner" && (
                        <Button
                          data-testid="approve-appointment"
                          variant={canApprove ? "default" : "outline"}
                          className={`w-full gap-2 text-xs min-h-12 sm:min-h-9 ${canApprove ? "" : "bg-muted text-muted-foreground"}`}
                          disabled={!canApprove || slotFull || approvingId === app.id}
                          title={
                            !canApprove
                              ? "Only Admin or Staff can approve appointments"
                              : slotFull
                                ? `This schedule already has ${usage?.approved}/${usage?.capacity} approved`
                                : undefined
                          }
                          onClick={() => handleApprove(app)}
                        >
                          {approvingId === app.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {slotFull ? `Slot full (${usage?.approved}/${usage?.capacity})` : usage ? `Approve (${usage.approved}/${usage.capacity} approved)` : "Approve"}
                        </Button>
                      )}
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
