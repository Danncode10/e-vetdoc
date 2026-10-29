import { redirect } from "next/navigation";
import { Clock, ShieldX, UserX } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestedRoleForm } from "@/components/auth/requested-role-form";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { getSessionProfile } from "@/services/authorization";
import { ACCOUNT_STATE_MESSAGES, getAccountState } from "@/lib/account-status";
import { roleLabel } from "@/lib/roles";

export const metadata = {
  title: "Account status",
  robots: { index: false, follow: false },
};

const STATE_ICONS = {
  pending: Clock,
  rejected: ShieldX,
  deactivated: UserX,
};

export default async function AccountStatusPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  const { user, profile } = session;
  const state = getAccountState(profile);
  if (state === "approved") redirect("/dashboard");

  const { title, message } = ACCOUNT_STATE_MESSAGES[state];
  const Icon = STATE_ICONS[state];
  const needsRole = state === "pending" && !profile.requested_role;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-8 sm:px-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <CardTitle>{needsRole ? "One more step" : title}</CardTitle>
          <CardDescription>
            {needsRole ? "Tell the clinic what you are registering as. Your account stays pending until an Admin or Staff member approves it." : message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm">
            <p className="text-muted-foreground">Signed in as</p>
            <p className="font-semibold text-foreground break-all">{user.email}</p>
            {profile.requested_role && (
              <p className="mt-2 text-muted-foreground">
                Requested role: <span className="font-semibold text-foreground">{roleLabel(profile.requested_role)}</span>
              </p>
            )}
          </div>
          {needsRole && <RequestedRoleForm />}
        </CardContent>
        <CardFooter>
          <SignOutButton />
        </CardFooter>
      </Card>
    </main>
  );
}
