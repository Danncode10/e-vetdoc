/** Owner-facing names for appointment statuses (`requested` and `booked` are the approval steps). */
const STATUS_LABELS: Record<string, string> = {
  requested: "Pending approval",
  booked: "Approved",
  diagnosed: "Diagnosed",
  paid: "Paid",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export function appointmentStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace("_", " ");
}
