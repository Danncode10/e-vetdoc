"use server";

import { createClient } from "@/utils/supabase/server";
import { Tables, TablesInsert, TablesUpdate } from "@/types/supabase";
import { isAdminOrStaff, isClinicMember, requireAuth } from "@/services/authorization";
import { revalidatePath } from "next/cache";
import { asActionResult } from "@/lib/action-result";

export type Pet = Tables<"pets">;
export type PetInsert = TablesInsert<"pets">;
export type PetUpdate = TablesUpdate<"pets">;

export type PetOwner = Tables<"pet_owners">;
export type PetOwnerInsert = TablesInsert<"pet_owners">;
export type PetOwnerUpdate = TablesUpdate<"pet_owners">;

export type OwnerRegistryDetail = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  linkedPets: Array<{
    id: string;
    name: string;
    species: Pet["species"];
    breed: string | null;
    relationship: PetOwner["relationship"];
    isPrimaryContact: boolean;
  }>;
};

export type StaffPetRecord = Pet & {
  owners: Array<{
    id: string;
    fullName: string | null;
    email: string | null;
    relationship: PetOwner["relationship"];
    isPrimaryContact: boolean;
  }>;
};

type PetOwnerProfileLink = {
  owner_profile_id: string;
  relationship: PetOwner["relationship"];
  is_primary_contact: boolean;
  profiles: { full_name: string | null; email: string | null } | null;
};

export type PetFormInput = {
  name: string;
  species: Pet["species"];
  speciesDetail: string;
  breed: string;
  sex: Pet["sex"];
  dateOfBirth: string;
  age: string;
  color: string;
  notes: string;
};

function nullableValue(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseAge(value: string): number | null {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "unknown") return null;
  const age = Number(normalized);
  if (!Number.isInteger(age) || age < 0) throw new Error("Age must be a whole number that is zero or greater.");
  return age;
}

function assertClinicStaff(role: Tables<"profiles">["role"]): void {
  if (!isClinicMember({ role })) {
    throw new Error("Only clinic staff can view registry records.");
  }
}

function toPetPayload(input: PetFormInput): Omit<PetInsert, "id" | "created_at" | "updated_at"> {
  const name = input.name.trim();
  if (!name) throw new Error("Pet name is required.");
  return {
    name,
    species: input.species,
    species_detail: input.species === "other" ? nullableValue(input.speciesDetail) : null,
    breed: nullableValue(input.breed),
    sex: input.sex,
    date_of_birth: nullableValue(input.dateOfBirth),
    age: parseAge(input.age),
    color: nullableValue(input.color),
    notes: nullableValue(input.notes),
  };
}

