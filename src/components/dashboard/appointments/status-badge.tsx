import { CheckCircle2, Hourglass } from "lucide-react";
import { appointmentStatusLabel } from "@/lib/appointment-status";

type StatusStyle = { badge: string; dot: string; stripe: string; Icon?: typeof CheckCircle2 };

export const STATUS_STYLES: Record<string, StatusStyle> = {
  requested: {
    badge: "bg-muted text-foreground border-dashed border-muted-foreground/60",
    dot: "bg-muted-foreground",
    stripe: "bg-muted-foreground/40",
    Icon: Hourglass,
  },
  // Approved stands out: solid brand colour with a check.
  booked: {
    badge: "bg-primary text-primary-foreground border-primary shadow-xs",
    dot: "bg-primary-foreground",
    stripe: "bg-primary",
    Icon: CheckCircle2,
  },
  diagnosed: {
    badge: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700",
    dot: "bg-amber-500",
    stripe: "bg-amber-400",
  },
  paid: {
    badge: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700",
    dot: "bg-emerald-500",
    stripe: "bg-emerald-500",
  },
  completed: {
    badge: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-700",
    dot: "bg-green-500",
    stripe: "bg-green-500",
  },
  cancelled: {
    badge: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-700",
    dot: "bg-red-500",
    stripe: "bg-red-400",
  },
};

const FALLBACK: StatusStyle = { badge: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground", stripe: "bg-muted" };

export function statusStripe(status: string) {
  return (STATUS_STYLES[status] ?? FALLBACK).stripe;
}

export function AppointmentStatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const style = STATUS_STYLES[status] ?? FALLBACK;
  const Icon = style.Icon;
  return (
    <span
      data-testid="appointment-status"
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold ${style.badge} ${
        size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} /> : <span className={`h-1.5 w-1.5 rounded-full ${style.dot} shrink-0`} />}
      {appointmentStatusLabel(status)}
    </span>
  );
}
