"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { ADMIN_STAFF_ROLES, isAdminOrStaff, requireAuth, requireRole } from "@/services/authorization";
import { fillClinicNames } from "@/services/clinic-names";
import type {
  TablesInsert,
  TablesUpdate,
  Tables,
} from "@/types/supabase";
import { listPetsForCurrentUser } from "@/services/pets";
import { CANCEL_REASONS, cancelAudienceFor, type CancellationReason } from "@/lib/cancellation-reasons";

export type Appointment = Tables<"appointments">;
export type AppointmentInsert = TablesInsert<"appointments">;
export type AppointmentUpdate = TablesUpdate<"appointments">;
export type AppointmentStatusHistory = Tables<"appointment_status_history">;

/**
 * Cancels bookings whose date passed before the clinic acted on them (database function
 * `cancel_overdue_appointments`). Runs before appointments are read so every screen shows
 * the current state. A failure (e.g. the migration is not applied yet) never blocks reads.
 */
export async function sweepOverdueAppointments() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_overdue_appointments");
  if (error) console.error("cancel_overdue_appointments failed:", error.message);
}

export async function listAppointments(filters?: {
  status?: Appointment["status"];
  petId?: string;
  ownerId?: string;
  veterinarianId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}) {
  await sweepOverdueAppointments();
  const supabase = await createClient();
  let query = supabase
    .from("appointments")
    .select(`
      *,
      pets (id, name, species, breed, sex),
      owner:profiles!appointments_owner_id_fkey (id, full_name, email, phone),
      veterinarian:profiles!appointments_assigned_veterinarian_id_fkey (id, full_name),
      services (id, name, duration_minutes, price_from, price_to)
    `)
    .order("scheduled_start", { ascending: false, nullsFirst: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.petId) {
    query = query.eq("pet_id", filters.petId);
  }
  if (filters?.ownerId) {
    query = query.eq("owner_id", filters.ownerId);
  }
  if (filters?.veterinarianId) {
    query = query.eq("assigned_veterinarian_id", filters.veterinarianId);
  }
  if (filters?.fromDate) {
    // Filter by preferred_date when scheduled_start may be null or different
    query = query.gte("preferred_date", filters.fromDate);
  }
  if (filters?.toDate) {
    // Filter by preferred_date when scheduled_start may be null or different
    query = query.lte("preferred_date", filters.toDate);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset !== undefined && filters?.offset !== null) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return fillClinicNames(data, "assigned_veterinarian_id", "veterinarian");
}

export async function getAppointmentById(id: string) {
  await sweepOverdueAppointments();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      *,
      pets (id, name, species, breed, sex, date_of_birth, age, color, notes),
      owner:profiles!appointments_owner_id_fkey (id, full_name, email, phone, address, emergency_contact_name, emergency_contact_phone),
      veterinarian:profiles!appointments_assigned_veterinarian_id_fkey (id, full_name),
      services (id, name, duration_minutes, price_from, price_to, category)
    `
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  const [withNames] = await fillClinicNames([data], "assigned_veterinarian_id", "veterinarian");
  return withNames;
}

// Appointments in these statuses no longer hold a place in a schedule slot.
const INACTIVE_BOOKING_STATUSES = ["cancelled", "no_show"] as const;

/** Whether a booking's clinic-local time (e.g. "09:00:00") falls in [startHour, endHour). */
function isInSlotHours(preferredTime: string | null, startHour: number, endHour: number) {
  if (!preferredTime) return true; // No time recorded: count it against every slot that day.
  const hour = Number(preferredTime.split(":")[0]);
  return hour >= startHour && hour < endHour;
}

const APPOINTMENT_MANAGEMENT_ERROR = "Only Admin or Staff can manage appointments.";

// Appointment management (cancel, schedule, reschedule, no-show) belongs to the front
// desk. Veterinarians work on encounters but do not manage bookings.
async function requireAppointmentManager(options: { allowOwner?: boolean } = {}) {
  const { profile } = await requireAuth();
  if (isAdminOrStaff(profile) || (options.allowOwner && profile.role === "owner")) return profile;
  throw new Error(APPOINTMENT_MANAGEMENT_ERROR);
}

// Only a booking that has not happened yet can be cancelled (not diagnosed, paid, etc.).
const CANCELLABLE_STATUSES = ["booked", "requested", "scheduled", "confirmed"] as const;

export async function cancelAppointment(id: string, reason?: string) {
  // Owners may cancel their own bookings; RLS limits them to their own rows.
  const profile = await requireAppointmentManager({ allowOwner: true });
  const allowedReasons = CANCEL_REASONS[cancelAudienceFor(profile.role)].map((r) => r.value);
  if (reason && !allowedReasons.includes(reason as CancellationReason)) {
    throw new Error("Choose a valid cancellation reason.");
  }
  const cancellationReason = (reason as CancellationReason | undefined) ?? allowedReasons[0];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: cancellationReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", CANCELLABLE_STATUSES)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This appointment can no longer be cancelled.");
  revalidatePath("/dashboard/appointments");
  return data;
}

export async function listOwnerAppointments(ownerId: string) {
  await sweepOverdueAppointments();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      *,
      pets (id, name, species, breed, sex),
      services (id, name, duration_minutes, price_from, price_to)
    `
    )
    .eq("owner_id", ownerId)
    .order("scheduled_start", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function requestAppointment(input: Omit<AppointmentInsert, 'owner_id' | 'id'>) {
  await requireAuth();
  // Validate that the pet_id in input is linked to the owner's profile
  const pets = await listPetsForCurrentUser();
  const petIds = pets.map(pet => pet.id);
  if (!petIds.includes(input.pet_id)) {
    throw new Error("You can only request appointments for your own pets.");
  }
  if (!input.preferred_date || !input.preferred_time) {
    throw new Error("Please choose a date and time slot.");
  }

  // Booking is approved automatically when the slot has room. The capacity check and
  // insert happen atomically in the database, so the last spot cannot be double-booked.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_appointment", {
    p_pet_id: input.pet_id,
    p_service_id: input.service_id ?? undefined,
    p_preferred_date: input.preferred_date,
    p_preferred_time: input.preferred_time,
    p_scheduled_start: input.scheduled_start ?? undefined,
    p_scheduled_end: input.scheduled_end ?? undefined,
    p_reason: input.reason ?? undefined,
    p_notes: input.notes ?? undefined,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/appointments");
  return data;
}

/**
 * Get available appointment slots based on admin-configured schedules.
 * Checks schedules and subtracts already-booked appointments.
 * If veterinarianId is provided, only checks appointments for that vet.
 * If not provided, checks all appointments (global capacity).
 */
export async function listAppointmentSchedules() {
  const { createAdminClient } = await import("@/utils/supabase/server");
  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase
      .from("appointment_schedules")
      .select("*")
      .eq("status", "active")
      .order("specific_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (error) {
      console.error("EXACT_PG_ERROR_listAppointmentSchedules:", JSON.stringify({
        message: error.message,
        hint: error.hint,
        code: error.code
      }, null, 2));
      throw error;
    }

    // Attach how many places each dated schedule already has taken, so the booking
    // calendar can show full days before the owner picks them. Same counting rule as
    // getAvailableSlots and public.book_appointment().
    const dates = [...new Set(data.map((s) => s.specific_date).filter((d): d is string => Boolean(d)))];
    const { data: bookings, error: bookingsError } = dates.length
      ? await supabase
          .from("appointments")
          .select("preferred_date, preferred_time")
          .in("preferred_date", dates)
          .not("status", "in", `(${INACTIVE_BOOKING_STATUSES.join(",")})`)
      : { data: [], error: null };
    if (bookingsError) throw bookingsError;

    return data.map((schedule) => {
      const startH = Number(schedule.start_time.split(":")[0]);
      const endH = Number(schedule.end_time.split(":")[0]);
      const bookedCount = schedule.specific_date
        ? (bookings ?? []).filter(
            (b) => b.preferred_date === schedule.specific_date && isInSlotHours(b.preferred_time, startH, endH),
          ).length
        : 0;
      return { ...schedule, booked_count: bookedCount, is_full: bookedCount >= schedule.max_capacity };
    });
  } catch (err) {
    console.error("EXACT_PG_ERROR_CATCH_listAppointmentSchedules:", JSON.stringify(err, null, 2));
    throw err;
  }
}

// Schedules set the booking limit, so only Admin and Staff may change them (vets can view).
async function requireScheduleManager() {
  const { profile } = await requireRole(ADMIN_STAFF_ROLES);
  return profile;
}

function validateSchedule(input: { start_time?: string; end_time?: string; max_capacity?: number }) {
  if (input.start_time && input.end_time && input.start_time.slice(0, 5) >= input.end_time.slice(0, 5)) {
    throw new Error("The end time must be later than the start time.");
  }
  if (input.max_capacity !== undefined && (!Number.isInteger(input.max_capacity) || input.max_capacity < 1)) {
    throw new Error("Max capacity must be a whole number of at least 1.");
  }
}

function scheduleErrorMessage(error: { code?: string; message?: string }, fallback: string) {
  if (error.code === "23505") return "A schedule already exists for that date and start time.";
  if (error.code === "23514") return "Check the times and capacity: the end must be after the start and capacity at least 1.";
  return error.message || fallback;
}

export async function createAppointmentSchedule(input: {
  specific_date: string; // ISO date string "YYYY-MM-DD", optional for recurring
  start_time: string;
  end_time: string;
  max_capacity: number;
  day_of_week?: number; // Day of week (0-6), calculated from specific_date if provided
  is_recurring?: boolean;
  is_closed?: boolean;
}) {
  const user = await requireScheduleManager();
  validateSchedule(input);
  const supabase = await createClient();

  // Calculate day_of_week from specific_date if not provided
  const calculatedDayOfWeek = input.day_of_week !== undefined
    ? input.day_of_week
    : new Date(input.specific_date).getDay();

  // Ensure TIME format is HH:MM:SS (PostgreSQL TIME with time zone expects seconds)
  const formatTime = (time: string) => {
    // If time is already in HH:MM:SS format, return as-is
    if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
      return time;
    }
    // If time is in HH:MM format, append :00 for seconds
    if (/^\d{2}:\d{2}$/.test(time)) {
      return `${time}:00`;
    }
    // Fallback - should not happen with proper form validation
    return time;
  };

  const payload = {
    specific_date: input.specific_date,
    start_time: formatTime(input.start_time),
    end_time: formatTime(input.end_time),
    max_capacity: input.max_capacity,
    day_of_week: calculatedDayOfWeek,
    is_recurring: input.is_recurring ?? false,
    is_closed: input.is_closed ?? false,
    status: "active",
  };

  const { data, error } = await supabase
    .from("appointment_schedules")
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error("EXACT_PG_ERROR_createAppointmentSchedule:", JSON.stringify(error, null, 2));
    throw new Error(scheduleErrorMessage(error, "Failed to create schedule"));
  }

  // Insert audit log
  await supabase.from("schedule_audit_logs").insert([{
    actor_id: user.id,
    target_schedule_id: data.id,
    action: "created",
    next_values: data,
  }]);

  revalidatePath("/dashboard/schedules");
  return data;
}

