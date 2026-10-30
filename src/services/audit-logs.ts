"use server";

import "server-only";

import { createClient, createAdminClient } from "@/utils/supabase/server";
import { requireRole, ADMIN_STAFF_ROLES } from "@/services/authorization";

export type LogCategory = "all" | "appointment" | "clinical" | "billing" | "staff" | "account";

export interface ClinicActivityLog {
  id: string;
  category: "appointment" | "clinical" | "billing" | "staff" | "account";
  action: string;
  description: string;
  actor: {
    id: string | null;
    name: string;
    role: string | null;
    email: string | null;
  };
  target?: {
    type: string;
    label: string;
    id?: string;
  };
  timestamp: string;
  metadata?: Record<string, any>;
}

/** Self-service account changes, written by database triggers (see presence_and_account_audit migration). */
const ACCOUNT_ACTIONS = new Set(["profile_updated", "password_changed", "email_changed"]);

const PROFILE_FIELD_LABELS: Record<string, string> = {
  full_name: "name",
  phone: "phone number",
  address: "address",
  emergency_contact_name: "emergency contact name",
  emergency_contact_phone: "emergency contact phone",
  email: "email",
};

function describeStaffLog(action: string, actorName: string, targetName: string, isSelf: boolean, changedFields: string[]) {
  const subject = isSelf ? "their" : `${targetName}'s`;
  switch (action) {
    case "registration_approved":
      return `${actorName} approved the registration of ${targetName}.`;
    case "registration_rejected":
      return `${actorName} disapproved the registration of ${targetName}.`;
    case "profile_updated": {
      const order = Object.keys(PROFILE_FIELD_LABELS);
      const fields = [...changedFields]
        .sort((a, b) => order.indexOf(a) - order.indexOf(b))
        .map((field) => PROFILE_FIELD_LABELS[field] ?? field.replace(/_/g, " "));
      return `${actorName} updated ${subject} ${fields.length ? fields.join(", ") : "profile"}.`;
    }
    case "owner_trashed":
      return `${actorName} moved owner ${targetName} to Trash.`;
    case "staff_trashed":
      return `${actorName} moved team member ${targetName} to Trash.`;
    case "staff_restored":
      return `${actorName} restored team member ${targetName} from Trash.`;
    case "owner_restored":
      return `${actorName} restored owner ${targetName} from Trash.`;
    case "password_changed":
      return `${actorName} changed ${subject} password.`;
    case "email_changed":
      return `${actorName} changed ${subject} email address.`;
    default:
      return `${actorName} modified staff profile for ${targetName}.`;
  }
}

