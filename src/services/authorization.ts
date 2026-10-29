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
 * Get the authenticated user and their profile.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user || !isEmailVerified(user)) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.role || !profile.is_active) return null;

  return { user, profile };
}

/**
 * Require an authenticated user. Throws redirect to /login if not authenticated.
 * Returns the user and profile on success.
 */
export async function requireAuth(): Promise<AuthenticatedUser> {
  const currentUser = await getCurrentUser();

  if (!currentUser || !currentUser.user) {
    redirect("/login");
  }

  return currentUser;
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