export async function updateAppointmentSchedule(
  id: string,
  input: {
    specific_date?: string;
    start_time?: string;
    end_time?: string;
    max_capacity?: number;
    day_of_week?: number;
    is_closed?: boolean;
  }
) {
  const user = await requireScheduleManager();
  const supabase = await createClient();

  // Ensure TIME format is HH:MM:SS (PostgreSQL TIME with time zone expects seconds)
  const formatTime = (time: string | undefined) => {
    if (!time) return time;
    // If time is already in HH:MM:SS format, return as-is
    if (/^\d{2}:\d{2}:\d{2}$/.test(time)) {
      return time;
    }
    // If time is in HH:MM format, append :00 for seconds
    if (/^\d{2}:\d{2}$/.test(time)) {
      return `${time}:00`;
    }
    // Fallback - should not happen with proper form validation
    return time;
  };

  const { data: currentSchedule } = await supabase
    .from("appointment_schedules")
    .select("*")
    .eq("id", id)
    .single();

  validateSchedule({
    start_time: input.start_time ?? currentSchedule?.start_time,
    end_time: input.end_time ?? currentSchedule?.end_time,
    max_capacity: input.max_capacity,
  });

  const isClosing = input.is_closed === true && currentSchedule?.is_closed === false;
  const isTimeOrDateChanged =
    (input.specific_date && input.specific_date !== currentSchedule?.specific_date) ||
    (input.start_time && formatTime(input.start_time) !== currentSchedule?.start_time) ||
    (input.end_time && formatTime(input.end_time) !== currentSchedule?.end_time);

  if (currentSchedule && (isClosing || isTimeOrDateChanged)) {
    await cancelAppointmentsForSchedule(currentSchedule);
  }

  const payload = {
    ...input,
    start_time: formatTime(input.start_time),
    end_time: formatTime(input.end_time),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("appointment_schedules")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("EXACT_PG_ERROR_updateAppointmentSchedule:", JSON.stringify(error, null, 2));
    throw new Error(scheduleErrorMessage(error, "Failed to update schedule"));
  }

  // Insert audit log
  await supabase.from("schedule_audit_logs").insert([{
    actor_id: user.id,
    target_schedule_id: data.id,
    action: "updated",
    previous_values: currentSchedule,
    next_values: data,
  }]);

  revalidatePath("/dashboard/schedules");
  return data;
}

