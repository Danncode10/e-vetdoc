"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { isAdminOrStaff, isStaff, requireAuth } from "@/services/authorization";
import type {
  TablesInsert,
  TablesUpdate,
  Tables,
} from "@/types/supabase";
import { listPetsForCurrentUser } from "@/services/pets";

export type Appointment = Tables<"appointments">;
export type AppointmentInsert = TablesInsert<"appointments">;
export type AppointmentUpdate = TablesUpdate<"appointments">;
export type AppointmentStatusHistory = Tables<"appointment_status_history">;

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
  return data;
}

export async function getAppointmentById(id: string) {
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
  return data;
}

export async function createAppointment(input: AppointmentInsert) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      ...input,
      status: 'booked',
      requested_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/appointments");
  return data;
}

const APPOINTMENT_MANAGEMENT_ERROR = "Only Admin or Staff can manage appointments.";

// Appointment management (cancel, schedule, reschedule, no-show) belongs to the front
// desk. Veterinarians work on encounters but do not manage bookings.
async function requireAppointmentManager(options: { allowOwner?: boolean } = {}) {
  const { profile } = await requireAuth();
  if (isAdminOrStaff(profile) || (options.allowOwner && profile.role === "owner")) return profile;
  throw new Error(APPOINTMENT_MANAGEMENT_ERROR);
}

export async function updateAppointment(id: string, updates: AppointmentUpdate) {
  await requireAppointmentManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/appointments");
  return data;
}

export async function cancelAppointment(id: string, reason?: string) {
  // Owners may cancel their own bookings; RLS limits them to their own rows.
  await requireAppointmentManager({ allowOwner: true });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: (reason as any) || "owner_request",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/appointments");
  return data;
}

