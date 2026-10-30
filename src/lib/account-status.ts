import type { Database } from "@/types/supabase";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type AccountState = "approved" | "pending" | "rejected" | "deactivated";

export function getAccountState(profile: Pick<Profile, "approval_status" | "is_active">): AccountState {
  if (profile.approval_status === "rejected") return "rejected";
  if (profile.approval_status === "pending") return "pending";
  if (!profile.is_active) return "deactivated";
  return "approved";
}

export const ACCOUNT_STATE_MESSAGES: Record<Exclude<AccountState, "approved">, { title: string; message: string }> = {
  pending: {
    title: "Waiting for approval",
    message: "Your account is waiting for approval by the clinic. You can sign in once an Admin or Staff member approves it.",
  },
  rejected: {
    title: "Registration not approved",
    message: "Your registration was not approved. Please contact the clinic if you think this is a mistake.",
  },
  deactivated: {
    title: "Account deactivated",
    message: "This account has been deactivated. Please contact the clinic.",
  },
};
