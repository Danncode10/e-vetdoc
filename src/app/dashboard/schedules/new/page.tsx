"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarRange, CalendarPlus, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";

import {
  createAppointmentSchedule,
  createAppointmentSchedulesBulk,
  updateAppointmentSchedule,
  listAppointmentSchedules,
} from "@/services/appointments";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function formatTime(time: string): string {
  if (/^\d{2}:\d{2}:\d{2}$/.test(time)) return time;
  if (/^\d{2}:\d{2}$/.test(time)) return `${time}:00`;
  return time;
}

type DateMode = "single" | "multiple" | "range";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_DATES = 92;

/** Every date from `from` to `to` (inclusive, YYYY-MM-DD) whose weekday is in `days`. */
function datesInRange(from: string, to: string, days: number[]): string[] {
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length <= MAX_DATES) {
    if (days.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function shortDate(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// Strip seconds from "HH:MM:SS" for <input type="time">
function toInputTime(time: string): string {
  return time?.slice(0, 5) ?? "";
}

// ──────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────

export default function AddSchedulePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const dateParam = searchParams.get("date");
  const isEditMode = !!editId;

  const [isLoadingEdit, setIsLoadingEdit] = useState(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("single");
  const [multiDates, setMultiDates] = useState<string[]>([]);
  const [multiInput, setMultiInput] = useState("");
  const [range, setRange] = useState({ from: "", to: "", days: [1, 2, 3, 4, 5, 6] });
  const todayStr = new Date().toISOString().split("T")[0];
  const bulkDates = dateMode === "multiple" ? multiDates : dateMode === "range" ? datesInRange(range.from, range.to, range.days) : [];

  const [form, setForm] = useState({
    specificDate: dateParam || "",
    startTime: "09:00",
    endTime: "17:00",
    maxCapacity: 3,
    isClosed: false,
  });

  useEffect(() => {
    if (dateParam && !isEditMode) {
      setForm((prev) => ({ ...prev, specificDate: dateParam }));
    }
  }, [dateParam, isEditMode]);

  // If edit mode, fetch schedule and pre-fill form
  useEffect(() => {
    if (!isEditMode) return;
    (async () => {
      try {
        const all = await listAppointmentSchedules();
        const found = all.find((s: any) => s.id === editId);
        if (found) {
          setForm({
            specificDate: String(found.specific_date).slice(0, 10),
            startTime: toInputTime(found.start_time),
            endTime: toInputTime(found.end_time),
            maxCapacity: found.max_capacity,
            isClosed: found.is_closed ?? false,
          });
        } else {
          toast.error("Schedule not found");
          router.push("/dashboard?tab=schedules");
        }
      } catch {
        toast.error("Failed to load schedule");
        router.push("/dashboard?tab=schedules");
      } finally {
        setIsLoadingEdit(false);
      }
    })();
  }, [editId, isEditMode, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const { specificDate, startTime, endTime, maxCapacity, isClosed } = form;

    if (!isEditMode && dateMode !== "single") {
      if (bulkDates.length === 0) {
        toast.error(dateMode === "multiple" ? "Add at least one date." : "Choose a date range and at least one day of the week.");
        return;
      }
      if (bulkDates.length > MAX_DATES) {
        toast.error(`Choose at most ${MAX_DATES} dates at a time.`);
        return;
      }
      if (formatTime(startTime) >= formatTime(endTime)) {
        toast.error("The end time must be later than the start time.");
        return;
      }
      if (maxCapacity <= 0) {
        toast.error("Max capacity must be greater than 0");
        return;
      }
      setIsSubmitting(true);
      try {
        const result = await createAppointmentSchedulesBulk({
          dates: bulkDates,
          start_time: formatTime(startTime),
          end_time: formatTime(endTime),
          max_capacity: maxCapacity,
          is_closed: isClosed,
        });
        if (result.error !== undefined) throw new Error(result.error);
        const { created, skipped } = result.data;
        if (created.length === 0) {
          toast.error("No schedules were created", {
            description: skipped.map((s) => `${shortDate(s.date)}: ${s.reason}`).join(" · "),
          });
          return;
        }
        toast.success(`Created ${created.length} schedule${created.length === 1 ? "" : "s"}`, {
          description: skipped.length
            ? `Skipped ${skipped.length}: ${skipped.map((s) => `${shortDate(s.date)} (${s.reason})`).join(", ")}`
            : undefined,
        });
        router.push("/dashboard?tab=schedules");
      } catch (error: any) {
        toast.error(error.message || "Failed to save schedules");
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!specificDate || !startTime || !endTime) {
      toast.error("Please fill in all required fields");
      return;
    }
    if (formatTime(startTime) >= formatTime(endTime)) {
      toast.error("The end time must be later than the start time.");
      return;
    }
    if (maxCapacity <= 0) {
      toast.error("Max capacity must be greater than 0");
      return;
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(specificDate)) {
      toast.error("Please enter a valid date (YYYY-MM-DD)");
      return;
    }

    const dateObj = new Date(`${specificDate}T00:00:00`);
    const dayOfWeek = isNaN(dateObj.getDay()) ? 0 : dateObj.getDay();

    setIsSubmitting(true);
    try {
      // Check for overlapping schedules
      const allSchedules = await listAppointmentSchedules();
      const overlapping = allSchedules.find((s: any) => {
        if (isEditMode && s.id === editId) return false;
        if (s.specific_date === specificDate) {
          const sStart = formatTime(s.start_time);
          const sEnd = formatTime(s.end_time);
          const fStart = formatTime(startTime);
          const fEnd = formatTime(endTime);
          
          return fStart < sEnd && fEnd > sStart;
        }
        return false;
      });

      if (overlapping) {
        toast.error("This schedule overlaps with an existing schedule for this date.");
        setIsSubmitting(false);
        return;
      }
      if (isEditMode && editId) {
        const updateAppointmentScheduleResult = await updateAppointmentSchedule(editId, {
          specific_date: specificDate,
          start_time: formatTime(startTime),
          end_time: formatTime(endTime),
          max_capacity: maxCapacity,
          day_of_week: dayOfWeek,
          is_closed: isClosed,
        });
        if (updateAppointmentScheduleResult.error) throw new Error(updateAppointmentScheduleResult.error);
        toast.success("Schedule updated successfully");
      } else {
        const createAppointmentScheduleResult = await createAppointmentSchedule({
          specific_date: specificDate,
          start_time: formatTime(startTime),
          end_time: formatTime(endTime),
          max_capacity: maxCapacity,
          day_of_week: dayOfWeek,
          is_closed: isClosed,
        });
        if (createAppointmentScheduleResult.error) throw new Error(createAppointmentScheduleResult.error);
        toast.success("Schedule created successfully");
      }
      router.push("/dashboard?tab=schedules");
    } catch (error: any) {
      toast.error(error.message || "Failed to save schedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const set = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="mx-auto w-full max-w-2xl py-8 px-4">
      {/* Back link */}
      <Link
        href="/dashboard?tab=schedules"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        id="back-to-calendar-link"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to Calendar
      </Link>

      {/* Card */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border bg-muted/30">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 shrink-0">
            <CalendarDays className="w-5 h-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              {isEditMode ? "Edit Schedule" : "Add Appointment Schedule"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEditMode
                ? "Update the details for this schedule."
                : "Configure one date, several dates, or a date range with the same slots."}
            </p>
          </div>
        </div>

        {/* Form */}
        {isLoadingEdit ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">

            {/* Date mode (new schedules only) */}
            {!isEditMode && (
              <div role="group" aria-label="How many dates" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([
                  { id: "single", label: "Single date", Icon: CalendarDays },
                  { id: "multiple", label: "Multiple dates", Icon: CalendarPlus },
                  { id: "range", label: "Date range", Icon: CalendarRange },
                ] as const).map(({ id, label, Icon }) => (
                  <Button
                    key={id}
                    type="button"
                    data-testid={`date-mode-${id}`}
                    variant={dateMode === id ? "default" : "outline"}
                    aria-pressed={dateMode === id}
                    className="min-h-12 gap-2"
                    onClick={() => setDateMode(id)}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                ))}
              </div>
            )}

            {/* Date */}
            {(isEditMode || dateMode === "single") && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2" htmlFor="sched-date">
                Date <span className="text-destructive">*</span>
              </label>
              <input
                id="sched-date"
                type="date"
                value={form.specificDate}
                onChange={(e) => set("specificDate", e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                required
              />
            </div>
            )}

            {/* Multiple dates */}
            {!isEditMode && dateMode === "multiple" && (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground" htmlFor="sched-multi-date">
                  Dates <span className="text-destructive">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="sched-multi-date"
                    type="date"
                    value={multiInput}
                    min={todayStr}
                    onChange={(e) => setMultiInput(e.target.value)}
                    className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="add-date"
                    className="min-h-12 shrink-0 gap-1.5"
                    disabled={!multiInput}
                    onClick={() => {
                      if (multiInput && !multiDates.includes(multiInput)) setMultiDates([...multiDates, multiInput].sort());
                      setMultiInput("");
                    }}
                  >
                    <Plus className="h-4 w-4" /> Add date
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Pick a date, then Add date. Repeat for each day you want.</p>
              </div>
            )}

            {/* Date range */}
            {!isEditMode && dateMode === "range" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2" htmlFor="sched-range-from">
                      From <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="sched-range-from"
                      type="date"
                      value={range.from}
                      min={todayStr}
                      onChange={(e) => setRange({ ...range, from: e.target.value })}
                      className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2" htmlFor="sched-range-to">
                      To <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="sched-range-to"
                      type="date"
                      value={range.to}
                      min={range.from || todayStr}
                      onChange={(e) => setRange({ ...range, to: e.target.value })}
                      className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                </div>
                {range.from && range.to && range.from > range.to && (
                  <p role="alert" className="-mt-2 text-sm text-destructive">The end date must be on or after the start date.</p>
                )}
                <fieldset>
                  <legend className="block text-sm font-medium text-foreground mb-2">Days of the week</legend>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAYS.map((day, index) => {
                      const on = range.days.includes(index);
                      return (
                        <Button
                          key={day}
                          type="button"
                          data-testid={`weekday-${day}`}
                          variant={on ? "default" : "outline"}
                          aria-pressed={on}
                          className="min-h-12 px-0 text-xs"
                          onClick={() =>
                            setRange({ ...range, days: on ? range.days.filter((d) => d !== index) : [...range.days, index] })
                          }
                        >
                          {day}
                        </Button>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            )}

            {/* Selected dates preview */}
            {!isEditMode && dateMode !== "single" && (
              <div data-testid="bulk-preview" className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">
                  {bulkDates.length === 0
                    ? "No dates selected yet."
                    : `${bulkDates.length} date${bulkDates.length === 1 ? "" : "s"} will get this schedule`}
                </p>
                {bulkDates.length > MAX_DATES && (
                  <p role="alert" className="text-sm text-destructive">Choose at most {MAX_DATES} dates at a time.</p>
                )}
                {bulkDates.length > 0 && (
                  <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                    {bulkDates.slice(0, MAX_DATES).map((date) => (
                      <li
                        key={date}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-foreground"
                      >
                        {shortDate(date)}
                        {dateMode === "multiple" && (
                          <button
                            type="button"
                            aria-label={`Remove ${date}`}
                            className="rounded-full p-0.5 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => setMultiDates(multiDates.filter((d) => d !== date))}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">Dates that already have a schedule at these times are skipped.</p>
              </div>
            )}

            {/* Start / End time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2" htmlFor="sched-start">
                  Start Time <span className="text-destructive">*</span>
                </label>
                <input
                  id="sched-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => set("startTime", e.target.value)}
                  className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2" htmlFor="sched-end">
                  End Time <span className="text-destructive">*</span>
                </label>
                <input
                  id="sched-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => set("endTime", e.target.value)}
                  className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                  required
                />
              </div>
            </div>
            {form.startTime && form.endTime && formatTime(form.startTime) >= formatTime(form.endTime) && (
              <p data-testid="schedule-time-error" role="alert" className="-mt-2 text-sm text-destructive">
                The end time must be later than the start time.
              </p>
            )}

            {/* Max Capacity */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2" htmlFor="sched-capacity">
                Max Capacity per Slot <span className="text-destructive">*</span>
              </label>
              <input
                id="sched-capacity"
                type="number"
                value={form.maxCapacity}
                onChange={(e) => set("maxCapacity", Number(e.target.value))}
                min="1"
                className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
                required
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Maximum number of appointments that can be booked for this date.
              </p>
            </div>

            {/* Is Closed toggle */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Day Status
              </label>
              <div className="flex gap-3">
                {/* Open */}
                <button
                  type="button"
                  id="status-open-btn"
                  onClick={() => set("isClosed", false)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    !form.isClosed
                      ? "bg-green-50 border-green-400 text-green-700 dark:bg-green-900/20 dark:border-green-600 dark:text-green-400"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                  Open
                </button>
                {/* Closed */}
                <button
                  type="button"
                  id="status-closed-btn"
                  onClick={() => set("isClosed", true)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    form.isClosed
                      ? "bg-destructive/10 border-destructive/40 text-destructive"
                      : "border-input text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                  Closed
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={isSubmitting}
                id="submit-schedule-btn"
                className="flex-1"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {isEditMode
                  ? "Update Schedule"
                  : dateMode === "single"
                    ? "Add Schedule"
                    : `Add ${bulkDates.length || ""} Schedule${bulkDates.length === 1 ? "" : "s"}`.replace("  ", " ")}
              </Button>
              <Button
                type="button"
                variant="outline"
                id="cancel-schedule-btn"
                onClick={() => router.push("/dashboard?tab=schedules")}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
