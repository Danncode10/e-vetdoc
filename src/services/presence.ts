"use server";

import { createClient } from "@/utils/supabase/server";

/** Records that the signed-in user has the app open (drives Online/Offline in the Owners tab). */
export async function touchLastSeen() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("touch_last_seen");
  if (error) console.error("touch_last_seen failed:", error.message);
}
