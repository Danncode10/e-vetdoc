"use client";

import { useEffect } from "react";
import { PRESENCE_HEARTBEAT_MS } from "@/lib/presence";
import { touchLastSeen } from "@/services/presence";

/** Reports the user as online while the app is open in a visible tab. */
export function usePresenceHeartbeat() {
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "visible") void touchLastSeen();
    };

    beat();
    const timer = window.setInterval(beat, PRESENCE_HEARTBEAT_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, []);
}
