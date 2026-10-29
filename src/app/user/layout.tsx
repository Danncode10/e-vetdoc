import { DashboardShell } from "@/components/dashboard-shell";
import { isOwnerProfileComplete, requireAuth } from "@/services/authorization";
import { redirect } from "next/navigation";

export default async function UserRecordLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireAuth();
  if (profile.role === "owner" && !isOwnerProfileComplete(profile)) redirect("/onboarding");

  return <DashboardShell user={user} profile={profile}>{children}</DashboardShell>;
}