export async function deleteAppointmentSchedule(id: string) {
  const user = await requireScheduleManager();
  const supabase = await createClient();

  const { data: currentSchedule } = await supabase
    .from("appointment_schedules")
    .select("*")
    .eq("id", id)
    .single();

  if (currentSchedule) {
    await cancelAppointmentsForSchedule(currentSchedule);
  }

  const { error } = await supabase
    .from("appointment_schedules")
    .delete()
    .eq("id", id);
  if (error) throw error;

  // Insert audit log
  await supabase.from("schedule_audit_logs").insert([{
    actor_id: user.id,
    target_schedule_id: id, // It's deleted, but we log the ID
    action: "deleted",
    previous_values: currentSchedule,
  }]);

  revalidatePath("/dashboard/schedules");
}

export async function getAvailableSlots(
  veterinarianId?: string,
  date?: string
) {
  // Use admin client to count ALL appointments, otherwise owners only see their own bookings
  // and slots will appear available even if they are fully booked by others.
  const { createAdminClient } = await import("@/utils/supabase/server");
  const supabase = createAdminClient();
  if (!date) return { slots: [], scheduled: [] };

  let schedules: any[] = [];

  try {
    // 1. First, check for specific date schedules (is_recurring=false or specific_date set)
    const specificDate = new Date(date).toISOString().split("T")[0];
    const { data: specificSchedules, error: specificError } = await supabase
      .from("appointment_schedules")
      .select("*")
      .eq("specific_date", specificDate)
      .eq("status", 'active');

    if (specificError) {
      console.error("EXACT_PG_ERROR_getAvailableSlots_specific:", JSON.stringify({
        message: specificError.message,
        hint: specificError.hint,
        code: specificError.code
      }, null, 2));
      throw specificError;
    }

    // 2. If no specific date schedule found, fall back to recurring day-of-week schedules
    if (!specificSchedules || specificSchedules.length === 0) {
      // Fall back to recurring schedules for this day of week
      const dayOfWeek = new Date(`${date}T00:00:00`).getDay();
      const { data: fallbackSchedules, error: fallbackError } = await supabase
        .from("appointment_schedules")
        .select("*")
        .eq("day_of_week", dayOfWeek)
        .eq("is_recurring", true)
        .eq("status", 'active');

      if (fallbackError) throw fallbackError;
      schedules = fallbackSchedules || [];
    } else {
      schedules = specificSchedules;
    }
  } catch (err) {
    console.error("EXACT_PG_ERROR_CATCH_getAvailableSlots:", JSON.stringify(err, null, 2));
    throw err;
  }

  if (!schedules || schedules.length === 0) {
    // No schedules configured; return no available slots
    return { slots: [], scheduled: [] };
  }

  // 3. Count bookings that already hold a place on this date.
  //
  // Slot membership uses the clinic-local preferred_date + preferred_time, which do not
  // depend on any timezone. (scheduled_start is a UTC instant built in the booker's
  // browser timezone, so comparing it with server-local slot times broke the booking
  // limit on UTC servers such as Vercel.) This mirrors public.book_appointment().
  const { data: bookedAppts, error: bookedError } = await supabase
    .from("appointments")
    .select("scheduled_start, scheduled_end, preferred_date, preferred_time")
    .eq("preferred_date", date)
    .not("status", "in", `(${INACTIVE_BOOKING_STATUSES.join(",")})`);

  if (bookedError) throw bookedError;

  // 4. Build slots from schedules, marking capacity
  const slots = schedules.map((schedule) => {
    // Parse time strings from Supabase (format: "HH:MM:SS")
    const [startH, startM] = schedule.start_time.split(":").map(Number);
    const [endH, endM]     = schedule.end_time.split(":").map(Number);

    const booked = (bookedAppts || []).filter((appt) => isInSlotHours(appt.preferred_time, startH, endH));

    const currentBookings = booked.length;
    const available       = schedule.max_capacity - currentBookings;
    const isAvailable     = !schedule.is_closed && available > 0;

    // Format time for display (HH:MM AM/PM)
    const formatTime = (h: number, m: number) => {
      const period   = h >= 12 ? "PM" : "AM";
      const displayH = h % 12 || 12;
      return `${displayH}:${m.toString().padStart(2, "0")} ${period}`;
    };

    return {
      id: schedule.id,
      start: schedule.start_time,
      end:   schedule.end_time,
      maxCapacity:     schedule.max_capacity,
      currentBookings,
      available,
      isAvailable,
      label: `${formatTime(startH, startM)} - ${formatTime(endH, endM)}`,
    };
  });

  return { slots, scheduled: bookedAppts || [] };
}

async function cancelAppointmentsForSchedule(schedule: Record<string, unknown>) {
  if (!schedule.specific_date) return;
  const supabase = await createClient();

  const date = String(schedule.specific_date);
  const { data: bookedAppts } = await supabase
    .from("appointments")
    .select("id, preferred_time")
    .eq("status", "booked")
    .eq("preferred_date", date);

  const [startH] = String(schedule.start_time).split(":").map(Number);
  const [endH]   = String(schedule.end_time).split(":").map(Number);

  // Same clinic-local slot matching as getAvailableSlots / book_appointment.
  const toCancelIds = (bookedAppts || [])
    .filter((appt) => isInSlotHours(appt.preferred_time, startH, endH))
    .map((appt) => appt.id);

  if (toCancelIds.length > 0) {
    await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancellation_reason: "other",
        updated_at: new Date().toISOString()
      })
      .in("id", toCancelIds);
  }
}