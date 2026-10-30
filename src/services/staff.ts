"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/utils/supabase/server";
import type { Database, Json, Tables } from "@/types/supabase";

type StaffRole = Extract<Database["public"]["Enums"]["user_role"], "admin" | "staff" | "veterinarian">;
type ManageableRole = StaffRole | "owner";
type Profile = Tables<"profiles">;

export type StaffMember = Pick<Profile, "id" | "email" | "full_name" | "role" | "created_at" | "last_seen_at"> & {
  is_active: boolean;
};

export type StaffActionResult = {
  error?: string;
  success?: string;
};

type StaffAuditAction = "staff_added" | "staff_updated" | "staff_deactivated" | "staff_reactivated";

const STAFF_ROLES: readonly StaffRole[] = ["admin", "staff", "veterinarian"];

function isStaffRole(value: string | null): value is StaffRole {
  return STAFF_ROLES.includes(value as StaffRole);
}

function parseStaffRole(value: string): StaffRole | null {
  return isStaffRole(value) ? value : null;
}

function parseManageableRole(value: string): ManageableRole | null {
  return isStaffRole(value) || value === "owner" ? value : null;
}

function describeRole(role: StaffRole) {
  if (role === "admin") return "an administrator";
  if (role === "staff") return "a staff member";
  return "a veterinarian";
}

function toJson(value: Record<string, string | boolean | null>): Json {
  return value;
}

async function getAdminActor() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to manage staff.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin" || !profile.is_active) {
    throw new Error("Only active administrators can manage staff.");
  }

  return { id: profile.id, email: user.email ?? null };
}

async function writeAuditLog(
  actorId: string,
  targetProfileId: string,
  action: StaffAuditAction,
  previousValues: Record<string, string | boolean | null>,
  nextValues: Record<string, string | boolean | null>,
) {
  const adminClient = createAdminClient();
  const { error } = await adminClient.from("staff_audit_logs").insert({
    actor_id: actorId,
    target_profile_id: targetProfileId,
    action,
    previous_values: toJson(previousValues),
    next_values: toJson(nextValues),
  });

  if (error) {
    throw new Error("The staff change could not be recorded for audit.");
  }
}

async function assertNotFinalActiveAdmin(
  target: Pick<StaffMember, "id" | "role" | "is_active">,
  nextRole: ManageableRole,
  nextIsActive: boolean,
) {
  if (target.role !== "admin" || !target.is_active || (nextRole === "admin" && nextIsActive)) {
    return;
  }

  const adminClient = createAdminClient();
  const { count, error } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);

  if (error) {
    throw new Error("Could not verify the active administrator count.");
  }

  if ((count ?? 0) <= 1) {
    throw new Error("The final active administrator cannot be deactivated or moved to another role.");
  }
}

export async function listStaff(): Promise<StaffMember[]> {
  await getAdminActor();

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at, last_seen_at")
    .in("role", [...STAFF_ROLES])
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("Could not load clinic staff.");
  }

  return data;
}

