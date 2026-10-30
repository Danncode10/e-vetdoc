"use client";

export default function SchedulesPageDefault() {
  // The schedule lives in the dashboard's Schedule tab, which knows the user's role.
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard?tab=schedules");
  }, [router]);
  return null;
}

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Clock, Users, X, Pencil, Trash2, ListChecks, Loader2 } from "lucide-react";
import { listAppointmentSchedules, deleteAppointmentSchedule, deleteAppointmentSchedulesBulk } from "@/services/appointments";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SchedulesTab({ role }: { role?: string | null }) {
  // Admin and Staff manage schedules; vets can view them (audit H3).
  return <SchedulesCalendarPage canManage={role === "admin" || role === "staff"} />;
}

// ──────────────────────────────────────────────────────────────
// Delete several schedules at once (Admin / Staff)
// ──────────────────────────────────────────────────────────────

function fmt12(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function BulkDeleteModal({
  monthLabel,
  schedules,
  onClose,
  onDeleted,
}: {
  monthLabel: string;
  schedules: any[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !isDeleting) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, isDeleting]);

  const allSelected = schedules.length > 0 && selected.size === schedules.length;
  const bookingsAffected = schedules
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + (s.booked_count ?? 0), 0);

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={() => !isDeleting && onClose()} />
      <div
        role="dialog"
        aria-labelledby="bulk-delete-title"
        className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div>
            <h3 id="bulk-delete-title" className="text-lg font-semibold text-foreground tracking-tight">Delete schedules</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{monthLabel}: select the schedules to remove.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {schedules.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <CalendarDays className="w-10 h-10 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">No schedules in {monthLabel}.</p>
          </div>
        ) : (
          <>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-border px-5 py-3 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                data-testid="bulk-select-all"
                className="h-5 w-5 accent-primary"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(schedules.map((s) => s.id)))}
              />
              Select all ({schedules.length})
            </label>
            <ul className="flex-1 overflow-y-auto divide-y divide-border" style={{ scrollbarWidth: "thin" }}>
              {schedules.map((s) => {
                const date = new Date(`${String(s.specific_date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
                return (
                  <li key={s.id}>
                    <label className="flex min-h-12 cursor-pointer items-center gap-3 px-5 py-3 hover:bg-muted/40">
                      <input
                        type="checkbox"
                        data-testid={`bulk-select-${String(s.specific_date).slice(0, 10)}`}
                        className="h-5 w-5 accent-primary"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-foreground">{date}</span>
                        <span className="block text-xs text-muted-foreground">
                          {fmt12(s.start_time)} – {fmt12(s.end_time)} · max {s.max_capacity}
                          {s.is_closed ? " · closed" : ""}
                        </span>
                      </span>
                      {(s.booked_count ?? 0) > 0 && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          {s.booked_count} booked
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="min-h-12" onClick={onClose} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            data-testid="bulk-delete-confirm"
            className="min-h-12 gap-2"
            disabled={selected.size === 0 || isDeleting}
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="w-4 h-4" />
            Delete {selected.size || ""} schedule{selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      <ConfirmationDialog
        open={confirming}
        title={`Are you sure you want to delete ${selected.size} schedule${selected.size === 1 ? "" : "s"}?`}
        description={
          bookingsAffected > 0
            ? `${bookingsAffected} approved booking${bookingsAffected === 1 ? "" : "s"} on these dates will be cancelled.`
            : "Any bookings on these dates will be cancelled."
        }
        confirmLabel="Delete schedules"
        requireTypedConfirmation="DELETE"
        isPending={isDeleting}
        onOpenChange={(open) => { if (!open && !isDeleting) setConfirming(false); }}
        onConfirm={async () => {
          setIsDeleting(true);
          const result = await deleteAppointmentSchedulesBulk([...selected]);
          setIsDeleting(false);
          setConfirming(false);
          if (result.error !== undefined) {
            toast.error(result.error);
            return;
          }
          toast.success(`Deleted ${result.data.deleted} schedule${result.data.deleted === 1 ? "" : "s"}`);
          onDeleted();
        }}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime12(time: string): string {
  // time is "HH:MM:SS" or "HH:MM"
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${period}`;
}

// ──────────────────────────────────────────────────────────────
// Modal component
// ──────────────────────────────────────────────────────────────

interface ScheduleModalProps {
  canManage: boolean;
  schedules: any[];
  onClose: () => void;
  onEdit: (schedule: any) => void;
  onDelete: (id: string) => void;
}

function ScheduleModal({ canManage, schedules, onClose, onEdit, onDelete }: ScheduleModalProps) {
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const dateObj = new Date(schedules[0].specific_date + "T00:00:00");
  const dateLabel = dateObj.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border bg-muted/30">
          <div>
            <h3 className="text-lg font-semibold text-foreground tracking-tight">Schedules</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{dateLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1" style={{ scrollbarWidth: "thin" }}>
          {schedules.map((schedule, idx) => (
            <div key={schedule.id || idx} className="bg-background border border-border rounded-xl p-4 shadow-sm relative">
              <div className="flex items-start justify-between mb-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium text-foreground">
                      {formatTime12(schedule.start_time)} – {formatTime12(schedule.end_time)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4 text-primary shrink-0" />
                    <span>Max {schedule.max_capacity} slot{schedule.max_capacity !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                    schedule.is_closed
                      ? "bg-destructive/10 text-destructive"
                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  }`}
                >
                  {schedule.is_closed ? "Closed" : "Open"}
                </span>
              </div>

              {canManage && <div className="flex gap-3 pt-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(schedule)}
                  className="flex-1 text-primary hover:text-primary hover:bg-primary/5"
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onDelete(schedule.id)}
                  className="flex-1 text-destructive border-destructive/20 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Day cell
// ──────────────────────────────────────────────────────────────

interface DayCellProps {
  canManage: boolean;
  day: number | null;
  dateStr: string | null;
  schedules: any[];
  isToday: boolean;
  onEdit: (schedule: any) => void;
  onDelete: (id: string) => void;
  onAddDate: (dateStr: string) => void;
}

function DayCell({ canManage, day, dateStr, schedules, isToday, onEdit, onDelete, onAddDate }: DayCellProps) {
  const [showModal, setShowModal] = useState(false);

  if (day === null || dateStr === null) {
    return <div className="min-h-[72px] rounded-xl" />;
  }

  const hasSchedule = schedules && schedules.length > 0;
  const isClosed = hasSchedule && schedules.every(s => s.is_closed);

  return (
    <>
      <button
        onClick={() => hasSchedule && setShowModal(true)}
        onDoubleClick={() => canManage && dateStr && onAddDate(dateStr)}
        className={`
          w-full min-h-[72px] rounded-xl border text-left p-2 transition-all duration-150 group flex flex-col gap-1 select-none
          ${hasSchedule && !isClosed
            ? "bg-green-50 border-green-300 hover:bg-green-100 hover:border-green-400 dark:bg-green-900/20 dark:border-green-700 dark:hover:bg-green-900/40 cursor-pointer"
            : hasSchedule && isClosed
            ? "bg-orange-50 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:border-orange-800 cursor-pointer"
            : "bg-muted/40 border-border hover:bg-muted/70 hover:border-primary/40 cursor-pointer"
          }
          ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}
        `}
        title={canManage && dateStr ? "Double-click to add a schedule for this date" : undefined}
      >
        {/* Day number */}
        <span
          className={`
            text-sm font-bold leading-none block
            ${isToday
              ? "w-6 h-6 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold"
              : hasSchedule && !isClosed
              ? "text-emerald-950 dark:text-emerald-200"
              : hasSchedule && isClosed
              ? "text-orange-900 dark:text-orange-200"
              : "text-foreground/80 font-semibold"
            }
          `}
        >
          {day}
        </span>

        {/* Schedule indicator */}
        {hasSchedule && (
          <div className="flex flex-col gap-1 mt-1 overflow-hidden w-full">
            {schedules.map((schedule, idx) => (
              <div key={idx} className="space-y-0.5 text-left">
                <div
                  className={`text-[10px] font-bold truncate leading-tight ${
                    schedule.is_closed
                      ? "text-orange-700 dark:text-orange-300"
                      : "text-emerald-800 dark:text-emerald-300"
                  }`}
                >
                  {schedule.is_closed ? "Closed" : formatTime12(schedule.start_time)}
                </div>
                {!schedule.is_closed && (
                  <div className="text-[9px] font-medium text-emerald-700/90 dark:text-emerald-400 leading-tight truncate">
                    – {formatTime12(schedule.end_time)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </button>

      {/* Modal */}
      {showModal && hasSchedule && (
        <ScheduleModal
          canManage={canManage}
          schedules={schedules}
          onClose={() => setShowModal(false)}
          onEdit={(s) => {
            setShowModal(false);
            onEdit(s);
          }}
          onDelete={(id) => {
            setShowModal(false);
            onDelete(id);
          }}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Main calendar page
// ──────────────────────────────────────────────────────────────

function SchedulesCalendarPage({ canManage }: { canManage: boolean }) {
  const router = useRouter();

  const today = new Date();
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [schedules, setSchedules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    setIsLoading(true);
    try {
      const data = await listAppointmentSchedules();
      setSchedules(data);
    } catch (error) {
      console.error("Failed to load schedules:", error);
      toast.error("Failed to load appointment schedules");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;
    try {
      const deleteAppointmentScheduleResult = await deleteAppointmentSchedule(id);
      if (deleteAppointmentScheduleResult.error) throw new Error(deleteAppointmentScheduleResult.error);
      await fetchSchedules();
      toast.success("Schedule deleted successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete schedule");
    }
  };

  const handleAddDate = (dateStr: string) => {
    router.push(`/dashboard/schedules/new?date=${dateStr}`);
  };

  const handleEdit = (schedule: any) => {
    router.push(`/dashboard/schedules/new?edit=${schedule.id}`);
  };

  // Build schedule lookup map: "YYYY-MM-DD" → schedule[]
  const scheduleMap = new Map<string, any[]>();
  for (const s of schedules) {
    if (s.specific_date) {
      // Normalize to YYYY-MM-DD (strip time zone offset if any)
      const key = String(s.specific_date).slice(0, 10);
      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, []);
      }
      scheduleMap.get(key)!.push(s);
    }
  }

  // sort schedules by start_time
  for (const scheds of scheduleMap.values()) {
    scheds.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  }

  // Calendar grid
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = toLocalDateString(today);

  const prevMonth = () => {
    setViewDate((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() - 1);
      n.setDate(1);
      return n;
    });
  };

  const nextMonth = () => {
    setViewDate((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() + 1);
      n.setDate(1);
      return n;
    });
  };

  const goToday = () => {
    const n = new Date();
    n.setDate(1);
    setViewDate(n);
  };

  // Build grid rows
  type GridCell = { day: number | null; dateStr: string | null };
  const cells: GridCell[] = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    cells.push({ day: d, dateStr: toLocalDateString(dateObj) });
  }
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null });

  const totalWithSchedule = schedules.length;

  return (
    <div className="mx-auto w-full max-w-7xl py-6">
      {showBulkDelete && (
        <BulkDeleteModal
          monthLabel={`${MONTH_NAMES[month]} ${year}`}
          schedules={schedules
            .filter((s) => String(s.specific_date ?? "").startsWith(`${year}-${String(month + 1).padStart(2, "0")}`))
            .sort((a, b) => `${a.specific_date}${a.start_time}`.localeCompare(`${b.specific_date}${b.start_time}`))}
          onClose={() => setShowBulkDelete(false)}
          onDeleted={() => {
            setShowBulkDelete(false);
            void fetchSchedules();
          }}
        />
      )}
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-foreground tracking-tight">
            Appointment Schedule
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading
              ? "Loading schedules…"
              : `${totalWithSchedule} date${totalWithSchedule !== 1 ? "s" : ""} configured this year`}
          </p>
        </div>

        {canManage ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowBulkDelete(true)}
              className="flex min-h-12 items-center gap-2 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              id="bulk-delete-btn"
            >
              <ListChecks className="w-4 h-4" />
              Delete multiple
            </Button>
            <Button
              onClick={() => router.push("/dashboard/schedules/new")}
              className="flex min-h-12 items-center gap-2 shrink-0"
              id="add-schedule-btn"
            >
              <Plus className="w-4 h-4" />
              Add Schedule
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="schedule-read-only">
            View only — Admin or Staff manage the clinic schedule.
          </p>
        )}
      </div>

      {/* ── Calendar Card ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">

        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-3">
            <button
              onClick={prevMonth}
              id="prev-month-btn"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h3 className="text-base font-semibold text-foreground min-w-[160px] text-center">
              {MONTH_NAMES[month]} {year}
            </h3>
            <button
              onClick={nextMonth}
              id="next-month-btn"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={goToday}
            id="today-btn"
            className="text-xs font-medium text-primary hover:bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            Today
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b border-border">
          {DAYS_OF_WEEK.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {isLoading ? (
          <div className="grid grid-cols-7 gap-1.5 p-3">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-[72px] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5 p-3">
            {cells.map(({ day, dateStr }, idx) => {
              const schedulesForDay = dateStr ? (scheduleMap.get(dateStr) ?? []) : [];
              const isToday = dateStr === todayStr;
              return (
                <DayCell
                  key={idx}
                  canManage={canManage}
                  day={day}
                  dateStr={dateStr}
                  schedules={schedulesForDay}
                  isToday={isToday}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onAddDate={handleAddDate}
                />
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-6 px-5 py-3 border-t border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-300 border border-green-400" />
            <span className="text-xs text-muted-foreground">Open schedule</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-orange-200 border border-orange-300" />
            <span className="text-xs text-muted-foreground">Closed day</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-muted border border-border" />
            <span className="text-xs text-muted-foreground">No schedule</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-3 h-3 rounded-sm ring-2 ring-primary" />
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
        </div>
      </div>

      {/* Empty state hint */}
      {!isLoading && schedules.length === 0 && (
        <div className="mt-6 flex flex-col items-center justify-center py-12 text-center">
          <CalendarDays className="w-12 h-12 text-muted-foreground/50 mb-3" strokeWidth={1.5} />
          <p className="text-sm font-medium text-muted-foreground">No schedules configured yet</p>
          {canManage && (
            <>
              <p className="text-xs text-muted-foreground/70 mt-1 mb-4">
                Click &ldquo;Add Schedule&rdquo; to set available days for appointments.
              </p>
              <Button
                variant="outline"
                onClick={() => router.push("/dashboard/schedules/new")}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add your first schedule
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}