export async function listPetsForCurrentUser() {
  const { profile } = await requireAuth();
  const supabase = await createClient();
  let query = supabase
    .from("pets")
    .select("*, pet_owners(id, relationship, is_primary_contact, can_view_medical_records, can_receive_notifications, owner_profile_id, profiles!pet_owners_owner_profile_id_fkey(full_name, email, phone))")
    .is("deleted_at", null)
    .order("name");
  // Owners: only their own pets (RLS enforces this too). Clinic: every pet, no cap.
  if (profile.role === "owner") {
    const { data: links, error: linksError } = await supabase
      .from("pet_owners")
      .select("pet_id")
      .eq("owner_profile_id", profile.id);
    if (linksError) throw linksError;
    query = query.in("id", (links ?? []).map((link) => link.pet_id));
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listOwnerRegistry() {
  const { profile } = await requireAuth();
  assertClinicStaff(profile.role);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, last_seen_at, approval_status, pet_owners(pet_id, relationship, is_primary_contact, can_view_medical_records, pets(id, name, species, breed, deleted_at)), appointments!appointments_owner_id_fkey(id, status, scheduled_start, preferred_date, preferred_time, reason, services(id, name), pets(id, name))")
    .eq("role", "owner")
    // Every owner account, online or not; disapproved sign-ups are not clients; Trash is separate.
    .neq("approval_status", "rejected")
    .is("deleted_at", null)
    .order("full_name");
  if (error) throw error;
  // Pets in Trash are hidden.
  return data.map((owner) => ({
    ...owner,
    pet_owners: (owner.pet_owners ?? []).filter((link) => !(link.pets as { deleted_at?: string | null } | null)?.deleted_at),
  }));
}

export async function getOwnerRegistryDetail(ownerProfileId: string): Promise<OwnerRegistryDetail | null> {
  const { profile } = await requireAuth();
  assertClinicStaff(profile.role);
  const supabase = await createClient();
  const { data: owner, error: ownerError } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", ownerProfileId)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner) return null;

  const { data: links, error: linksError } = await supabase
    .from("pet_owners")
    .select("relationship, is_primary_contact, pets!pet_owners_pet_id_fkey(id, name, species, breed, deleted_at)")
    .eq("owner_profile_id", ownerProfileId)
    .order("created_at");
  if (linksError) throw linksError;

  return {
    id: owner.id,
    fullName: owner.full_name,
    email: owner.email,
    phone: owner.phone,
    linkedPets: (links ?? []).flatMap((link) => {
      const petRelation = link.pets as unknown;
      const pet = Array.isArray(petRelation) ? petRelation[0] : petRelation;
      if (!pet || typeof pet !== "object" || !("id" in pet) || !("name" in pet) || !("species" in pet)) return [];
      if ((pet as { deleted_at?: string | null }).deleted_at) return [];
      const summary = pet as { id: string; name: string; species: Pet["species"]; breed: string | null };
      return [{
        id: summary.id,
        name: summary.name,
        species: summary.species,
        breed: summary.breed,
        relationship: link.relationship,
        isPrimaryContact: link.is_primary_contact,
      }];
    }),
  };
}

export async function getStaffPetRecord(ownerProfileId: string, petId: string): Promise<StaffPetRecord | null> {
  const { profile } = await requireAuth();
  assertClinicStaff(profile.role);
  const supabase = await createClient();
  const { data: ownerLink, error: ownerLinkError } = await supabase
    .from("pet_owners")
    .select("id")
    .eq("owner_profile_id", ownerProfileId)
    .eq("pet_id", petId)
    .maybeSingle();
  if (ownerLinkError) throw ownerLinkError;
  if (!ownerLink) return null;

  const { data: pet, error: petError } = await supabase
    .from("pets")
    .select("*, pet_owners(id, relationship, is_primary_contact, owner_profile_id, profiles!pet_owners_owner_profile_id_fkey(full_name, email))")
    .eq("id", petId)
    .maybeSingle();
  if (petError) throw petError;
  if (!pet || pet.deleted_at) return null;

  return {
    ...pet,
    owners: (pet.pet_owners as unknown as PetOwnerProfileLink[]).map((link) => ({
      id: link.owner_profile_id,
      fullName: link.profiles?.full_name ?? null,
      email: link.profiles?.email ?? null,
      relationship: link.relationship,
      isPrimaryContact: link.is_primary_contact,
    })),
  };
}

export async function createOwnedPet(input: PetFormInput) {
  const { profile } = await requireAuth();
  if (profile.role !== "owner") throw new Error("Only pet owners can add pets from this workspace.");
  const payload = toPetPayload(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_owned_pet", {
    p_name: payload.name,
    p_species: payload.species,
    p_species_detail: payload.species_detail,
    p_breed: payload.breed,
    p_sex: payload.sex,
    p_date_of_birth: payload.date_of_birth,
    p_age: payload.age,
    p_color: payload.color,
    p_notes: payload.notes,
  });
  if (error) throw error;
  revalidatePath("/dashboard");
  return data;
}

export async function updateOwnedPet(id: string, input: PetFormInput) {
  const { profile } = await requireAuth();
  if (profile.role !== "owner" && !isAdminOrStaff(profile)) throw new Error("You do not have permission to update pet details.");
  const payload = toPetPayload(input);
  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").update(payload).eq("id", id).select().single();
  if (error) throw error;
  revalidatePath("/dashboard");
  return data;
}

export async function createPet(input: PetInsert) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function getPetById(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function listPetsByOwner(ownerProfileId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pets")
    .select("*, pet_owners!inner(*)")
    .eq("pet_owners.owner_profile_id", ownerProfileId);
  if (error) throw error;
  return data;
}

export async function listAllPets() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").select("*").order("name");
  if (error) throw error;
  return data;
}

export async function updatePet(id: string, updates: PetUpdate) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}


export async function createPetOwner(input: PetOwnerInsert) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pet_owners").insert(input).select().single();
  if (error) throw error;
  return data;
}

