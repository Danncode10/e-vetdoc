import { requireRole, CLINIC_ROLES } from "@/services/authorization";
import { getEncounterDetails, getPetClinicalHistory } from "@/services/clinical";
import { notFound } from "next/navigation";
import { EncounterWorkspace } from "@/components/dashboard/clinical/encounter-workspace";
import { getPetById } from "@/services/pets";

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { profile } = await requireRole(CLINIC_ROLES);
  const { id } = await params;

  const encounterData = await getEncounterDetails(id);
  if (!encounterData) {
    notFound();
  }

  const history = await getPetClinicalHistory(encounterData.encounter.pet_id);
  const petProfile = await getPetById(encounterData.encounter.pet_id);

  return (
    <div className="mx-auto max-w-6xl w-full">
      <EncounterWorkspace
        encounterData={encounterData}
        history={history}
        petProfile={petProfile}
        profile={profile}
      />
    </div>
  );
}