export interface ActivityLogFilters {
  category?: LogCategory;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

/**
 * Retrieves a unified, chronological feed of all administrative and staff activity logs.
 * Restricted to administrators only.
 */
export async function getClinicActivityLogs(
  filters: ActivityLogFilters = {}
): Promise<ClinicActivityLog[]> {
  await requireRole(ADMIN_STAFF_ROLES);

  const adminClient = createAdminClient();
  const limit = filters.limit ?? 250;
  const logs: ClinicActivityLog[] = [];

  // 1. Fetch Appointment Status History
  const { data: statusHistory } = await adminClient
    .from("appointment_status_history")
    .select(`
      id,
      previous_status,
      new_status,
      notes,
      reason,
      created_at,
      changed_by_id,
      changed_by_profile:profiles!appointment_status_history_changed_by_id_fkey (
        id,
        full_name,
        email,
        role
      ),
      appointment:appointments (
        id,
        scheduled_start,
        patient:pets (
          id,
          name,
          species
        ),
        service:services (
          id,
          name
        )
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusHistory) {
    for (const entry of statusHistory) {
      const isAutoCancel = entry.reason === "auto_cancelled";
      const actorName = isAutoCancel
        ? "System"
        : (entry.changed_by_profile as any)?.full_name ||
          (entry.changed_by_profile as any)?.email ||
          "System / Staff";
      const petName = (entry.appointment as any)?.patient?.name || "Patient";
      const serviceName = (entry.appointment as any)?.service?.name || "Appointment";
      const toStatus = entry.new_status?.toUpperCase() || "UPDATED";
      const fromStatus = entry.previous_status ? `from ${entry.previous_status} ` : "";

      logs.push({
        id: `status-${entry.id}`,
        category: "appointment",
        action: isAutoCancel ? "Appointment AUTO-CANCELLED" : `Appointment ${toStatus}`,
        description: isAutoCancel
          ? `System automatically cancelled ${petName}'s ${serviceName} appointment: the date passed before the clinic accepted it.`
          : `${actorName} transitioned ${petName}'s ${serviceName} appointment ${fromStatus}to ${toStatus}.`,
        actor: {
          id: entry.changed_by_id,
          name: actorName,
          role: isAutoCancel ? "system" : (entry.changed_by_profile as any)?.role ?? "staff",
          email: (entry.changed_by_profile as any)?.email ?? null,
        },
        target: {
          type: "appointment",
          label: `${petName} (${serviceName})`,
          id: (entry.appointment as any)?.id,
        },
        timestamp: entry.created_at,
        metadata: {
          previous_status: entry.previous_status,
          new_status: entry.new_status,
          notes: entry.notes,
        },
      });
    }
  }

  // 2. Fetch Payment Transactions
  const { data: payments } = await adminClient
    .from("payments")
    .select(`
      id,
      receipt_number,
      amount_paid,
      method,
      reference_number,
      payment_date,
      recorded_by,
      recorder:profiles!payments_recorded_by_fkey (
        id,
        full_name,
        email,
        role
      ),
      invoice:invoices (
        id,
        invoice_number,
        owner:profiles!invoices_owner_id_fkey (
          id,
          full_name,
          email
        )
      )
    `)
    .order("payment_date", { ascending: false })
    .limit(limit);

  if (payments) {
    for (const p of payments) {
      const actorName =
        (p.recorder as any)?.full_name ||
        (p.recorder as any)?.email ||
        "Staff";
      const clientName = (p.invoice as any)?.owner?.full_name || "Client";
      const invNum = (p.invoice as any)?.invoice_number || "Invoice";
      const amountFmt = `₱${Number(p.amount_paid).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

      logs.push({
        id: `payment-${p.id}`,
        category: "billing",
        action: "Payment Recorded",
        description: `${actorName} recorded ${amountFmt} payment via ${p.method.toUpperCase()} for ${clientName} (${invNum}).`,
        actor: {
          id: p.recorded_by,
          name: actorName,
          role: (p.recorder as any)?.role ?? "admin",
          email: (p.recorder as any)?.email ?? null,
        },
        target: {
          type: "receipt",
          label: p.receipt_number,
          id: p.id,
        },
        timestamp: p.payment_date,
        metadata: {
          amount: p.amount_paid,
          method: p.method,
          receipt_number: p.receipt_number,
          reference_number: p.reference_number,
        },
      });
    }
  }

  // 3. Fetch Encounters (Diagnoses & Signings)
  const { data: encounters } = await adminClient
    .from("encounters")
    .select(`
      id,
      status,
      signed_at,
      created_at,
      veterinarian_id,
      vet:profiles!encounters_veterinarian_id_fkey (
        id,
        full_name,
        email,
        role
      ),
      pet:pets!encounters_pet_id_fkey (
        id,
        name,
        species
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (encounters) {
    for (const enc of encounters) {
      const vetName =
        (enc.vet as any)?.full_name ||
        (enc.vet as any)?.email ||
        "Veterinarian";
      const petName = (enc.pet as any)?.name || "Patient";

      if (enc.status === "signed" && enc.signed_at) {
        logs.push({
          id: `encounter-signed-${enc.id}`,
          category: "clinical",
          action: "Encounter Signed",
          description: `Dr. ${vetName} finalized and signed clinical medical encounter for ${petName}.`,
          actor: {
            id: enc.veterinarian_id,
            name: vetName,
            role: "veterinarian",
            email: (enc.vet as any)?.email ?? null,
          },
          target: {
            type: "pet",
            label: `${petName} (${(enc.pet as any)?.species ?? "Pet"})`,
            id: (enc.pet as any)?.id,
          },
          timestamp: enc.signed_at,
          metadata: { encounter_id: enc.id, status: enc.status },
        });
      } else {
        logs.push({
          id: `encounter-created-${enc.id}`,
          category: "clinical",
          action: "Encounter Started",
          description: `Dr. ${vetName} initiated a clinical examination for ${petName}.`,
          actor: {
            id: enc.veterinarian_id,
            name: vetName,
            role: "veterinarian",
            email: (enc.vet as any)?.email ?? null,
          },
          target: {
            type: "pet",
            label: `${petName} (${(enc.pet as any)?.species ?? "Pet"})`,
            id: (enc.pet as any)?.id,
          },
          timestamp: enc.created_at,
          metadata: { encounter_id: enc.id, status: enc.status },
        });
      }
    }
  }

  // 4. Fetch Staff Audit Logs
  const { data: staffLogs } = await adminClient
    .from("staff_audit_logs")
    .select(`
      id,
      action,
      previous_values,
      next_values,
      created_at,
      actor_id,
      target_profile_id,
      actor:profiles!staff_audit_logs_actor_id_fkey (
        id,
        full_name,
        email,
        role
      ),
      target:profiles!staff_audit_logs_target_profile_id_fkey (
        id,
        full_name,
        email,
        role
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (staffLogs) {
    for (const sl of staffLogs) {
      const actorName =
        (sl.actor as any)?.full_name ||
        (sl.actor as any)?.email ||
        "Admin";
      const targetName =
        (sl.target as any)?.full_name ||
        (sl.target as any)?.email ||
        "Staff Member";

      const isAccountChange = ACCOUNT_ACTIONS.has(sl.action);
      const changedFields =
        sl.next_values && typeof sl.next_values === "object" && !Array.isArray(sl.next_values)
          ? Object.keys(sl.next_values)
          : [];

      logs.push({
        id: `staff-${sl.id}`,
        category: isAccountChange ? "account" : "staff",
        action: sl.action.replace(/_/g, " ").toUpperCase(),
        description: describeStaffLog(sl.action, actorName, targetName, sl.actor_id === sl.target_profile_id, changedFields),
        actor: {
          id: sl.actor_id,
          name: actorName,
          role: (sl.actor as { role?: string } | null)?.role ?? "admin",
          email: (sl.actor as any)?.email ?? null,
        },
        target: {
          type: isAccountChange ? "account" : "staff",
          label: targetName,
          id: sl.target_profile_id,
        },
        timestamp: sl.created_at,
        metadata: {
          previous: sl.previous_values,
          next: sl.next_values,
        },
      });
    }
  }

  // 5. Fetch Schedule Audit Logs
  const { data: scheduleLogs } = await adminClient
    .from("schedule_audit_logs")
    .select(`
      id,
      action,
      previous_values,
      next_values,
      created_at,
      actor_id,
      target_schedule_id,
      actor:profiles!schedule_audit_logs_actor_id_fkey (
        id,
        full_name,
        email,
        role
      ),
      target:appointment_schedules!schedule_audit_logs_target_schedule_id_fkey (
        id,
        specific_date,
        day_of_week,
        start_time,
        end_time
      )
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (scheduleLogs) {
    for (const sl of scheduleLogs) {
      const actorName =
        (sl.actor as any)?.full_name ||
        (sl.actor as any)?.email ||
        "Admin";
      
      let targetName = "Schedule";
      if (sl.target) {
        const t = sl.target as any;
        if (t.specific_date) targetName = `Schedule (${t.specific_date})`;
        else targetName = `Schedule (Day ${t.day_of_week})`;
      }

      logs.push({
        id: `schedule-${sl.id}`,
        category: "staff", // Grouping under staff/admin actions
        action: `SCHEDULE ${sl.action.toUpperCase()}`,
        description: `${actorName} ${sl.action} an appointment schedule.`,
        actor: {
          id: sl.actor_id,
          name: actorName,
          role: (sl.actor as any)?.role || "admin",
          email: (sl.actor as any)?.email ?? null,
        },
        target: {
          type: "schedule",
          label: targetName,
          id: sl.target_schedule_id,
        },
        timestamp: sl.created_at,
        metadata: {
          previous: sl.previous_values,
          next: sl.next_values,
        },
      });
    }
  }

  // Sort combined logs descending by timestamp
  logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Apply In-Memory Filtering
  let filtered = logs;

  if (filters.category && filters.category !== "all") {
    filtered = filtered.filter((l) => l.category === filters.category);
  }

  if (filters.search && filters.search.trim()) {
    const q = filters.search.toLowerCase().trim();
    filtered = filtered.filter(
      (l) =>
        l.action.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.actor.name.toLowerCase().includes(q) ||
        (l.target?.label && l.target.label.toLowerCase().includes(q))
    );
  }

  if (filters.startDate) {
    const start = new Date(filters.startDate).getTime();
    filtered = filtered.filter((l) => new Date(l.timestamp).getTime() >= start);
  }

  if (filters.endDate) {
    const end = new Date(filters.endDate).getTime();
    filtered = filtered.filter((l) => new Date(l.timestamp).getTime() <= end);
  }

  return filtered.slice(0, limit);
}
