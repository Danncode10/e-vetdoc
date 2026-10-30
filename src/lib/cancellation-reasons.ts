import type { Database } from "@/types/supabase";

export type CancellationReason = Database["public"]["Enums"]["cancellation_reason"];

/** Who is cancelling: the pet owner, or the clinic front desk (Admin / Staff). */
export type CancelAudience = "owner" | "clinic";

export const CANCEL_REASONS: Record<CancelAudience, ReadonlyArray<{ value: CancellationReason; label: string }>> = {
  owner: [
    { value: "owner_request", label: "I need to reschedule" },
    { value: "pet_health_issue", label: "My pet is unwell / not ready" },
    { value: "other", label: "Other reason" },
  ],
  clinic: [
    { value: "clinic_emergency", label: "Clinic emergency" },
    { value: "no_veterinarian_available", label: "No veterinarian available" },
    { value: "weather", label: "Bad weather" },
    { value: "other", label: "Other reason" },
  ],
};

export function cancelAudienceFor(role: string | null | undefined): CancelAudience {
  return role === "owner" ? "owner" : "clinic";
}