export async function scheduleAppointment(
  id: string,
  input: {
    scheduledStart: string;
    scheduledEnd: string;
    assignedVeterinarianId: string;
    notes?: string;
  }
) {
  await requireAppointmentManager();
  const supabase = await createClient();

  // Check for double-booking
  const { data: doubleBooked } = await supabase.rpc("check_double_booking", {
    p_veterinarian_id: input.assignedVeterinarianId,
    p_start: input.scheduledStart,
    p_end: input.scheduledEnd,
    p_exclude_appointment_id: id,
  });

  if (doubleBooked) {
    throw new Error("This veterinarian has a conflicting appointment at that time");
  }

  // Preserve preferred_date and preferred_time from existing appointment
  const { data: existing } = await supabase
    .from("appointments")
    .select("preferred_date, preferred_time")
    .eq("id", id)
    .single();

  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "booked",
      scheduled_start: input.scheduledStart,
      scheduled_end: input.scheduledEnd,
      assigned_veterinarian_id: input.assignedVeterinarianId,
      confirmed_at: new Date().toISOString(),
      // Preserve preferred_date and preferred_time from the original appointment request
      ...(existing?.preferred_date !== undefined && { preferred_date: existing.preferred_date }),
      ...(existing?.preferred_time !== undefined && { preferred_time: existing.preferred_time }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/appointments");
  return data;
}

export async function completeAppointment(id: string, notes?: string) {
  const { profile } = await requireAuth();
  if (!isStaff(profile)) throw new Error("Only the clinic team can complete appointments.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/appointments");
  return data;
}

export async function markNoShow(id: string) {
  await requireAppointmentManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "no_show",
      no_show_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/appointments");
  return data;
}

export async function rescheduleAppointment(
  id: string,
  input: {
    newScheduledStart: string;
    newScheduledEnd: string;
    reason?: string;
    notes?: string;
  }
) {
  await requireAppointmentManager();
  const supabase = await createClient();

  // Get current appointment including preferred_date and preferred_time
  const { data: current } = await supabase
    .from("appointments")
    .select("assigned_veterinarian_id, preferred_date, preferred_time")
    .eq("id", id)
    .single();

  if (current?.assigned_veterinarian_id) {
    const { data: doubleBooked } = await supabase.rpc("check_double_booking", {
      p_veterinarian_id: current.assigned_veterinarian_id,
      p_start: input.newScheduledStart,
      p_end: input.newScheduledEnd,
      p_exclude_appointment_id: id,
    });

    if (doubleBooked) {
      throw new Error("This veterinarian has a conflicting appointment at that time");
    }
  }

  const { data, error } = await supabase
    .from("appointments")
    .update({
      scheduled_start: input.newScheduledStart,
      scheduled_end: input.newScheduledEnd,
      // Preserve preferred_date and preferred_time from the original appointment
      ...(current?.preferred_date !== undefined && { preferred_date: current.preferred_date }),
      ...(current?.preferred_time !== undefined && { preferred_time: current.preferred_time }),
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  revalidatePath("/dashboard/appointments");
  return data;
}





export async function getAppointmentStatusHistory(appointmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointment_status_history")
    .select(
      `
      *,
      profiles!appointment_status_history_changed_by_id_fkey (id, full_name, role)
    `
    )
    .eq("appointment_id", appointmentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listOwnerAppointments(ownerId: string) {
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

export async function listPetAppointments(petId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      *,
      profiles!appointments_owner_id_fkey (id, full_name, email),
      profiles!appointments_assigned_veterinarian_id_fkey (id, full_name),
      services (id, name, duration_minutes, price_from, price_to)
    `
    )
    .eq("pet_id", petId)
    .order("scheduled_start", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function requestAppointment(input: Omit<AppointmentInsert, 'owner_id' | 'id'>) {
  const { profile } = await requireAuth();
  // Validate that the pet_id in input is linked to the owner's profile
  const pets = await listPetsForCurrentUser();
  const petIds = pets.map(pet => pet.id);
  if (!petIds.includes(input.pet_id)) {
    throw new Error("You can only request appointments for your own pets.");
  }
  // Now create the appointment with the owner_id set to the authenticated user's id
  const appointmentInput: AppointmentInsert = {
    ...input,
    owner_id: profile.id,
  };
  return createAppointment(appointmentInput);
}

export async function getVeterinarianSchedule(veterinarianId: string, date: string) {
  const supabase = await createClient();
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const { data, error } = await supabase
    .from("appointments")
    .select(
      `
      *,
      pets (id, name, species, breed),
      profiles!appointments_owner_id_fkey (id, full_name, phone),
      services (id, name, duration_minutes)
    `
    )
    .eq("assigned_veterinarian_id", veterinarianId)
    // Filter by scheduled_start, but also include appointments with preferred_date in range
    .gte("scheduled_start", startOfDay.toISOString())
    .lte("scheduled_start", endOfDay.toISOString())
    .in("status", ["booked"])
    .order("scheduled_start", { ascending: false });
  if (error) throw error;
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
    return data;
  } catch (err) {
    console.error("EXACT_PG_ERROR_CATCH_listAppointmentSchedules:", JSON.stringify(err, null, 2));
    throw err;
  }
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
  const supabase = await createClient();

  // Get authenticated user for RLS context
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("User not authenticated");
  }

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
    throw new Error(error.message || "Failed to create schedule");
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
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("User not authenticated");

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
    throw new Error(error.message || "Failed to update schedule");
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
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("User not authenticated");

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

  // 3. Get already-booked appointments for this date
  //
  // IMPORTANT: scheduled_start was created with new Date(date).setHours(h,m,0,0).toISOString()
  // which uses the *server/browser local time* — NOT UTC. For UTC+8, 9 AM local = 01:00 UTC.
  // To safely cover any timezone, we widen the query window by ±24 hours and then
  // filter precisely in JS using local-hour comparison (preferred_date string match).
  //
  // For legacy appointments (scheduled_start IS NULL), we match by preferred_date directly.

  // Build a wide UTC window: the full 24-hour span of the date ±1 day so we never miss
  // an appointment regardless of server timezone.
  const [yr, mo, dy] = date.split("-").map(Number);
  const windowStart = new Date(Date.UTC(yr, mo - 1, dy - 1, 0, 0, 0, 0)); // day before UTC midnight
  const windowEnd   = new Date(Date.UTC(yr, mo - 1, dy + 1, 23, 59, 59, 999)); // day after UTC midnight

  // Query 1: appointments that have scheduled_start (new flow)
  let q1 = supabase
    .from("appointments")
    .select("scheduled_start, scheduled_end, preferred_date, preferred_time")
    .in("status", ["booked"])
    .gte("scheduled_start", windowStart.toISOString())
    .lte("scheduled_start", windowEnd.toISOString());

  if (veterinarianId) q1 = q1.eq("assigned_veterinarian_id", veterinarianId);

  // Query 2: legacy appointments with preferred_date and no scheduled_start
  let q2 = supabase
    .from("appointments")
    .select("scheduled_start, scheduled_end, preferred_date, preferred_time")
    .in("status", ["booked"])
    .eq("preferred_date", date)
    .is("scheduled_start", null);

  if (veterinarianId) q2 = q2.eq("assigned_veterinarian_id", veterinarianId);

  const [{ data: bookedByStart, error: err1 }, { data: bookedByDate, error: err2 }] =
    await Promise.all([q1, q2]);

  if (err1) throw err1;
  if (err2) throw err2;

  // Filter q1 results to only those actually on the target local date using preferred_date
  // (since some appointments may span midnight UTC but belong to a different local date)
  const bookedOnDate = (bookedByStart || []).filter((a) => a.preferred_date === date);
  const bookedAppts = [...bookedOnDate, ...(bookedByDate || [])];

  // 4. Build slots from schedules, marking capacity
  const slots = schedules.map((schedule) => {
    // Parse time strings from Supabase (format: "HH:MM:SS")
    const [startH, startM] = schedule.start_time.split(":").map(Number);
    const [endH, endM]     = schedule.end_time.split(":").map(Number);

    // Build slot boundaries using LOCAL time strings — this matches how scheduled_start
    // was created (new Date(date).setHours(h, m, 0, 0) uses local time).
    const slotStart = new Date(`${date}T${String(startH).padStart(2,"0")}:${String(startM).padStart(2,"0")}:00`);
    const slotEnd   = new Date(`${date}T${String(endH).padStart(2,"0")}:${String(endM).padStart(2,"0")}:00`);

    // Count how many appointments overlap this slot
    const booked = bookedAppts.filter((appt) => {
      if (appt.scheduled_start && appt.scheduled_end) {
        // Use UTC timestamp comparison — both sides are now consistent (local time → UTC)
        const apptStart = new Date(appt.scheduled_start);
        const apptEnd   = new Date(appt.scheduled_end);
        // Standard half-open interval overlap: [apptStart, apptEnd) overlaps [slotStart, slotEnd)
        return apptStart < slotEnd && apptEnd > slotStart;
      }
      // Legacy: match by preferred_time hour against slot hour range
      if (appt.preferred_time) {
        const [ph] = appt.preferred_time.split(":").map(Number);
        return ph >= startH && ph < endH;
      }
      // No time info — count against this slot
      return true;
    });

    const currentBookings = booked.length;
    const available       = schedule.max_capacity - currentBookings;
    const isAvailable     = available > 0;

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

  return { slots, scheduled: bookedAppts };
}

async function cancelAppointmentsForSchedule(schedule: Record<string, unknown>) {
  if (!schedule.specific_date) return;
  const supabase = await createClient();
  
  const date = String(schedule.specific_date);
  const [yr, mo, dy] = date.split("-").map(Number);
  const windowStart = new Date(Date.UTC(yr, mo - 1, dy - 1, 0, 0, 0, 0));
  const windowEnd   = new Date(Date.UTC(yr, mo - 1, dy + 1, 23, 59, 59, 999));

  const q1 = supabase
    .from("appointments")
    .select("id, scheduled_start, scheduled_end, preferred_date, preferred_time")
    .in("status", ["booked"])
    .gte("scheduled_start", windowStart.toISOString())
    .lte("scheduled_start", windowEnd.toISOString());

  const q2 = supabase
    .from("appointments")
    .select("id, scheduled_start, scheduled_end, preferred_date, preferred_time")
    .in("status", ["booked"])
    .eq("preferred_date", date)
    .is("scheduled_start", null);

  const [{ data: bookedByStart }, { data: bookedByDate }] = await Promise.all([q1, q2]);
  
  const bookedOnDate = (bookedByStart || []).filter((a) => a.preferred_date === date);
  const bookedAppts = [...bookedOnDate, ...(bookedByDate || [])];

  const [startH, startM] = String(schedule.start_time).split(":").map(Number);
  const [endH, endM]     = String(schedule.end_time).split(":").map(Number);
  const slotStart = new Date(`${date}T${String(startH).padStart(2,"0")}:${String(startM).padStart(2,"0")}:00`);
  const slotEnd   = new Date(`${date}T${String(endH).padStart(2,"0")}:${String(endM).padStart(2,"0")}:00`);

  const toCancelIds: string[] = [];

  for (const appt of bookedAppts) {
    let overlap = false;
    if (appt.scheduled_start && appt.scheduled_end) {
      const apptStart = new Date(appt.scheduled_start);
      const apptEnd   = new Date(appt.scheduled_end);
      if (apptStart < slotEnd && apptEnd > slotStart) overlap = true;
    } else if (appt.preferred_time) {
      const [ph] = appt.preferred_time.split(":").map(Number);
      if (ph >= startH && ph < endH) overlap = true;
    } else {
      overlap = true; // default to overlap if we don't know time
    }

    if (overlap) {
      toCancelIds.push(appt.id);
    }
  }

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