import { TimerOff } from "lucide-react";

export const AUTO_CANCELLED_MESSAGE =
  "Cancelled automatically by the system: the appointment date passed before the clinic accepted the booking.";

/** Pill shown next to the "Cancelled" status when the system, not a person, cancelled the booking. */
export function AutoCancelledBadge() {
  return (
    <span
      data-testid="auto-cancelled-badge"
      title={AUTO_CANCELLED_MESSAGE}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
    >
      <TimerOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      Auto-cancelled
    </span>
  );
}

/** One-line explanation of why the system cancelled the booking. */
export function AutoCancelledNotice({ className = "" }: { className?: string }) {
  return (
    <p
      data-testid="auto-cancelled-notice"
      className={`flex items-start gap-2 rounded-lg border border-border bg-muted/60 p-2.5 text-xs text-muted-foreground ${className}`}
    >
      <TimerOff className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
      <span>{AUTO_CANCELLED_MESSAGE}</span>
    </p>
  );
}
