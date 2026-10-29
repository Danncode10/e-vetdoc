import type { Database } from "@/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type UserRole = Profile["role"];

export type DashboardTabId =
  | "overview"
  | "pets"
  | "owners"
  | "appointments"
  | "approvals"
  | "team"
  | "logs"
  | "billing"
  | "settings"
  | "schedules";

export type FeatureFlag =
  | "always"
  | "pets"
  | "owners"
  | "appointments"
  | "billing"
  | "staff-only"
  | "admin-or-staff"
  | "admin-only"
  | "schedules";

interface TabConfig {
  id: DashboardTabId;
  label: string;
  feature: FeatureFlag;
}

export const TAB_CONFIG: TabConfig[] = [
  { id: "overview", label: "Overview", feature: "always" },
  { id: "pets", label: "Pets", feature: "pets" },
  { id: "owners", label: "Owners", feature: "owners" },
  { id: "appointments", label: "Appointments", feature: "appointments" },
  { id: "schedules", label: "Schedule", feature: "staff-only" },
  { id: "billing", label: "Billing", feature: "always" },
  { id: "approvals", label: "Approvals", feature: "admin-or-staff" },
  { id: "team", label: "Team", feature: "admin-only" },
  { id: "logs", label: "Logs", feature: "admin-or-staff" },
  { id: "settings", label: "Settings", feature: "always" },
];

function isClinicRole(role: UserRole) {
  return role === "admin" || role === "staff" || role === "veterinarian";
}

/**
 * Check if a feature flag is enabled for a given role.
 * This implements the authorization model for dashboard tabs.
 */
export function isFeatureEnabled(flag: FeatureFlag, role: UserRole | null): boolean {
  if (flag === "always") return true;
  if (!role) return false;

  // Role-based feature access
  switch (flag) {
    case "pets":
      // Owners can manage their own pets, the clinic team can view all pets
      return role === "owner" || isClinicRole(role);
    case "owners":
      // Only the clinic team can view the owners registry
      return isClinicRole(role);
    case "appointments":
      // All authenticated users can access appointments (request/view)
      return role === "owner" || isClinicRole(role);
    case "staff-only":
      return isClinicRole(role);
    case "admin-or-staff":
      return role === "admin" || role === "staff";
    case "admin-only":
      return role === "admin";
    default:
      return false;
  }
}

/**
 * Get enabled tabs for a given role.
 */
export function getEnabledTabs(role: UserRole | null): TabConfig[] {
  return TAB_CONFIG.filter((t) => isFeatureEnabled(t.feature, role));
}

/**
 * Check if a tab is accessible for a given role.
 */
export function isTabEnabled(tabId: DashboardTabId, role: UserRole | null): boolean {
  const tab = TAB_CONFIG.find((t) => t.id === tabId);
  if (!tab) return false;
  return isFeatureEnabled(tab.feature, role);
}
