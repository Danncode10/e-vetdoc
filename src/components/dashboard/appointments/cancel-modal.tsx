"use client";

import * as React from "react";
import { XCircle, Stethoscope, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CANCEL_REASONS, type CancelAudience } from "@/lib/cancellation-reasons";

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(iso));
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

interface CancelModalProps {
  appointment: any;
  /** Owners see personal reasons; the clinic front desk sees clinic-side reasons. */
  audience?: CancelAudience;
  onConfirm: (reason: string) => Promise<void>;
  onClose: () => void;
}

export function CancelModal({ appointment, audience = "owner", onConfirm, onClose }: CancelModalProps) {
  const reasons = CANCEL_REASONS[audience];
  const [reason, setReason] = React.useState<string>(reasons[0].value);
  const [isPending, setIsPending] = React.useState(false);

  const petName = appointment.pets?.name || "your pet";
  const serviceName = appointment.services?.name || "this appointment";
  const dateStr = appointment.scheduled_start
    ? fmtDate(appointment.scheduled_start)
    : appointment.preferred_date || "the scheduled date";
  const timeStr = appointment.scheduled_start ? fmtTime(appointment.scheduled_start) : "";

  async function handleConfirm() {
    setIsPending(true);
    try {
      await onConfirm(reason);
    } finally {
      setIsPending(false);
    }
  }

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-modal-title"
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-destructive/60 via-destructive to-destructive/60" />

        <div className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-destructive/10 ring-1 ring-destructive/20">
              <XCircle className="h-5 w-5 text-destructive" strokeWidth={1.5} />
            </div>
            <div>
              <h2 id="cancel-modal-title" className="text-base font-semibold text-foreground leading-tight">
                Cancel appointment?
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">This action cannot be undone.</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-4 mb-5 space-y-2.5">
            <div className="flex items-center gap-2">
              <Stethoscope className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
              <span className="text-sm font-medium text-foreground">{serviceName}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Patient</span>
              <span className="text-sm text-foreground">{petName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
              <span className="text-sm text-foreground">{dateStr}{timeStr ? ` · ${timeStr}` : ""}</span>
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Reason for cancellation
            </p>
            <div className="space-y-2">
              {reasons.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none ${
                    reason === r.value
                      ? "border-destructive/60 bg-destructive/5"
                      : "border-border bg-card hover:border-border/80 hover:bg-muted/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="cancel-reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="sr-only"
                  />
                  <span className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                    reason === r.value ? "border-destructive bg-destructive" : "border-muted-foreground/40"
                  }`}>
                    {reason === r.value && <span className="h-1.5 w-1.5 rounded-full bg-destructive-foreground" />}
                  </span>
                  <span className={`text-sm leading-tight ${reason === r.value ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                    {r.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={isPending}>
              Keep appointment
            </Button>
            <Button variant="destructive" className="flex-1 gap-2" onClick={handleConfirm} disabled={isPending}>
              {isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Cancelling…</>
              ) : (
                <><XCircle className="h-4 w-4" /> Yes, cancel appointment</>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