export async function getPetOwnersByPet(petId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pet_owners")
    .select("*, profiles!pet_owners_owner_profile_id_fkey(*)")
    .eq("pet_id", petId);
  if (error) throw error;
  return data;
}

export async function getPetOwnersByOwner(ownerProfileId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pet_owners")
    .select("*, pets(*)")
    .eq("owner_profile_id", ownerProfileId);
  if (error) throw error;
  return data;
}

export async function getPetsByOwner(ownerProfileId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pet_owners")
    .select("pets(id, name, species, breed, sex, date_of_birth, age, color, notes)")
    .eq("owner_profile_id", ownerProfileId);
  if (error) throw error;
  // Extract pet objects from the pet_owners join
  return data.map(link => link.pets);
}

export async function updatePetOwner(id: string, updates: PetOwnerUpdate) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("pet_owners").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePetOwner(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pet_owners").delete().eq("id", id);
  if (error) throw error;
}

export async function searchPets(query: string, limit = 20) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pets")
    .select("*")
    .ilike("name", `%${query}%`)
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Admin only: permanently deletes an owner account and all of its data (login, profile,
 * sole-owned pets, appointments, clinical records, invoices). Shared pets are kept.
 * The database function `admin_delete_owner()` checks the role and runs in one transaction.
 */
async function deleteOwnerCompletelyOrThrow(ownerId: string) {
  const { profile } = await requireAuth();
  if (profile.role !== "admin") throw new Error("Only an Administrator can delete owner accounts.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_owner", { p_owner_id: ownerId });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return { email: data };
}

export async function deleteOwnerCompletely(ownerId: string) {
  return asActionResult(() => deleteOwnerCompletelyOrThrow(ownerId));
}

/** Owners in Trash (Admin / Staff), most recently trashed first. */
export async function listTrashedOwners() {
  const { profile } = await requireAuth();
  if (!isAdminOrStaff(profile)) throw new Error("Only Admin or Staff can view Trash.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, deleted_at, deleted_by, pet_owners(pet_id)")
    .eq("role", "owner")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;

  // Who moved each owner to Trash (shown on the card).
  const actorIds = [...new Set(data.map((o) => o.deleted_by).filter((id): id is string => Boolean(id)))];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
  const actorById = new Map((actors ?? []).map((a) => [a.id, a]));
  return data.map((owner) => ({ ...owner, deleted_by_profile: owner.deleted_by ? actorById.get(owner.deleted_by) ?? null : null }));
}

async function callOwnerRpc(fn: "trash_owner" | "restore_owner", ownerId: string) {
  const { profile } = await requireAuth();
  if (!isAdminOrStaff(profile)) throw new Error("Only Admin or Staff can do this.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_owner_id: ownerId });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return { email: data };
}

/** Admin / Staff: move an owner to Trash (signed out and hidden, nothing deleted). */
export async function trashOwner(ownerId: string) {
  return asActionResult(() => callOwnerRpc("trash_owner", ownerId));
}

/** Admin / Staff: bring an owner back from Trash. */
export async function restoreOwner(ownerId: string) {
  return asActionResult(() => callOwnerRpc("restore_owner", ownerId));
}

// ── Pet Trash (Admin / Staff); permanent delete is Admin only, from Trash ──

/** Pets in Trash, most recently trashed first, with their owners' names. */
export async function listTrashedPets() {
  const { profile } = await requireAuth();
  if (!isAdminOrStaff(profile)) throw new Error("Only Admin or Staff can view Trash.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pets")
    .select("id, name, species, breed, deleted_at, pet_owners(profiles!pet_owners_owner_profile_id_fkey(full_name, email))")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw error;
  return data;
}

async function callPetRpc(fn: "trash_pet" | "restore_pet" | "purge_pet", petId: string) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_pet_id: petId });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
  return { name: data };
}

export async function trashPet(petId: string) {
  return asActionResult(() => callPetRpc("trash_pet", petId));
}

export async function restorePet(petId: string) {
  return asActionResult(() => callPetRpc("restore_pet", petId));
}

/** Admin only, pets already in Trash: deletes the pet with its visits and medical records. */
export async function purgePet(petId: string) {
  return asActionResult(() => callPetRpc("purge_pet", petId));
}
