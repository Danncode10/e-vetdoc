"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PawPrint,
  Stethoscope,
  CalendarDays,
  Clock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { requestAppointment } from "@/services/appointments";
import { listPetsForCurrentUser } from "@/services/pets";
import { listServices } from "@/services/services";
import { getAvailableSlots, listAppointmentSchedules, listMyBookedDates } from "@/services/appointments";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

type PetOption = { id: string; name: string; species?: string | null; breed?: string | null };
type ServiceOption = { id: string; name: string; duration_minutes?: number | null; price_from?: number | null };
type SlotOption = {
  id: string;
  start: string;
  end: string;
  maxCapacity: number;
  currentBookings: number;
  available: number;
  isAvailable: boolean;
  hasEnded: boolean;
  pendingCount: number;
  label: string;
};

// ──────────────────────────────────────────────────────────────
// Calendar helpers
// ──────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_SHORT = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function toYYYYMM(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}`;
}
function toYYYYMMDD(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function formatDisplayDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function formatTime12(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 || 12;
  return `${displayH}:${String(m).padStart(2,"0")} ${period}`;
}

// ──────────────────────────────────────────────────────────────
// Step progress bar
// ──────────────────────────────────────────────────────────────

const STEPS = [
  { icon: PawPrint,     label: "Pet & Service" },
  { icon: CalendarDays, label: "Pick a Date" },
  { icon: Clock,        label: "Choose Time" },
  { icon: FileText,     label: "Details" },
];

function StepBar({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  done
                    ? "bg-primary border-primary text-primary-foreground"
                    : active
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted border-border text-muted-foreground"
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span className={`text-[10px] font-medium whitespace-nowrap ${active ? "text-primary" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-1 mt-[-18px] transition-all duration-300 ${
                  done ? "bg-primary" : "bg-border"
                }`}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Mini calendar
// ──────────────────────────────────────────────────────────────

interface MiniCalendarProps {
  scheduleMap: Map<string, any>; // dateStr → schedule
  fullDates: Set<string>; // dates whose every open slot has reached its booking limit
  endedDates: Set<string>; // today, once every open slot on it has ended
  bookedDates: Set<string>; // dates on which this owner already has an appointment
  selectedDate: string;
  onSelect: (dateStr: string) => void;
}

/** Today in the clinic's timezone (same "today" the server uses for booking rules). */
function clinicTodayStr() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

function MiniCalendar({ scheduleMap, fullDates, endedDates, bookedDates, selectedDate, onSelect }: MiniCalendarProps) {
  const todayStr = clinicTodayStr();
  const [todayYear, todayMonth] = todayStr.split("-").map(Number);
  const todayObj = new Date(todayYear, todayMonth - 1, 1);

  const [viewYear, setViewYear] = useState(todayObj.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayObj.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Build cells
  const cells: Array<{ day: number | null; dateStr: string | null }> = [];
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: toYYYYMMDD(viewYear, viewMonth, d) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, dateStr: null });

  return (
    <div className="w-full">
      {/* Nav */}
      <div className="flex items-center justify-between mb-4 px-1">
        <button
          type="button"
          onClick={prevMonth}
          className="p-2 rounded-xl hover:bg-muted text-foreground transition-colors border border-border/70 shadow-xs"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-base font-bold text-foreground tracking-tight">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-2 rounded-xl hover:bg-muted text-foreground transition-colors border border-border/70 shadow-xs"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-2 bg-muted/50 rounded-xl py-2 border border-border/60">
        {DAY_SHORT.map(d => (
          <div key={d} className="text-center text-xs font-bold text-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map(({ day, dateStr }, idx) => {
          if (!day || !dateStr) {
            return <div key={idx} className="min-h-[56px] rounded-xl" />;
          }

          const isPast = dateStr < todayStr;
          const schedule = scheduleMap.get(dateStr) ?? null;
          const isMine = !isPast && bookedDates.has(dateStr);
          const isEnded = !isPast && !isMine && endedDates.has(dateStr);
          const isFull = !isPast && !isMine && !isEnded && fullDates.has(dateStr);
          const hasOpen = schedule && !schedule.is_closed && !isFull && !isMine && !isEnded;
          const isClosed = schedule && schedule.is_closed;
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          const isDisabled = isPast || !hasOpen;

          return (
            <button
              key={idx}
              type="button"
              disabled={isDisabled}
              onClick={() => !isDisabled && onSelect(dateStr)}
              className={`
                relative min-h-[56px] flex flex-col items-center justify-center rounded-xl p-1 transition-all duration-150
                ${isSelected
                  ? "bg-primary text-primary-foreground font-bold shadow-md ring-2 ring-primary ring-offset-2 scale-105 z-10"
                  : isMine
                  ? "bg-primary/10 text-primary border-2 border-primary/40 font-semibold cursor-not-allowed"
                  : isFull
                  ? "bg-destructive/10 text-destructive border border-destructive/40 font-semibold cursor-not-allowed"
                  : hasOpen && !isPast
                  ? "bg-emerald-50 text-emerald-950 border-2 border-emerald-500 hover:bg-emerald-100 hover:border-emerald-600 font-bold dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-500 shadow-xs cursor-pointer"
                  : isToday
                  ? "bg-muted/70 text-foreground border-2 border-primary/50 font-bold cursor-not-allowed"
                  : isClosed && !isPast
                  ? "bg-orange-50 text-orange-900 border border-orange-200 opacity-70 font-semibold cursor-not-allowed dark:bg-orange-950/20 dark:text-orange-300"
                  : "bg-muted/20 text-foreground/70 border border-border/50 font-medium cursor-not-allowed hover:bg-muted/30"
                }
              `}
              data-date={dateStr}
              title={
                isPast
                  ? "Past date"
                  : isMine
                  ? "This pet already has an appointment on this day"
                  : isEnded
                  ? "Booking hours for today have ended"
                  : isFull
                  ? "Fully booked"
                  : hasOpen
                  ? `Available: ${formatTime12(schedule.start_time)} – ${formatTime12(schedule.end_time)}`
                  : isClosed
                  ? "Clinic closed this day"
                  : "No schedule available"
              }
            >
              <span className={`text-sm ${isSelected ? "text-primary-foreground font-bold" : hasOpen && !isPast ? "text-emerald-950 dark:text-emerald-200 font-bold" : ""}`}>
                {day}
              </span>
              {hasOpen && !isPast && !isSelected && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1" />
              )}
              {isFull && <span className="text-[9px] font-bold uppercase leading-none mt-0.5">Full</span>}
              {isMine && <span className="text-[9px] font-bold uppercase leading-none mt-0.5">Booked</span>}
              {isToday && !isMine && !isSelected && (
                <span className="text-[9px] font-semibold uppercase leading-none mt-0.5 text-muted-foreground">Today</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2 mt-4 pt-3.5 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-md bg-emerald-100 border-2 border-emerald-500" />
          <span className="text-xs font-semibold text-foreground">Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-md bg-destructive/10 border border-destructive/40" />
          <span className="text-xs font-semibold text-destructive">Full</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-md bg-primary/10 border-2 border-primary/40" />
          <span className="text-xs font-semibold text-primary">Pet already booked</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-md bg-muted/40 border border-border/60" />
          <span className="text-xs font-semibold text-muted-foreground">Unavailable</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3.5 h-3.5 rounded-md bg-primary" />
          <span className="text-xs font-semibold text-foreground">Selected</span>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main form component
// ──────────────────────────────────────────────────────────────

export function AppointmentRequestForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [isPending, setIsPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pets, setPets] = useState<PetOption[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [isLoadingPets, setIsLoadingPets] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  const [formData, setFormData] = useState({
    petId: "",
    serviceId: "",
    preferredDate: "",
    preferredTime: "",
    reason: "",
    notes: "",
  });

  // Load pets & services
  useEffect(() => {
    listPetsForCurrentUser()
      .then((data) => setPets(data as PetOption[]))
      .catch(() => toast.error("Could not load your pets. Please refresh."))
      .finally(() => setIsLoadingPets(false));
    listServices()
      .then((data) => setServices(data as ServiceOption[]))
      .catch(() => toast.error("Could not load clinic services. Please refresh."))
      .finally(() => setIsLoadingServices(false));
  }, []);

  // Fetch clinic schedules
  const schedulesQuery = useQuery({
    queryKey: ["appointment-schedules"],
    queryFn: async () => {
      const result = await listAppointmentSchedules();
      return result || [];
    },
    // Other owners book too; refresh so full days show up without reloading.
    refetchOnWindowFocus: true,
  });

  // Build schedule map: dateStr → schedule
  const scheduleMap = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const s of schedulesQuery.data ?? []) {
      if (s.specific_date) {
        map.set(String(s.specific_date).slice(0, 10), s);
      }
    }
    return map;
  }, [schedulesQuery.data]);

  // Each pet can be booked once per day, so days this pet is already booked are blocked.
  const bookedDatesQuery = useQuery({
    queryKey: ["my-booked-dates"],
    queryFn: () => listMyBookedDates(),
    refetchOnWindowFocus: true,
  });
  const bookedDates = React.useMemo(
    () => new Set((bookedDatesQuery.data ?? []).filter((b) => b.petId === formData.petId).map((b) => b.date)),
    [bookedDatesQuery.data, formData.petId],
  );

  // Same-day booking stays open until today's last slot ends.
  const endedDates = React.useMemo(() => {
    const openByDate = new Map<string, boolean[]>();
    for (const s of schedulesQuery.data ?? []) {
      if (!s.specific_date || s.is_closed) continue;
      const date = String(s.specific_date).slice(0, 10);
      openByDate.set(date, [...(openByDate.get(date) ?? []), s.has_ended]);
    }
    return new Set([...openByDate].filter(([, ended]) => ended.every(Boolean)).map(([date]) => date));
  }, [schedulesQuery.data]);

  // A date is full once every open slot on it has reached its booking limit.
  const fullDates = React.useMemo(() => {
    const openByDate = new Map<string, boolean[]>();
    for (const s of schedulesQuery.data ?? []) {
      if (!s.specific_date || s.is_closed) continue;
      const date = String(s.specific_date).slice(0, 10);
      openByDate.set(date, [...(openByDate.get(date) ?? []), s.is_full]);
    }
    return new Set([...openByDate].filter(([, full]) => full.every(Boolean)).map(([date]) => date));
  }, [schedulesQuery.data]);

  // Fetch available slots when date selected
  const slotsQuery = useQuery({
    queryKey: ["available-slots", formData.preferredDate],
    queryFn: async () => {
      try {
        if (!formData.preferredDate) return [];
        const result = await getAvailableSlots(undefined, formData.preferredDate);
        return (result.slots || []) as SlotOption[];
      } catch (err) {
        console.error("SLOTS_QUERY_ERROR:", err);
        throw err;
      }
    },
    enabled: !!formData.preferredDate,
    refetchOnWindowFocus: false,
  });

  const set = (field: string, value: string) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const selectedPet = pets.find((p) => p.id === formData.petId);
  const selectedService = services.find((s) => s.id === formData.serviceId);
  const selectedSlot = slotsQuery.data?.find((s) => s.start === formData.preferredTime);

  // Step validation
  const canProceedStep0 = !!formData.petId && !!formData.serviceId;
  const canProceedStep1 = !!formData.preferredDate;
  const canProceedStep2 = !!formData.preferredTime;

  const goNext = () => {
    setFormError(null);
    if (step === 0 && !canProceedStep0) {
      setFormError("Please select a pet and a service to continue.");
      return;
    }
    if (step === 1 && !canProceedStep1) {
      setFormError("Please choose an available date.");
      return;
    }
    if (step === 2 && !canProceedStep2) {
      setFormError("Please select a time slot.");
      return;
    }
    setStep((s) => s + 1);
  };
  const goBack = () => { setFormError(null); setStep((s) => s - 1); };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // Guard: only allow submission when on the final step
    if (step !== 3) return;
    if (!formData.petId || !formData.serviceId || !formData.preferredDate || !formData.preferredTime) {
      setFormError("Please complete all required steps.");
      return;
    }
    if (selectedSlot && !selectedSlot.isAvailable) {
      setFormError(`This slot is fully booked (max ${selectedSlot.maxCapacity}).`);
      return;
    }
    setIsPending(true);
    setFormError(null);
    try {
      const slotStart = new Date(formData.preferredDate);
      const [startH, startM] = selectedSlot!.start.split(":").map(Number);
      slotStart.setHours(startH, startM, 0, 0);

      const slotEnd = new Date(formData.preferredDate);
      const [endH, endM] = selectedSlot!.end.split(":").map(Number);
      slotEnd.setHours(endH, endM, 0, 0);

      await requestAppointment({
        pet_id: formData.petId,
        service_id: formData.serviceId,
        preferred_date: formData.preferredDate,
        preferred_time: formData.preferredTime,
        scheduled_start: slotStart.toISOString(),
        scheduled_end: slotEnd.toISOString(),
        reason: formData.reason,
        notes: formData.notes,
      });
      toast.success("Appointment requested! The clinic will approve it soon.");
      router.push("/dashboard?tab=appointments");
      router.refresh();
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : "Failed to submit. Please try again.";
      // Someone may have taken the last place meanwhile: show the latest availability.
      void queryClient.invalidateQueries({ queryKey: ["appointment-schedules"] });
      void queryClient.invalidateQueries({ queryKey: ["available-slots"] });
      void queryClient.invalidateQueries({ queryKey: ["my-booked-dates"] });
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-6 px-4">
      {/* Back link */}
      <Link
        href="/dashboard?tab=appointments"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to appointments
      </Link>

      {/* Title */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">Appointment Request</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Book a Visit</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Follow the steps below. Your visit is confirmed right away while the day still has open slots.
        </p>
      </div>

      {/* Step bar */}
      <StepBar current={step} />

      {/* Card */}
      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">

        {/* ── STEP 0: Pet & Service ── */}
        {step === 0 && (
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <PawPrint className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Which pet & what service?</h2>
                <p className="text-xs text-muted-foreground">Choose the pet that needs care and the type of service.</p>
              </div>
            </div>

            {/* Pet cards */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select a Pet <span className="text-destructive">*</span>
              </label>
              {isLoadingPets ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading your pets…
                </div>
              ) : pets.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                  No pets found.{" "}
                  <Link href="/dashboard?tab=pets" className="text-primary underline underline-offset-2">
                    Add a pet first
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {pets.map((pet) => (
                    <button
                      key={pet.id}
                      type="button"
                      onClick={() => set("petId", pet.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all ${
                        formData.petId === pet.id
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        formData.petId === pet.id ? "bg-primary/20" : "bg-muted"
                      }`}>
                        <PawPrint className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{pet.name}</p>
                        {pet.species && (
                          <p className="text-[10px] text-muted-foreground capitalize">{pet.species}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Service select */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2" htmlFor="appt-service">
                Select a Service <span className="text-destructive">*</span>
              </label>
              {isLoadingServices ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading services…
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {services.map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => set("serviceId", svc.id)}
                      className={`flex items-start gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                        formData.serviceId === svc.id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        formData.serviceId === svc.id ? "bg-primary/20" : "bg-muted"
                      }`}>
                        <Stethoscope className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-semibold truncate ${
                          formData.serviceId === svc.id ? "text-primary" : "text-foreground"
                        }`}>
                          {svc.name}
                        </p>
                        {svc.duration_minutes && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            ~{svc.duration_minutes} min
                            {svc.price_from ? ` · from ₱${svc.price_from}` : ""}
                          </p>
                        )}
                      </div>
                      {formData.serviceId === svc.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-auto mt-0.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 1: Pick a Date ── */}
        {step === 1 && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <CalendarDays className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Pick a date</h2>
                <p className="text-xs text-muted-foreground">
                  Green dates have open slots, including today until its last slot ends. Each pet can be booked once per day.
                </p>
              </div>
            </div>

            {schedulesQuery.isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <MiniCalendar
                scheduleMap={scheduleMap}
                fullDates={fullDates}
                endedDates={endedDates}
                bookedDates={bookedDates}
                selectedDate={formData.preferredDate}
                onSelect={(d) => {
                  set("preferredDate", d);
                  set("preferredTime", ""); // reset time when date changes
                  setFormError(null);
                }}
              />
            )}

            {formData.preferredDate && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm text-primary font-medium">{formatDisplayDate(formData.preferredDate)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Choose Time Slot ── */}
        {step === 2 && (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Choose a time slot</h2>
                <p className="text-xs text-muted-foreground">{formatDisplayDate(formData.preferredDate)}</p>
              </div>
            </div>

            {slotsQuery.isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !slotsQuery.data?.length ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No available time slots for this date.</p>
                <button
                  type="button"
                  onClick={() => { set("preferredDate", ""); goBack(); }}
                  className="text-xs text-primary underline underline-offset-2 mt-1"
                >
                  Choose a different date
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {slotsQuery.data.map((slot) => {
                  const isSelected = formData.preferredTime === slot.start;
                  const percentFull = slot.maxCapacity > 0
                    ? Math.round((slot.currentBookings / slot.maxCapacity) * 100)
                    : 0;
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      disabled={!slot.isAvailable}
                      onClick={() => { set("preferredTime", slot.start); setFormError(null); }}
                      className={`flex flex-col gap-2.5 p-4 rounded-xl border-2 text-left transition-all ${
                        !slot.isAvailable
                          ? "border-border bg-muted/30 opacity-50 cursor-not-allowed"
                          : isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary ring-offset-1"
                          : "border-border bg-card hover:border-primary/50 hover:bg-muted/40 cursor-pointer"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-semibold ${isSelected ? "text-primary" : "text-foreground"}`}>
                          {slot.label}
                        </span>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-primary" />}
                        {!slot.isAvailable && (
                          slot.hasEnded ? (
                            <span className="text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted">
                              Ended
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-destructive px-1.5 py-0.5 rounded-full bg-destructive/10">
                              Full
                            </span>
                          )
                        )}
                      </div>

                      {/* Capacity bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="w-3 h-3" />
                            <span>{slot.currentBookings}/{slot.maxCapacity} approved</span>
                            {slot.pendingCount > 0 && <span className="text-muted-foreground/80">· {slot.pendingCount} pending</span>}
                          </div>
                          <span className={`text-[10px] font-medium ${
                            slot.isAvailable ? "text-green-600 dark:text-green-400" : "text-destructive"
                          }`}>
                            {slot.isAvailable ? `${slot.available} left` : slot.hasEnded ? "Slot ended" : "No slots"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              percentFull >= 100
                                ? "bg-destructive"
                                : percentFull >= 75
                                ? "bg-orange-400"
                                : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(percentFull, 100)}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Details & Review ── */}
        {step === 3 && (
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Add details & confirm</h2>
                <p className="text-xs text-muted-foreground">Optional notes help the vet prepare.</p>
              </div>
            </div>

            {/* Summary card */}
            <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your booking summary</p>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <PawPrint className="w-3.5 h-3.5" />
                  Pet
                </div>
                <span className="font-medium text-foreground">{selectedPet?.name ?? "—"}</span>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Stethoscope className="w-3.5 h-3.5" />
                  Service
                </div>
                <span className="font-medium text-foreground">{selectedService?.name ?? "—"}</span>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Date
                </div>
                <span className="font-medium text-foreground">{formatDisplayDate(formData.preferredDate)}</span>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  Time
                </div>
                <span className="font-medium text-foreground">
                  {selectedSlot ? selectedSlot.label : "—"}
                </span>
              </div>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2" htmlFor="appt-reason">
                Reason for visit
              </label>
              <textarea
                id="appt-reason"
                value={formData.reason}
                onChange={(e) => set("reason", e.target.value)}
                rows={3}
                placeholder="e.g. Annual check-up, limping on left paw, routine vaccines…"
                disabled={isPending}
                className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2" htmlFor="appt-notes">
                Additional notes <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <textarea
                id="appt-notes"
                value={formData.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Anything else the vet should know…"
                disabled={isPending}
                className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              />
            </div>
          </div>
        )}

        {/* Error banner */}
        {formError && (
          <div className="mx-6 mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{formError}</p>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border bg-muted/20">
          {step === 0 ? (
            <Link
              href="/dashboard?tab=appointments"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </Link>
          ) : (
            <button
              type="button"
              onClick={goBack}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {step < 3 ? (
            <Button
              type="button"
              onClick={goNext}
              id={`step-${step}-next-btn`}
              disabled={
                (step === 0 && (isLoadingPets || isLoadingServices)) ||
                (step === 1 && schedulesQuery.isLoading) ||
                (step === 2 && slotsQuery.isLoading)
              }
              className="flex items-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => handleSubmit()}
              disabled={isPending}
              id="submit-appt-btn"
              className="flex items-center gap-2"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPending ? "Submitting…" : "Submit request"}
              {!isPending && <CheckCircle2 className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {/* Step hint */}
      <p className="text-center text-xs text-muted-foreground mt-4">
        Step {step + 1} of {STEPS.length}
      </p>
    </div>
  );
}