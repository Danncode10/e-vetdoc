import "server-only";

import { createClient } from "@/utils/supabase/server";

/**
 * Owners cannot read clinic staff profiles (their phone and address are private), so an
 * embedded `veterinarian:profiles(...)` comes back empty for them. This fills in just the
 * clinic member's name through the `clinic_member_names()` database function.
 */
export async function fillClinicNames<T extends object>(rows: T[], idKey: keyof T, nameKey: keyof T): Promise<T[]> {
  const missingIds = [...new Set(rows.filter((row) => !row[nameKey] && row[idKey]).map((row) => String(row[idKey])))];
  if (missingIds.length === 0) return rows;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clinic_member_names", { p_ids: missingIds });
  if (error) {
    console.error("clinic_member_names failed:", error.message);
    return rows;
  }

  const people: Array<{ id: string; full_name: string | null }> = data ?? [];
  const byId = new Map(people.map((person) => [person.id, person]));
  return rows.map((row) => {
    if (row[nameKey] || !row[idKey]) return row;
    const person = byId.get(String(row[idKey]));
    return person ? ({ ...row, [nameKey]: { id: person.id, full_name: person.full_name, email: null } } as T) : row;
  });
}
