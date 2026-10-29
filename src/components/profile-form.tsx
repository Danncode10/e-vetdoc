"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { completeOwnerProfile, updateProfile } from "@/services/users";
import { User, Phone, MapPin, ShieldAlert, Loader2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Database } from "@/types/supabase";
import { roleLabel } from "@/lib/roles";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// Reusable input class — semantic tokens only, consistent height
const inputClass =
  "w-full bg-secondary border border-border rounded-2xl py-4 pl-12 pr-5 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all";

export function ProfileForm({
  profile,
  onProfileUpdated,
  onboarding = false,
}: {
  profile: Profile;
  onProfileUpdated?: (profile: Profile) => void;
  onboarding?: boolean;
}) {
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const [formData, setFormData] = useState({
    full_name: profile.full_name || "",
    phone: profile.phone || "",
    address: profile.address || "",
    emergency_contact_name: profile.emergency_contact_name || "",
    emergency_contact_phone: profile.emergency_contact_phone || "",
  });

  const mutation = useMutation({
    mutationFn: (data: typeof formData) =>
      onboarding ? completeOwnerProfile(data) : updateProfile(data),
    onError: (err: Error) => {
      toast.error(err.message || "Failed to update profile. Rate limit exceeded.");
    },
    onSuccess: (updatedProfile) => {
      onProfileUpdated?.(updatedProfile);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      toast.success("Profile updated successfully!");
      if (onboarding) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      router.refresh();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div className="w-full max-w-md mx-auto md:max-w-2xl">
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 mb-10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-2xl font-black text-foreground tracking-tighter uppercase italic leading-tight">
            {onboarding ? "Complete your profile" : "Profile Settings"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1 font-semibold italic">
            {onboarding
              ? "Add your contact details so your clinic can safely reach you about your pet's care."
              : "Manage your contact and emergency details."}
          </p>
        </div>
        <Badge
          variant={profile.role === "admin" ? "default" : "secondary"}
          className="self-start sm:self-auto uppercase tracking-widest px-3 py-1 text-[10px] font-black shrink-0"
        >
          {roleLabel(profile.role ?? "owner")}
        </Badge>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Full Name */}
          <div className="space-y-2">
            <label htmlFor="full_name" className="text-[10px] font-mono font-black uppercase tracking-widest text-muted-foreground px-1">
              Full Name {onboarding && <span className="text-destructive">*</span>}
            </label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                id="full_name"
                type="text"
                required={onboarding}
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Jane Doe"
                className={inputClass}
              />
            </div>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label htmlFor="phone" className="text-[10px] font-mono font-black uppercase tracking-widest text-muted-foreground px-1">
              Phone {onboarding && <span className="text-destructive">*</span>}
            </label>
            <div className="relative group">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                id="phone"
                type="tel"
                required={onboarding}
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+1 555 123 4567"
                className={inputClass}
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label htmlFor="address" className="text-[10px] font-mono font-black uppercase tracking-widest text-muted-foreground px-1">
              Address {onboarding && <span className="text-destructive">*</span>}
            </label>
            <div className="relative group">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                id="address"
                type="text"
                required={onboarding}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="123 Clinic St, City"
                className={inputClass}
              />
            </div>
          </div>

          {/* Emergency Contact Name */}
          <div className="space-y-2">
            <label htmlFor="emergency_contact_name" className="text-[10px] font-mono font-black uppercase tracking-widest text-muted-foreground px-1">
              Emergency Contact Name
            </label>
            <div className="relative group">
              <ShieldAlert className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                id="emergency_contact_name"
                type="text"
                value={formData.emergency_contact_name}
                onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                placeholder="John Doe"
                className={inputClass}
              />
            </div>
          </div>

          {/* Emergency Contact Phone */}
          <div className="space-y-2">
            <label htmlFor="emergency_contact_phone" className="text-[10px] font-mono font-black uppercase tracking-widest text-muted-foreground px-1">
              Emergency Contact Phone
            </label>
            <div className="relative group">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                id="emergency_contact_phone"
                type="tel"
                value={formData.emergency_contact_phone}
                onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                placeholder="+1 555 987 6543"
                className={inputClass}
              />
            </div>
          </div>

        </div>

        {/* ── Footer / Submit ── */}
        <div className="pt-6 border-t border-border mt-4 flex flex-col gap-4">
          <p className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
            {onboarding ? "Fields marked * are required" : "Syncing with your secure profile"}
          </p>
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="w-full min-h-14 font-black uppercase tracking-widest rounded-2xl active:scale-[0.98] transition-all gap-2 group"
          >
            {mutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : success ? (
              <><CheckCircle2 className="w-5 h-5" /> Saved</>
            ) : (
              <><CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" /> {onboarding ? "Continue to dashboard" : "Save Profile"}</>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
