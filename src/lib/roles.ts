import type { Database } from "@/types/supabase";

export type UserRole = Database["public"]["Enums"]["user_role"];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  staff: "Staff",
  veterinarian: "Veterinarian",
  owner: "Owner",
};

/** Roles a person can request when registering. Every request needs approval. */
export const REGISTRATION_ROLES: ReadonlyArray<{ value: UserRole; label: string; description: string }> = [
  { value: "owner", label: ROLE_LABELS.owner, description: "Pet owner: book visits and view your pets" },
  { value: "veterinarian", label: ROLE_LABELS.veterinarian, description: "Consultations, diagnoses, treatments" },
  { value: "staff", label: ROLE_LABELS.staff, description: "Front desk: approvals and appointments" },
  { value: "admin", label: ROLE_LABELS.admin, description: "Full clinic access" },
];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && value in ROLE_LABELS;
}

export function roleLabel(role: UserRole | null | undefined): string {
  return role ? ROLE_LABELS[role] : "Unassigned";
}
