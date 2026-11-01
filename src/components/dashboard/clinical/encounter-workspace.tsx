"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  CheckCircle,
  FileText,
  History,
  ArrowLeft,
  Plus,
  Trash2,
  PawPrint,
  Calendar
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { saveEncounterDraft, signEncounter } from "@/services/clinical";
import Link from "next/link";
import { toast } from "sonner";
import { Download, Receipt } from "lucide-react";
import { QuickBillingDialog } from "@/components/dashboard/billing/quick-billing-dialog";

interface EncounterWorkspaceProps {
  encounterData: any;
  history: any[];
  petProfile: any;
  profile: any;
}

export function EncounterWorkspace({
  encounterData,
  history,
  petProfile,
  profile,
}: EncounterWorkspaceProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<"current" | "history">("current");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isSignDialogOpen, setIsSignDialogOpen] = React.useState(false);

  const enc = encounterData.encounter;
  const initialNote = encounterData.notes || {};
  
  const [encounterNotes, setEncounterNotes] = React.useState(enc.notes || "");
  const [chiefComplaint, setChiefComplaint] = React.useState(initialNote.chief_complaint || "");
  const [subjective, setSubjective] = React.useState(initialNote.subjective || "");
  const [objective, setObjective] = React.useState(initialNote.objective || "");
  const [assessment, setAssessment] = React.useState(initialNote.assessment || "");
  const [plan, setPlan] = React.useState(initialNote.plan || "");

  const [diagnoses, setDiagnoses] = React.useState<any[]>(encounterData.diagnoses || []);
  const [treatments, setTreatments] = React.useState<any[]>(encounterData.treatments || []);
  const [prescriptions, setPrescriptions] = React.useState<any[]>(encounterData.prescriptions || []);

  const isSigned = enc.status === "signed";

  // Billing is the front desk's job (Admin/Staff); vets see the button greyed out.
  const [isBillingOpen, setIsBillingOpen] = React.useState(false);
  const canBill = profile?.role === "admin" || profile?.role === "staff";
  const appointment = enc.appointment;
  const showContinueToPayment = isSigned && appointment?.status === "diagnosed";

  const handleContinueToPayment = () => {
    if (!canBill) {
      toast.error("Only Staff and Admin can do this", {
        description: "Ask the front desk to charge and mark this visit as paid.",
      });
      return;
    }
    setIsBillingOpen(true);
  };

  const addDiagnosis = () => setDiagnoses([...diagnoses, { description: "", diagnosis_code: "", notes: "" }]);
  const updateDiagnosis = (i: number, field: string, value: string) => {
    const updated = [...diagnoses];
    updated[i][field] = value;
    setDiagnoses(updated);
  };
  const removeDiagnosis = (i: number) => setDiagnoses(diagnoses.filter((_, idx) => idx !== i));

  const addTreatment = () => setTreatments([...treatments, { name: "", description: "", cost: 0 }]);
  const updateTreatment = (i: number, field: string, value: string) => {
    const updated = [...treatments];
    updated[i][field] = value;
    setTreatments(updated);
  };
  const removeTreatment = (i: number) => setTreatments(treatments.filter((_, idx) => idx !== i));

  const addPrescription = () => setPrescriptions([...prescriptions, { medication_name: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
  const updatePrescription = (i: number, field: string, value: string) => {
    const updated = [...prescriptions];
    updated[i][field] = value;
    setPrescriptions(updated);
  };
  const removePrescription = (i: number) => setPrescriptions(prescriptions.filter((_, idx) => idx !== i));

  const handleSaveDraft = async () => {
    if (isSigned) return;
    setIsSaving(true);
    try {
      await saveEncounterDraft(enc.id, {
        encounterNotes,
        clinicalNote: {
          chief_complaint: chiefComplaint,
          subjective,
          objective,
          assessment,
          plan,
        },
        diagnoses,
        treatments,
        prescriptions,
      });
      router.refresh();
      toast.success("Draft saved successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save draft.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignRecord = async () => {
    if (isSigned) return;
    
    setIsSaving(true);
    try {
      // First save draft, then sign
      await saveEncounterDraft(enc.id, {
        encounterNotes,
        clinicalNote: {
          chief_complaint: chiefComplaint,
          subjective,
          objective,
          assessment,
          plan,
        },
        diagnoses,
        treatments,
        prescriptions,
      });
      await signEncounter(enc.id);
      router.refresh();
      setIsSignDialogOpen(false);
      toast.success("Encounter signed successfully!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to sign record.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8 px-4 py-8 md:px-10 max-w-7xl mx-auto">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-border pb-6">
        <div>
          <Link href={`/dashboard/appointments/${enc.appointment_id}`} className="text-sm text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2 mb-3">
            <ArrowLeft className="h-4 w-4" /> Back to Appointment
          </Link>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Encounter Workspace
            </h1>
            {isSigned ? (
              <Badge variant="default" className="bg-green-600 hover:bg-green-700 font-semibold px-3 py-1">Signed</Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 font-semibold px-3 py-1">Draft Mode</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Complete the clinical record for this visit. {isSigned && "This record is finalized."}
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/encounters/${enc.id}/print`}
            className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-sm font-medium rounded-md transition-colors"
          >
            <Download className="h-4 w-4" />
            Download PDF
          </Link>
        </div>
      </div>

      {/* Patient Highlight */}
      <div className="bg-card shadow-sm border border-border p-6 rounded-2xl flex items-center gap-6">
        <div className="h-16 w-16 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-inner">
          <PawPrint className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground">{petProfile?.name || "Patient"}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 font-medium">
            <span className="capitalize">{petProfile?.species || "Unknown Species"}</span>
            <span className="opacity-50">•</span>
            <span className="capitalize">{petProfile?.breed || "Unknown Breed"}</span>
            {petProfile?.age && (
              <>
                <span className="opacity-50">•</span>
                <span>{petProfile.age} yrs</span>
              </>
            )}
            {petProfile?.sex && (
              <>
                <span className="opacity-50">•</span>
                <span className="capitalize">{petProfile.sex}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-6 border-b border-border">
        <button
          onClick={() => setActiveTab("current")}
          className={`flex items-center gap-2 px-1 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === "current" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <FileText className="h-4 w-4" /> Current Visit Note
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 px-1 py-3 text-sm font-bold border-b-2 transition-all ${
            activeTab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <History className="h-4 w-4" /> Longitudinal Medical History
        </button>
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === "current" && (
          <div className="space-y-2">
            <div className="grid gap-8 lg:grid-cols-12">
              {/* Left Column: SOAP Notes (Larger width) */}
              <div className="lg:col-span-7 space-y-6">
              <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden">
                <div className="bg-muted/40 px-6 py-4 border-b border-border">
                  <h3 className="text-lg font-bold text-foreground">SOAP Notes</h3>
                  <p className="text-xs text-muted-foreground mt-1">Subjective, Objective, Assessment, and Plan</p>
                </div>
                <div className="p-6 space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">Chief Complaint / Notes</label>
                    <Textarea value={chiefComplaint} onChange={(e: any) => setChiefComplaint(e.target.value)} disabled={isSigned} placeholder="What is the primary reason for today's visit?" className="min-h-[80px] resize-none focus-visible:ring-primary/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">Subjective</label>
                    <p className="text-xs text-muted-foreground mb-2">Historical information and client observations.</p>
                    <Textarea value={subjective} onChange={(e: any) => setSubjective(e.target.value)} disabled={isSigned} placeholder="e.g. Lethargic for 2 days, not eating..." className="min-h-[100px] resize-none focus-visible:ring-primary/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">Objective</label>
                    <p className="text-xs text-muted-foreground mb-2">Physical exam findings and vital signs.</p>
                    <Textarea value={objective} onChange={(e: any) => setObjective(e.target.value)} disabled={isSigned} placeholder="e.g. Temp 101.5F, HR 120, pale mucous membranes..." className="min-h-[100px] resize-none focus-visible:ring-primary/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">Assessment</label>
                    <p className="text-xs text-muted-foreground mb-2">Differential diagnoses or definitive working diagnosis.</p>
                    <Textarea value={assessment} onChange={(e: any) => setAssessment(e.target.value)} disabled={isSigned} placeholder="e.g. Suspect acute gastroenteritis vs foreign body..." className="min-h-[100px] resize-none focus-visible:ring-primary/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-foreground">Plan</label>
                    <p className="text-xs text-muted-foreground mb-2">Treatments, diagnostics, and follow-up instructions.</p>
                    <Textarea value={plan} onChange={(e: any) => setPlan(e.target.value)} disabled={isSigned} placeholder="e.g. Run CBC/Chem, administer SQ fluids, send home with Cerenia..." className="min-h-[100px] resize-none focus-visible:ring-primary/50" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Dynamic Lists */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Diagnoses */}
              <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden">
                <div className="bg-muted/40 px-5 py-4 border-b border-border flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-foreground">Diagnoses</h3>
                    <p className="text-xs text-muted-foreground">Formal diagnosis codes and descriptions</p>
                  </div>
                  {!isSigned && (
                    <Button size="sm" variant="outline" onClick={addDiagnosis} className="h-8 gap-1 font-semibold">
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  )}
                </div>
                <div className="p-5">
                  {diagnoses.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/60">
                      <p className="text-sm">No diagnoses added.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {diagnoses.map((d, i) => (
                        <div key={i} className="flex gap-3 items-start group">
                          <Input placeholder="Code (opt)" value={d.diagnosis_code || ""} onChange={(e: any) => updateDiagnosis(i, "diagnosis_code", e.target.value)} disabled={isSigned} className="w-24 bg-background" />
                          <Input placeholder="Diagnosis description..." value={d.description || ""} onChange={(e: any) => updateDiagnosis(i, "description", e.target.value)} disabled={isSigned} className="flex-1 bg-background" />
                          {!isSigned && (
                            <Button size="icon" variant="ghost" onClick={() => removeDiagnosis(i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Treatments */}
              <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden">
                <div className="bg-muted/40 px-5 py-4 border-b border-border flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-foreground">Treatments</h3>
                    <p className="text-xs text-muted-foreground">In-clinic procedures or administered items</p>
                  </div>
                  {!isSigned && (
                    <Button size="sm" variant="outline" onClick={addTreatment} className="h-8 gap-1 font-semibold">
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  )}
                </div>
                <div className="p-5">
                  {treatments.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/60">
                      <p className="text-sm">No treatments added.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {treatments.map((t, i) => (
                        <div key={i} className="flex gap-3 items-start group">
                          <Input placeholder="Treatment name..." value={t.name || ""} onChange={(e: any) => updateTreatment(i, "name", e.target.value)} disabled={isSigned} className="flex-1 bg-background" />
                          <div className="relative w-32">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₱</span>
                            <Input type="number" placeholder="0.00" value={t.cost || ""} onChange={(e: any) => updateTreatment(i, "cost", e.target.value)} disabled={isSigned} className="w-full pl-7 bg-background" />
                          </div>
                          {!isSigned && (
                            <Button size="icon" variant="ghost" onClick={() => removeTreatment(i)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Prescriptions */}
              <div className="bg-card shadow-sm border border-border rounded-2xl overflow-hidden">
                <div className="bg-muted/40 px-5 py-4 border-b border-border flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-foreground">Prescriptions</h3>
                    <p className="text-xs text-muted-foreground">Medications to send home</p>
                  </div>
                  {!isSigned && (
                    <Button size="sm" variant="outline" onClick={addPrescription} className="h-8 gap-1 font-semibold">
                      <Plus className="h-3 w-3" /> Add
                    </Button>
                  )}
                </div>
                <div className="p-5">
                  {prescriptions.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/60">
                      <p className="text-sm">No prescriptions added.</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {prescriptions.map((p, i) => (
                        <div key={i} className="p-4 bg-muted/10 border border-border rounded-xl space-y-3 relative group">
                          {!isSigned && (
                            <Button size="icon" variant="ghost" onClick={() => removePrescription(i)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Medication Name</label>
                            <Input placeholder="e.g. Amoxicillin" value={p.medication_name || ""} onChange={(e: any) => updatePrescription(i, "medication_name", e.target.value)} disabled={isSigned} className="bg-background" />
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Dosage</label>
                              <Input placeholder="e.g. 50mg" value={p.dosage || ""} onChange={(e: any) => updatePrescription(i, "dosage", e.target.value)} disabled={isSigned} className="bg-background" />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Frequency</label>
                              <Input placeholder="e.g. BID" value={p.frequency || ""} onChange={(e: any) => updatePrescription(i, "frequency", e.target.value)} disabled={isSigned} className="bg-background" />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Duration</label>
                              <Input placeholder="e.g. 7 days" value={p.duration || ""} onChange={(e: any) => updatePrescription(i, "duration", e.target.value)} disabled={isSigned} className="bg-background" />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Instructions / Route</label>
                            <Input placeholder="e.g. Give with food via mouth" value={p.instructions || ""} onChange={(e: any) => updatePrescription(i, "instructions", e.target.value)} disabled={isSigned} className="bg-background" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          {!isSigned && (
            <div className="flex items-center justify-end gap-4 mt-8 pt-6 border-t border-border">
              <Button variant="outline" onClick={handleSaveDraft} disabled={isSaving} className="font-semibold shadow-sm h-12 px-6">
                <Save className="h-4 w-4 mr-2" /> {isSaving ? "Saving..." : "Save Draft"}
              </Button>
              <Button variant="default" onClick={() => setIsSignDialogOpen(true)} disabled={isSaving} className="font-semibold shadow-sm h-12 px-8">
                <CheckCircle className="h-4 w-4 mr-2" /> Sign & Lock Record
              </Button>
            </div>
          )}

          {showContinueToPayment && (
            <div className="mt-8 flex flex-col gap-4 rounded-2xl border-2 border-primary/40 bg-primary/5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Record signed. Next step: payment</p>
                  <p className="text-xs text-muted-foreground">
                    {canBill
                      ? "Charge the visit and mark it as paid."
                      : "Only Staff and Admin can take payment for this visit."}
                  </p>
                </div>
              </div>
              <Button
                variant={canBill ? "default" : "outline"}
                onClick={handleContinueToPayment}
                aria-disabled={!canBill}
                title={canBill ? undefined : "Only Staff and Admin can do this"}
                className={`h-12 gap-2 px-8 font-semibold shadow-sm ${canBill ? "" : "cursor-not-allowed bg-muted text-muted-foreground opacity-60 hover:bg-muted"}`}
              >
                <Receipt className="h-4 w-4" />
                Continue to Payment
              </Button>
            </div>
          )}
        </div>
        )}

        {activeTab === "history" && (
          <div className="bg-card shadow-sm border border-border rounded-2xl p-6 lg:p-8">
            <div className="mb-6">
              <h3 className="text-2xl font-bold text-foreground">Past Medical Records</h3>
              <p className="text-muted-foreground text-sm mt-1">Review finalized clinical encounters from previous visits.</p>
            </div>
            
            {history.length === 0 ? (
               <div className="text-center py-12 bg-muted/20 border border-dashed border-border rounded-xl">
                 <History className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                 <h4 className="text-base font-semibold text-foreground">No Historical Records</h4>
                 <p className="text-sm text-muted-foreground mt-1">This pet has no previously signed clinical encounters.</p>
               </div>
            ) : (
               <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                 {history.map((h: any) => (
                   <div key={h.encounter.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-background bg-primary/10 text-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <CheckCircle className="h-5 w-5" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-card border border-border p-5 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span className="font-bold text-foreground">{new Date(h.encounter.signed_at).toLocaleDateString()}</span>
                          </div>
                          <Badge variant="outline" className="bg-background">{h.encounter.veterinarian?.full_name}</Badge>
                        </div>
                        
                        <div className="space-y-4">
                          {h.notes?.chief_complaint && (
                            <div className="text-sm">
                              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Chief Complaint</span>
                              <p className="text-foreground">{h.notes.chief_complaint}</p>
                            </div>
                          )}
                          
                          {(h.diagnoses?.length > 0 || h.treatments?.length > 0) && <div className="h-px bg-border/60 w-full" />}
                          
                          <div className="grid grid-cols-2 gap-4">
                            {h.diagnoses?.length > 0 && (
                              <div className="text-sm">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Diagnoses</span>
                                <ul className="list-disc list-inside text-foreground space-y-1">
                                  {h.diagnoses.map((d: any, idx: number) => <li key={idx}>{d.description}</li>)}
                                </ul>
                              </div>
                            )}
                            {h.treatments?.length > 0 && (
                              <div className="text-sm">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">Treatments</span>
                                <ul className="list-disc list-inside text-foreground space-y-1">
                                  {h.treatments.map((t: any, idx: number) => <li key={idx}>{t.name}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        )}
      </div>
      {canBill && showContinueToPayment && (
        <QuickBillingDialog
          appointmentId={enc.appointment_id}
          serviceDescription={appointment?.services?.name ?? "Veterinary Consultation"}
          suggestedAmount={appointment?.services?.price_from ? Number(appointment.services.price_from) : 0}
          open={isBillingOpen}
          onOpenChange={setIsBillingOpen}
        />
      )}
      <ConfirmationDialog
        open={isSignDialogOpen}
        onOpenChange={setIsSignDialogOpen}
        title="Sign & Lock Record"
        description="Are you sure you want to sign this encounter? Once signed, it cannot be modified directly."
        confirmLabel="Sign Record"
        isPending={isSaving}
        onConfirm={handleSignRecord}
      />
    </div>
  );
}
