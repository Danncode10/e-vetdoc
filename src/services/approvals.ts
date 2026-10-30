"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/utils/supabase/server";
import { sendAccountApprovedEmail } from "@/services/email";
import { isUserRole, roleLabel, type UserRole } from "@/lib/roles";
import type { Json, Tables } from "@/types/supabase";

type Profile = Tables<"profiles">;

export type PendingRegistration = Pick<Profile, "id" | "email" | "full_name" | "requested_role" | "created_at">;

export type ApprovalActionResult = {
  error?: string;
  success?: string;
};

/** Roles only an Admin may grant; Staff can approve Veterinarians and Owners. */
const ADMIN_GRANTED_ROLES: readonly UserRole[] = ["admin", "staff"];

async function getApprover() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in to review registrations.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, is_active, approval_status")
    .eq("id", user.id)
    .single();

  if (
    !profile ||
    !profile.is_active ||
    profile.approval_status !== "approved" ||
    (profile.role !== "admin" && profile.role !== "staff")
  ) {
    throw new Error("Only Admin or Staff can review registrations.");
  }

  return { id: profile.id, role: profile.role };
}

function canGrant(approverRole: UserRole, role: UserRole) {
  return approverRole === "admin" || !ADMIN_GRANTED_ROLES.includes(role);
}

/** Roles the current reviewer may assign when approving. */
export async function listGrantableRoles(): Promise<UserRole[]> {
  const approver = await getApprover();
  const roles: UserRole[] = ["owner", "veterinarian", "staff", "admin"];
  return roles.filter((role) => canGrant(approver.role, role));
}

export async function listPendingRegistrations(): Promise<PendingRegistration[]> {
  await getApprover();
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("id, email, full_name, requested_role, created_at")
    .eq("approval_status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error("Could not load pending registrations.");
  return data;
}

async function loadPending(id: string) {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, email, full_name, role, requested_role, approval_status, is_active")
    .eq("id", id)
    .single();
  return data?.approval_status === "pending" ? data : null;
}

async function writeAuditLog(
  actorId: string,
  targetId: string,
  action: "registration_approved" | "registration_rejected",
  previousValues: Record<string, string | boolean | null>,
  nextValues: Record<string, string | boolean | null>,
) {
  const { error } = await createAdminClient().from("staff_audit_logs").insert({
    actor_id: actorId,
    target_profile_id: targetId,
    action,
    previous_values: previousValues as Json,
    next_values: nextValues as Json,
  });
  if (error) console.error("Failed to write registration audit log:", error.message);
}

export async function approveRegistration(input: { id: string; role: string }): Promise<ApprovalActionResult> {
  try {
    const approver = await getApprover();
    if (!isUserRole(input.role)) return { error: "Choose a role for this account." };
    const role = input.role;

    const target = await loadPending(input.id);
    if (!target) return { error: "This registration was already reviewed." };
    if (!canGrant(approver.role, role) || (target.requested_role && !canGrant(approver.role, target.requested_role))) {
      return { error: "Only an Admin can approve Admin or Staff accounts." };
    }

    const { error } = await createAdminClient()
      .from("profiles")
      .update({
        role,
        approval_status: "approved",
        approved_by: approver.id,
        approved_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", target.id)
      .eq("approval_status", "pending");
    if (error) return { error: "Could not approve this registration." };

    await writeAuditLog(
      approver.id,
      target.id,
      "registration_approved",
      { email: target.email, requested_role: target.requested_role, approval_status: "pending" },
      { email: target.email, role, approval_status: "approved" },
    );

    if (target.email) {
      await sendAccountApprovedEmail({
        to: target.email,
        name: target.full_name?.trim() || "there",
        role: roleLabel(role),
      }).catch((err) => console.error("Failed to send approval email:", err));
    }

    revalidatePath("/dashboard");
    return { success: `${target.email ?? "Account"} approved as ${roleLabel(role)}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not approve this registration." };
  }
}

export async function rejectRegistration(input: { id: string }): Promise<ApprovalActionResult> {
  try {
    const approver = await getApprover();
    const target = await loadPending(input.id);
    if (!target) return { error: "This registration was already reviewed." };
    if (target.requested_role && !canGrant(approver.role, target.requested_role)) {
      return { error: "Only an Admin can review Admin or Staff registrations." };
    }

    const { error } = await createAdminClient()
      .from("profiles")
      .update({ approval_status: "rejected", approved_by: approver.id, approved_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("approval_status", "pending");
    if (error) return { error: "Could not disapprove this registration." };

    await writeAuditLog(
      approver.id,
      target.id,
      "registration_rejected",
      { email: target.email, requested_role: target.requested_role, approval_status: "pending" },
      { email: target.email, approval_status: "rejected" },
    );

    revalidatePath("/dashboard");
    return { success: `${target.email ?? "Account"} was disapproved.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not disapprove this registration." };
  }
}

/** Lets a pending user (e.g. a Google sign-up) say which role they are registering as. */
export async function chooseRequestedRole(input: { role: string }): Promise<ApprovalActionResult> {
  if (!isUserRole(input.role)) return { error: "Choose what you are registering as." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("profiles")
    .update({ requested_role: input.role })
    .eq("id", user.id)
    .eq("approval_status", "pending");
  if (error) return { error: "Could not save your choice. Please try again." };

  revalidatePath("/account-status");
  return { success: "Thanks! The clinic will review your registration." };
}
