import type { Metadata } from "next";
import { getSessionProfile, isAccountApproved, isOwnerProfileComplete } from "@/services/authorization";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();

  if (!session?.user) {
    redirect("/login");
  }

  const { user, profile } = session;

  if (!isAccountApproved(profile)) {
    redirect("/account-status");
  }

  if (profile.role === "owner" && !isOwnerProfileComplete(profile)) {
    redirect("/onboarding");
  }

  return (
    <DashboardShell user={user} profile={profile}>
      {children}
    </DashboardShell>
  );
}
