import { createClient } from "@/utils/supabase/server";
import type { Database } from "@/types/supabase";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type UserRole = Profile["role"];

export type AuthenticatedUser = {
  user: User;
  profile: Profile;
};

export function isEmailVerified(user: User): boolean {
  return Boolean(user.email_confirmed_at);
}

export function isOwnerProfileComplete(profile: Profile): boolean {
  return Boolean(
    profile.full_name?.trim() && profile.phone?.trim() && profile.address?.trim(),
  );
}

/**
 * Get the signed-in, email-verified user and their profile, whatever the
 * approval state. Use this only to route people; use getCurrentUser() to grant access.
 */
export async function getSessionProfile(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || !isEmailVerified(user)) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return null;

  return { user, profile };
}

/**
 * An account can use the clinic only once it is approved and active.
 */
export function isAccountApproved(profile: Pick<Profile, "approval_status" | "is_active" | "role">): boolean {
  return profile.approval_status === "approved" && profile.is_active && Boolean(profile.role);
}

/**
 * Get the authenticated user and their profile.
 * Returns null if not authenticated, or if the account is not approved and active.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const session = await getSessionProfile();
  if (!session || !isAccountApproved(session.profile)) return null;
  return session;
}

/**
 * Require an approved, active user. Signed-out visitors go to /login; signed-in
 * accounts that are pending, disapproved, or deactivated go to /account-status.
 * Returns the user and profile on success.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const session = await getSessionProfile();

  if (!session) {
    redirect("/login");
  }

  if (!isAccountApproved(session.profile)) {
    redirect("/account-status");
  }

  return session;
}

/**
 * Require the user to have one of the specified roles.
 * Throws redirect to /dashboard if not authorized.
 */
export async function requireRole(allowedRoles: readonly UserRole[]) {
  const { user, profile } = await requireAuth();

  if (!profile || !profile.role || !allowedRoles.includes(profile.role)) {
    // User exists but doesn't have the required role
    // Redirect to dashboard which will handle the appropriate view
    redirect("/dashboard");
  }

  return { user, profile };
}

/**
 * Check if a profile has the admin role.
 */
export function isAdmin(profile: Profile | null): boolean {
  return profile?.role === "admin";
}

/**
 * Check if a profile has the veterinarian role.
 */
export function isVeterinarian(profile: Profile | null): boolean {
  return profile?.role === "veterinarian";
}

/**
 * Check if a profile has the owner role.
 */
export function isOwner(profile: Profile | null): boolean {
  return profile?.role === "owner";
}

/** Roles that run clinic operations (approvals, appointments, schedules, logs). */
export const ADMIN_STAFF_ROLES = ["admin", "staff"] as const satisfies readonly UserRole[];

/** Every clinic team role (clinical records, billing, owners registry). */
export const CLINIC_ROLES = ["admin", "staff", "veterinarian"] as const satisfies readonly UserRole[];

/**
 * Check if a profile is Admin or Staff. Staff has the same access as Admin
 * except clinic configuration (team management and the service catalog).
 */
export function isAdminOrStaff(profile: Pick<Profile, "role"> | null): boolean {
  return profile?.role === "admin" || profile?.role === "staff";
}

/**
 * Check if a profile belongs to the clinic team (admin, staff, or veterinarian).
 */
export function isStaff(profile: Pick<Profile, "role"> | null): boolean {
  return isAdminOrStaff(profile) || profile?.role === "veterinarian";
}

/**
 * Get the appropriate dashboard path based on user role.
 * Admins get /dashboard, owners get /dashboard, etc.
 * In the future this could route to different dashboards per role.
 */
export function getDashboardPath(): string {
  // For now, all roles use /dashboard
  // In the future, staff might go to /dashboard/staff, owners to /dashboard/portal
  return "/dashboard";
}
