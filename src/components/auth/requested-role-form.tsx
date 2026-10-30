"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { chooseRequestedRole } from "@/services/approvals";
import { REGISTRATION_ROLES, type UserRole } from "@/lib/roles";

/** Shown to pending accounts that have not said which role they are registering as. */
export function RequestedRoleForm() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("owner");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await chooseRequestedRole({ role });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Register as</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REGISTRATION_ROLES.map((option) => (
            <label
              key={option.value}
              htmlFor={`account-role-${option.value}`}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                id={`account-role-${option.value}`}
                type="radio"
                name="requested_role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="mt-0.5 h-4 w-4 accent-primary focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span>
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" className="min-h-12 w-full sm:w-auto" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Send for approval
      </Button>
    </form>
  );
}
