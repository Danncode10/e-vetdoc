"use server";

import { createClient } from '@/utils/supabase/server';
import { requireAuth } from '@/services/authorization';
import { sweepOverdueAppointments } from '@/services/appointments';

/** Today's date in the clinic's timezone (Philippines), as YYYY-MM-DD. */
function clinicToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

export interface OwnerPetSummary {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  gender: string;
  date_of_birth: string | null;
  is_active: boolean;
  relationship_type: string;
  can_view_medical_records: boolean;
  can_schedule_appointments: boolean;
}

export interface OwnerAppointmentSummary {
  id: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  status: string;
  reason: string | null;
  pet: { id: string; name: string; species: string } | null;
  service: { id: string; name: string; duration_minutes: number | null; price_from: number | null } | null;
}

export interface OwnerDashboardSummary {
  profile: { id: string; full_name: string | null; email: string | null; phone: string | null };
  pets: OwnerPetSummary[];
  upcomingAppointments: OwnerAppointmentSummary[];
  recentInvoices: {
    id: string;
    invoice_number: string;
    status: string;
    total_amount: number;
    created_at: string;
  }[];
}

/**
 * Fetch dynamic summary metrics for an authenticated owner.
 */
export async function getOwnerDashboardSummary(): Promise<OwnerDashboardSummary> {
  const { profile } = await requireAuth();
  await sweepOverdueAppointments();
  const supabase = await createClient();

  // 1. Fetch owner's linked pets
  const { data: petLinks } = await supabase
    .from('pet_owners')
    .select(`
      relationship,
      can_view_medical_records,
      can_schedule_appointments:is_primary_contact,
      pet:pets (*)
    `)
    .eq('owner_profile_id', profile.id);

  const pets: OwnerPetSummary[] = (petLinks || [])
    // Pets in Trash are hidden from their owner.
    .filter((link: any) => !link.pet?.deleted_at)
    .filter((link) => link.pet && (link.pet as any).is_active !== false)
    .map((link) => {
      const p = link.pet as any;
      return {
        id: p.id,
        name: p.name,
        species: p.species,
        breed: p.breed,
        gender: p.sex || "unknown",
        date_of_birth: p.date_of_birth,
        is_active: p.is_active ?? true,
        relationship_type: link.relationship || "owner",
        can_view_medical_records: Boolean(link.can_view_medical_records),
        can_schedule_appointments: true,
      };
    });

  // 2. Fetch upcoming & active appointments
  const { data: appointments, error: aptErr } = await supabase
    .from('appointments')
    .select(`
      id,
      scheduled_start,
      scheduled_end,
      preferred_date,
      preferred_time,
      status,
      reason,
      pet:pets!appointments_pet_id_fkey (id, name, species),
      service:services!appointments_service_id_fkey (id, name, duration_minutes, price_from)
    `)
    .eq('owner_id', profile.id)
    // Upcoming = pending approval or approved, and not in the past, soonest first.
    .in('status', ['requested', 'booked'])
    .gte('preferred_date', clinicToday())
    .order('preferred_date', { ascending: true, nullsFirst: false })
    .limit(5);

  if (aptErr) {
    console.error("Error fetching owner appointments summary:", aptErr);
  }

  const upcomingAppointments: OwnerAppointmentSummary[] = (appointments || []).map((a: any) => ({
    id: a.id,
    scheduled_start: a.scheduled_start,
    scheduled_end: a.scheduled_end,
    preferred_date: a.preferred_date,
    preferred_time: a.preferred_time,
    status: a.status,
    reason: a.reason,
    pet: a.pet,
    service: a.service,
  }));

  // 3. Fetch recent invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total_amount, created_at')
    .eq('owner_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(5);

  return {
    profile: {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      phone: profile.phone,
    },
    pets,
    upcomingAppointments,
    recentInvoices: invoices || [],
  };
}

export interface AdminDashboardSummary {
  petCount: number;
  ownerCount: number;
  activeAppointmentsCount: number;
  unpaidInvoicesCount: number;
  recentAppointments: {
    id: string;
    scheduled_start: string | null;
    preferred_date?: string | null;
    preferred_time?: string | null;
    status: string;
    reason: string | null;
    pet_name: string;
    species: string;
    owner_name: string;
    service_name: string;
  }[];
}

/**
 * Fetch dynamic summary metrics for an authenticated admin or staff member.
 */
export async function getAdminDashboardSummary(): Promise<AdminDashboardSummary> {
  const { profile } = await requireAuth();
  await sweepOverdueAppointments();
  const supabase = await createClient();

  const [petsRes, ownersRes, apptsRes, unpaidRes, recentApptsRes] = await Promise.all([
    supabase.from("pets").select("id", { count: "exact", head: true }).is("deleted_at", null),
    // Same rule as the Owners tab: every owner account except disapproved sign-ups.
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner").neq("approval_status", "rejected").is("deleted_at", null),
    // Active = pending approval, approved and still to be seen, or seen but not yet paid.
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .in("status", ["requested", "booked", "diagnosed"]),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .in("status", ["unpaid", "partial"]),
    supabase
      .from("appointments")
      .select(`
        id,
        scheduled_start,
        preferred_date,
        preferred_time,
        status,
        reason,
        pets!appointments_pet_id_fkey (name, species),
        owner:profiles!appointments_owner_id_fkey (full_name),
        services!appointments_service_id_fkey (name)
      `)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const recentAppointments = (recentApptsRes.data || []).map((a: any) => ({
    id: a.id,
    scheduled_start: a.scheduled_start,
    preferred_date: a.preferred_date,
    preferred_time: a.preferred_time,
    status: a.status,
    reason: a.reason,
    pet_name: a.pets?.name || "Unknown Patient",
    species: a.pets?.species || "pet",
    owner_name: a.owner?.full_name || "Pet Owner",
    service_name: a.services?.name || "Consultation",
  }));

  return {
    petCount: petsRes.count || 0,
    ownerCount: ownersRes.count || 0,
    activeAppointmentsCount: apptsRes.count || 0,
    unpaidInvoicesCount: unpaidRes.count || 0,
    recentAppointments,
  };
}

export async function getUserProfile() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return { user, profile };
  } catch (err) {
    return null;
  }
}