export async function addExistingStaff(input: { email: string; role: string }): Promise<StaffActionResult> {
  try {
    const actor = await getAdminActor();
    const email = input.email.trim().toLowerCase();
    const role = parseStaffRole(input.role);

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return { error: "Enter a valid staff email address." };
    }
    if (!role) {
      return { error: "Choose an administrator, staff, or veterinarian role." };
    }

    const adminClient = createAdminClient();
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role, is_active, created_at, last_seen_at")
      .eq("email", email)
      .maybeSingle();

    if (targetError) {
      return { error: "Could not check that account." };
    }
    if (!target) {
      return { error: "No account found for this email. Ask the person to create an account first." };
    }
    if (target.role !== "owner" && !isStaffRole(target.role)) {
      return { error: "That account cannot be added as clinic staff." };
    }

    await assertNotFinalActiveAdmin(target, role, true);
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        role,
        is_active: true,
        approval_status: "approved",
        approved_by: actor.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    if (profileError) {
      return { error: "Could not add this account to clinic staff." };
    }

    await writeAuditLog(
      actor.id,
      target.id,
      target.role === "owner" ? "staff_added" : "staff_updated",
      { email: target.email, full_name: target.full_name, role: target.role, is_active: target.is_active },
      { email: target.email, full_name: target.full_name, role, is_active: true },
    );
    revalidatePath("/dashboard/team");
    return { success: `${email} is now ${describeRole(role)}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not add staff." };
  }
}

export async function updateStaffRole(input: { id: string; role: string }): Promise<StaffActionResult> {
  try {
    const actor = await getAdminActor();
    const role = parseManageableRole(input.role);
    if (!input.id || !role) {
      return { error: "Choose a valid staff role." };
    }

    const adminClient = createAdminClient();
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role, is_active, created_at, last_seen_at")
      .eq("id", input.id)
      .single();

    if (targetError || !target || !isStaffRole(target.role)) {
      return { error: "That staff account is not available." };
    }

    await assertNotFinalActiveAdmin(target, role, target.is_active);
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ role })
      .eq("id", target.id);

    if (updateError) {
      return { error: "Could not update the staff role." };
    }

    await writeAuditLog(
      actor.id,
      target.id,
      "staff_updated",
      { role: target.role, is_active: target.is_active },
      { role, is_active: target.is_active },
    );
    revalidatePath("/dashboard/team");
    return { success: role === "owner" ? "Account returned to pet-owner access." : "Staff role updated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the staff role." };
  }
}

export async function setStaffActive(input: { id: string; isActive: boolean }): Promise<StaffActionResult> {
  try {
    const actor = await getAdminActor();
    if (!input.id) {
      return { error: "Choose a staff account first." };
    }

    const adminClient = createAdminClient();
    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id, email, full_name, role, is_active, created_at, last_seen_at")
      .eq("id", input.id)
      .single();

    if (targetError || !target || !isStaffRole(target.role)) {
      return { error: "That staff account is not available." };
    }

    await assertNotFinalActiveAdmin(target, target.role, input.isActive);
    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ is_active: input.isActive })
      .eq("id", target.id);
    if (updateError) {
      return { error: "Could not update the staff account status." };
    }

    const { error: authError } = await adminClient.auth.admin.updateUserById(target.id, {
      ban_duration: input.isActive ? "none" : "876000h",
    });
    if (authError) {
      await adminClient.from("profiles").update({ is_active: target.is_active }).eq("id", target.id);
      return { error: "Could not update sign-in access for this staff account." };
    }

    await writeAuditLog(
      actor.id,
      target.id,
      input.isActive ? "staff_reactivated" : "staff_deactivated",
      { is_active: target.is_active },
      { is_active: input.isActive },
    );
    revalidatePath("/dashboard/team");
    return { success: input.isActive ? "Staff account reactivated." : "Staff account deactivated." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update the staff account status." };
  }
}

// ── Team Trash (Admin only) ──

export type TrashedStaffMember = StaffMember & { deleted_at: string | null };

export async function listTrashedStaff(): Promise<TrashedStaffMember[]> {
  await getAdminActor();
  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("profiles")
    .select("id, email, full_name, role, is_active, created_at, last_seen_at, deleted_at")
    .in("role", [...STAFF_ROLES])
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  if (error) throw new Error("Could not load the team Trash.");
  return data;
}

async function callTeamRpc(fn: "trash_team_member" | "restore_team_member" | "purge_team_member", id: string, success: string): Promise<StaffActionResult> {
  try {
    await getAdminActor();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Only an Administrator can manage the team." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { p_profile_id: id });
  if (error) return { error: error.message };
  revalidatePath("/dashboard/team");
  return { success };
}

export async function trashStaffMember(id: string) {
  return callTeamRpc("trash_team_member", id, "Moved to Trash. You can restore them any time.");
}

export async function restoreStaffMember(id: string) {
  return callTeamRpc("restore_team_member", id, "Team member restored.");
}

export async function purgeStaffMember(id: string) {
  return callTeamRpc("purge_team_member", id, "Team member deleted permanently.");
}
