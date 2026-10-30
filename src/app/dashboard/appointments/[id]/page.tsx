import { getAppointmentById, getPendingSlotUsage, listOwnerAppointments } from "@/services/appointments";
import { getOwnerRegistryDetail } from "@/services/pets";
import { requireAuth } from "@/services/authorization";
import { notFound, redirect } from "next/navigation";
import { AppointmentDetailView } from "@/components/dashboard/appointments/appointment-detail-view";
import { getEncounterByAppointmentId, startEncounterForAppointment } from "@/services/clinical";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireAuth();
  const { id } = await params;

  let appt: Awaited<ReturnType<typeof getAppointmentById>>;
  try {
    appt = await getAppointmentById(id);
  } catch {
    notFound();
  }

  // Owners may only view their own appointments
  if (profile.role === "owner" && appt.owner_id !== profile.id) {
    notFound();
  }

  const ownerId = appt.owner_id;

  // Fetch owner appointments, owner pets, and check if an encounter already exists in parallel
  const canApprove = profile.role === "admin" || profile.role === "staff";
  const [ownerAppointments, ownerRegistry, existingEncounter, slotUsage] = await Promise.all([
    listOwnerAppointments(ownerId).catch(() => []),
    getOwnerRegistryDetail(ownerId).catch(() => null),
    getEncounterByAppointmentId(id).catch(() => null),
    canApprove && appt.status === "requested" ? getPendingSlotUsage().catch(() => ({})) : Promise.resolve({}),
  ]);

  const ownerPets = ownerRegistry?.linkedPets || [];
  
  let encounterDetails = null;
  if (existingEncounter) {
    const { getEncounterDetails } = await import("@/services/clinical");
    encounterDetails = await getEncounterDetails(existingEncounter.id).catch(() => null);
  }

  const handleStartEncounter = async () => {
    "use server";
    const encounter = await startEncounterForAppointment(appt.id);
    redirect(`/dashboard/encounters/${encounter.id}`);
  };

  return (
    <AppointmentDetailView
      appointment={appt}
      ownerAppointments={ownerAppointments}
      ownerPets={ownerPets}
      userRole={profile.role || undefined}
      onStartEncounter={handleStartEncounter}
      existingEncounter={existingEncounter}
      encounterDetails={encounterDetails}
      slotUsage={(slotUsage as Record<string, { approved: number; capacity: number }>)[appt.id] ?? null}
    />
  );
}
