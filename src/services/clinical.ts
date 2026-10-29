"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";
import { requireAuth, requireRole, CLINIC_ROLES } from "@/services/authorization";
import type { Tables, TablesInsert, TablesUpdate } from "@/types/supabase";

export type Encounter = Tables<"encounters">;
export type EncounterInsert = TablesInsert<"encounters">;
export type EncounterUpdate = TablesUpdate<"encounters">;

export type ClinicalNote = Tables<"clinical_notes">;
export type ClinicalNoteInsert = TablesInsert<"clinical_notes">;
export type ClinicalNoteUpdate = TablesUpdate<"clinical_notes">;

export type Diagnosis = Tables<"diagnoses">;
export type DiagnosisInsert = TablesInsert<"diagnoses">;

export type Treatment = Tables<"treatments">;
export type TreatmentInsert = TablesInsert<"treatments">;

export type Prescription = Tables<"prescriptions">;
export type PrescriptionInsert = TablesInsert<"prescriptions">;
export type PrescriptionUpdate = TablesUpdate<"prescriptions">;

export type EncounterAmendment = Tables<"encounter_amendments">;
export type EncounterAmendmentInsert = TablesInsert<"encounter_amendments">;

// Helper to check staff permissions
async function requireStaff() {
  const { profile } = await requireRole(CLINIC_ROLES);
  return profile;
}

/**
 * Create a new draft encounter.
 */
export async function createEncounter(input: Omit<EncounterInsert, "status" | "signed_at">) {
  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("encounters")
    .insert({
      ...input,
      status: "draft",
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath("/dashboard");
  return data;
}

/**
 * Update an existing draft encounter.
 */
export async function updateEncounter(id: string, updates: EncounterUpdate) {
  await requireStaff();
  const supabase = await createClient();

  // Get current encounter to verify status
  const { data: current, error: fetchError } = await supabase
    .from("encounters")
    .select("status")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;
  if (current.status !== "draft") {
    throw new Error("Cannot update an encounter that has already been signed.");
  }

  const { data, error } = await supabase
    .from("encounters")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/dashboard");
  return data;
}

/**
 * Sign and lock an encounter.
 */
export async function signEncounter(id: string) {
  await requireStaff();
  const supabase = await createClient();

  // Verify status is draft before signing
  const { data: current, error: fetchError } = await supabase
    .from("encounters")
    .select("status, appointment_id")
    .eq("id", id)
    .single();

  if (fetchError) throw fetchError;
  if (current.status !== "draft") {
    throw new Error("Encounter is already signed.");
  }

  const { data, error } = await supabase
    .from("encounters")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  if (current.appointment_id) {
    await supabase
      .from("appointments")
      .update({ status: "diagnosed" })
      .eq("id", current.appointment_id);
  }

  revalidatePath("/dashboard");
  return data;
}

/**
 * List encounters based on filters.
 * Under the hood, RLS will enforce that owners can only view signed encounters for their pets.
 */
export async function listEncounters(filters?: {
  petId?: string;
  veterinarianId?: string;
  status?: Encounter["status"];
  limit?: number;
  offset?: number;
}) {
  await requireAuth();
  const supabase = await createClient();

  let query = supabase
    .from("encounters")
    .select(`
      *,
      pets (id, name, species, breed),
      veterinarian:profiles (id, full_name)
    `)
    .order("created_at", { ascending: false });

  if (filters?.petId) {
    query = query.eq("pet_id", filters.petId);
  }
  if (filters?.veterinarianId) {
    query = query.eq("veterinarian_id", filters.veterinarianId);
  }
  if (filters?.status) {
    query = query.eq("status", filters.status);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset !== undefined) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Retrieve an encounter by its appointment ID.
 */
export async function getEncounterByAppointmentId(appointmentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("encounters")
    .select("id, status")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Fetch detailed encounter payload including notes, diagnoses, treatments, prescriptions, and amendments.
 */
export async function getEncounterDetails(id: string) {
  await requireAuth();
  const supabase = await createClient();

  // 1. Fetch encounter
  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select(`
      *,
      pets (id, name, species, breed, sex, date_of_birth, age, color, notes),
      veterinarian:profiles!encounters_veterinarian_id_fkey (id, full_name, email),
      appointment:appointments (id, reason, scheduled_start)
    `)
    .eq("id", id)
    .single();

  if (encounterError) throw encounterError;

  // 2. Fetch associated child tables in parallel
  const [notesRes, diagnosesRes, treatmentsRes, prescriptionsRes, amendmentsRes] = await Promise.all([
    supabase.from("clinical_notes").select("*").eq("encounter_id", id),
    supabase.from("diagnoses").select("*").eq("encounter_id", id),
    supabase.from("treatments").select("*").eq("encounter_id", id),
    supabase.from("prescriptions").select("*").eq("encounter_id", id),
    supabase.from("encounter_amendments").select(`
      *,
      veterinarian:profiles (id, full_name)
    `).eq("encounter_id", id).order("created_at", { ascending: true }),
  ]);

  if (notesRes.error) throw notesRes.error;
  if (diagnosesRes.error) throw diagnosesRes.error;
  if (treatmentsRes.error) throw treatmentsRes.error;
  if (prescriptionsRes.error) throw prescriptionsRes.error;
  if (amendmentsRes.error) throw amendmentsRes.error;

  return {
    encounter,
    notes: notesRes.data[0] || null, // clinical_notes is 1:1 in practice
    diagnoses: diagnosesRes.data,
    treatments: treatmentsRes.data,
    prescriptions: prescriptionsRes.data,
    amendments: amendmentsRes.data,
  };
}

/**
 * Append an amendment note to a signed encounter.
 */
export async function addEncounterAmendment(encounterId: string, amendmentText: string) {
  const profile = await requireStaff();
  const supabase = await createClient();

  // Get current encounter to verify status is signed
  const { data: encounter, error: fetchError } = await supabase
    .from("encounters")
    .select("status")
    .eq("id", encounterId)
    .single();

  if (fetchError) throw fetchError;
  if (encounter.status !== "signed") {
    throw new Error("Amendments can only be added to finalized/signed encounters.");
  }

  const { data, error } = await supabase
    .from("encounter_amendments")
    .insert({
      encounter_id: encounterId,
      veterinarian_id: profile.id,
      amendment_text: amendmentText,
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/dashboard");
  return data;
}

/**
 * Create a new clinical note for an encounter.
 */
export async function createClinicalNote(input: ClinicalNoteInsert) {
  await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clinical_notes")
    .insert(input)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a clinical note. Only allowed if parent encounter is in draft status.
 */
export async function updateClinicalNote(id: string, updates: ClinicalNoteUpdate) {
  await requireStaff();
  const supabase = await createClient();

  // Verify parent encounter status
  const { data: note, error: noteError } = await supabase
    .from("clinical_notes")
    .select("encounter_id")
    .eq("id", id)
    .single();

  if (noteError) throw noteError;

  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select("status")
    .eq("id", note.encounter_id)
    .single();

  if (encounterError) throw encounterError;
  if (encounter.status !== "draft") {
    throw new Error("Cannot update clinical notes of a signed encounter.");
  }

  const { data, error } = await supabase
    .from("clinical_notes")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Save diagnoses list for an encounter.
 */
export async function saveDiagnoses(encounterId: string, list: Omit<DiagnosisInsert, "encounter_id">[]) {
  await requireStaff();
  const supabase = await createClient();

  // Verify parent encounter status
  const { data: encounter } = await supabase
    .from("encounters")
    .select("status")
    .eq("id", encounterId)
    .single();

  if (encounter?.status !== "draft") {
    throw new Error("Cannot edit diagnoses of a signed encounter.");
  }

  // Delete existing diagnoses for the encounter first
  const { error: deleteError } = await supabase
    .from("diagnoses")
    .delete()
    .eq("encounter_id", encounterId);

  if (deleteError) throw deleteError;

  if (list.length === 0) return [];

  const { data, error } = await supabase
    .from("diagnoses")
    .insert(list.map(item => ({ ...item, encounter_id: encounterId })))
    .select();

  if (error) throw error;
  return data;
}

/**
 * Save treatments list for an encounter.
 */
export async function saveTreatments(encounterId: string, list: Omit<TreatmentInsert, "encounter_id">[]) {
  await requireStaff();
  const supabase = await createClient();

  // Verify parent encounter status
  const { data: encounter } = await supabase
    .from("encounters")
    .select("status")
    .eq("id", encounterId)
    .single();

  if (encounter?.status !== "draft") {
    throw new Error("Cannot edit treatments of a signed encounter.");
  }

  // Delete existing treatments for the encounter first
  const { error: deleteError } = await supabase
    .from("treatments")
    .delete()
    .eq("encounter_id", encounterId);

  if (deleteError) throw deleteError;

  if (list.length === 0) return [];

  const { data, error } = await supabase
    .from("treatments")
    .insert(list.map(item => ({ ...item, encounter_id: encounterId })))
    .select();

  if (error) throw error;
  return data;
}

/**
 * Create a new prescription.
 */
export async function createPrescription(input: Omit<PrescriptionInsert, "status">) {
  const profile = await requireStaff();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("prescriptions")
    .insert({
      ...input,
      status: "active",
      veterinarian_id: profile.id,
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/dashboard");
  return data;
}

/**
 * Update a prescription (e.g. status cancellation or details, if draft).
 */
export async function updatePrescription(id: string, updates: PrescriptionUpdate) {
  await requireStaff();
  const supabase = await createClient();

  // Verify parent encounter status is draft
  const { data: rx, error: rxError } = await supabase
    .from("prescriptions")
    .select("encounter_id")
    .eq("id", id)
    .single();

  if (rxError) throw rxError;

  const { data: encounter } = await supabase
    .from("encounters")
    .select("status")
    .eq("id", rx.encounter_id)
    .single();

  if (encounter?.status !== "draft") {
    throw new Error("Cannot modify prescriptions of a signed encounter.");
  }

  const { data, error } = await supabase
    .from("prescriptions")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  revalidatePath("/dashboard");
  return data;
}

/**
 * Fetch longitudinal clinical history for a pet (only signed encounters for owners).
 */
export async function getPetClinicalHistory(petId: string) {
  const { profile } = await requireAuth();
  const supabase = await createClient();

  // If calling user is an owner, verify relationship and medical records viewing permission
  if (profile.role === "owner") {
    const { data: link, error: linkError } = await supabase
      .from("pet_owners")
      .select("can_view_medical_records")
      .eq("pet_id", petId)
      .eq("owner_profile_id", profile.id)
      .single();

    if (linkError || !link || !link.can_view_medical_records) {
      return [];
    }
  }

  let encountersQuery = supabase
    .from("encounters")
    .select(`
      *,
      veterinarian:profiles!encounters_veterinarian_id_fkey (id, full_name, email),
      appointment:appointments (id, reason, scheduled_start, status, services(id, name))
    `)
    .eq("pet_id", petId)
    .order("created_at", { ascending: false });

  // Owners only see signed encounters, never drafts
  if (profile.role === "owner") {
    encountersQuery = encountersQuery.eq("status", "signed");
  }

  const { data: encounters, error: encountersError } = await encountersQuery;

  if (encountersError) throw encountersError;
  if (!encounters || encounters.length === 0) return [];

  const encounterIds = encounters.map((e) => e.id);

  const [notesRes, diagnosesRes, treatmentsRes, prescriptionsRes, amendmentsRes] = await Promise.all([
    supabase.from("clinical_notes").select("*").in("encounter_id", encounterIds),
    supabase.from("diagnoses").select("*").in("encounter_id", encounterIds),
    supabase.from("treatments").select("*").in("encounter_id", encounterIds),
    supabase.from("prescriptions").select("*").in("encounter_id", encounterIds),
    supabase.from("encounter_amendments").select(`
      *,
      veterinarian:profiles (id, full_name)
    `).in("encounter_id", encounterIds).order("created_at", { ascending: true }),
  ]);

  return encounters.map((enc) => ({
    encounter: enc,
    notes: notesRes.data?.find((n) => n.encounter_id === enc.id) || null,
    diagnoses: diagnosesRes.data?.filter((d) => d.encounter_id === enc.id) || [],
    treatments: treatmentsRes.data?.filter((t) => t.encounter_id === enc.id) || [],
    prescriptions: prescriptionsRes.data?.filter((p) => p.encounter_id === enc.id) || [],
    amendments: amendmentsRes.data?.filter((a) => a.encounter_id === enc.id) || [],
  }));
}

/**
 * Save the entire encounter workspace as a draft in one shot.
 */
export async function saveEncounterDraft(
  encounterId: string,
  payload: {
    encounterNotes?: string;
    clinicalNote?: Omit<ClinicalNoteInsert, "encounter_id">;
    diagnoses?: Omit<DiagnosisInsert, "encounter_id">[];
    treatments?: Omit<TreatmentInsert, "encounter_id">[];
    prescriptions?: Omit<PrescriptionInsert, "encounter_id" | "veterinarian_id" | "status">[];
  }
) {
  const profile = await requireStaff();
  const supabase = await createClient();

  // Verify parent encounter status
  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select("status")
    .eq("id", encounterId)
    .single();

  if (encounterError) throw encounterError;
  if (encounter.status !== "draft") {
    throw new Error("Cannot save draft for a signed encounter.");
  }

  // Update encounter notes if provided
  if (payload.encounterNotes !== undefined) {
    await updateEncounter(encounterId, { notes: payload.encounterNotes });
  }

  // Upsert clinical note
  if (payload.clinicalNote) {
    const { data: existingNote } = await supabase
      .from("clinical_notes")
      .select("id")
      .eq("encounter_id", encounterId)
      .single();

    if (existingNote) {
      await updateClinicalNote(existingNote.id, payload.clinicalNote);
    } else {
      await createClinicalNote({
        ...payload.clinicalNote,
        encounter_id: encounterId,
      });
    }
  }

  // Save Diagnoses & Treatments
  if (payload.diagnoses) {
    await saveDiagnoses(encounterId, payload.diagnoses);
  }
  if (payload.treatments) {
    await saveTreatments(encounterId, payload.treatments);
  }

  // Save Prescriptions
  if (payload.prescriptions) {
    // For simplicity in draft saving, we drop existing active prescriptions for this encounter and re-insert.
    // If they were dispensed/signed, the encounter wouldn't be in draft.
    await supabase.from("prescriptions").delete().eq("encounter_id", encounterId);
    if (payload.prescriptions.length > 0) {
      // Need petId for prescriptions
      const { data: encDetail } = await supabase.from("encounters").select("pet_id").eq("id", encounterId).single();
      const petId = encDetail?.pet_id;
      if (petId) {
        await supabase.from("prescriptions").insert(
          payload.prescriptions.map((p) => ({
            ...p,
            encounter_id: encounterId,
            veterinarian_id: profile.id,
            pet_id: petId,
            status: "active",
          }))
        );
      }
    }
  }

  revalidatePath("/dashboard");
  return { success: true };
}

