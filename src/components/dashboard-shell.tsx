"use client";

import * as React from "react";
import {
  LayoutDashboard,
  PawPrint,
  Users,
  CalendarDays,
  Settings,
  LogOut,
  Home,
  PanelLeftClose,
  PanelLeft,
  X,
  Menu,
  ShieldCheck,
  Receipt,
  ScrollText,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { siteConfig } from "@/lib/config";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getEnabledTabs, isFeatureEnabled, type DashboardTabId } from "@/lib/dashboard-features";
import { roleLabel } from "@/lib/roles";
import { OverviewTab } from "@/components/dashboard/tabs/overview-tab";
import { PetsTab } from "@/components/dashboard/tabs/pets-tab";
import { OwnersTab } from "@/components/dashboard/tabs/owners-tab";
import { AppointmentsTab } from "@/components/dashboard/tabs/appointments-tab";
import { SettingsTab } from "@/components/dashboard/tabs/settings-tab";
import { SchedulesTab } from "@/app/dashboard/schedules/page";
import { LogsTab } from "@/components/dashboard/tabs/logs-tab";
import { OwnerBillingTab } from "@/components/dashboard/tabs/owner-billing-tab";
import { ApprovalsTab } from "@/components/dashboard/tabs/approvals-tab";

const ICONS: Record<DashboardTabId | "schedules", LucideIcon> = {
  overview: LayoutDashboard,
  pets: PawPrint,
  owners: Users,
  appointments: CalendarDays,
  schedules: CalendarDays, // Schedules tab
  billing: Receipt,
  approvals: UserCheck,
  team: ShieldCheck,
  logs: ScrollText,
  settings: Settings,
};

/** Always-visible indicator of the signed-in user's role. */
function RoleBadge({ label, testId }: { label: string; testId: string }) {
  return (
    <span
      data-testid={testId}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary"
    >
      <ShieldCheck className="w-3 h-3" />
      {label}
    </span>
  );
}

interface DashboardShellProps {
  user: SupabaseUser;
  profile: Database["public"]["Tables"]["profiles"]["Row"];
  children: React.ReactNode;
}

export function DashboardShell({ user, profile, children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentProfile, setCurrentProfile] = React.useState(profile);
  const userRole = currentProfile.role;
  const enabledTabs = React.useMemo(() => getEnabledTabs(userRole), [userRole]);
  const validIds = React.useMemo(() => new Set(enabledTabs.map((t) => t.id)), [enabledTabs]);

  const initialTab = (() => {
    const fromQuery = searchParams.get("tab") as DashboardTabId | null;
    return fromQuery && fromQuery !== "team" && validIds.has(fromQuery) ? fromQuery : "overview";
  })();

  const [activeTab, setActiveTabLocal] = React.useState<DashboardTabId>(initialTab);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);

  const displayName = currentProfile.full_name || user.email?.split("@")[0] || "there";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();
  const currentRoleLabel = roleLabel(userRole);

  React.useEffect(() => {
    if (userRole === "admin") {
      router.prefetch("/dashboard/team");
    }
  }, [router, userRole]);

  const setTab = React.useCallback((tab: DashboardTabId) => {
    if (!validIds.has(tab)) return;

    if (tab === "team") {
      router.push("/dashboard/team");
      setSidebarOpen(false);
      return;
    }

    if (tab === "billing" && userRole !== "owner") {
      router.push("/dashboard/billing");
      setSidebarOpen(false);
      return;
    }

    setActiveTabLocal(tab);
    router.push(`/dashboard?tab=${tab}`, { scroll: false });
    setSidebarOpen(false);
  }, [router, validIds]);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Full page load so no cached signed-in route can bounce the user back to /dashboard.
    window.location.assign("/login");
  };

  const mainTabs = enabledTabs.filter((t) => t.id !== "settings");
  const isPetRecord = pathname.startsWith("/user/") && pathname.includes("/pet/");
  const isOwnerRecord = pathname.startsWith("/user/") && !isPetRecord;
  const activeTabId = pathname === "/dashboard/team" ? "team" : pathname.startsWith("/dashboard/pets") || isPetRecord ? "pets" : pathname.startsWith("/dashboard/appointments") ? "appointments" : isOwnerRecord ? "owners" : activeTab;
  const activeLabel = pathname === "/dashboard/pets/new" ? "Add pet" : pathname === "/dashboard/appointments/new" ? "New appointment" : isPetRecord ? "Pet record" : isOwnerRecord ? "Owner record" : enabledTabs.find((t) => t.id === activeTabId)?.label ?? "Overview";

  return (
    <div className="h-screen bg-background flex overflow-hidden">

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-card border-r border-border flex flex-col
        transition-all duration-200 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        ${collapsed ? "md:w-14" : "md:w-56"}
        w-56 md:translate-x-0 md:relative md:z-auto md:h-full md:flex-shrink-0
      `}>

        <div className="h-14 flex items-center justify-between px-3 border-b border-border shrink-0">
          <Link href="/" className={`flex items-center gap-2.5 overflow-hidden ${collapsed ? "md:justify-center md:w-full" : ""}`}>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 shadow-[0_2px_8px_rgba(220,38,38,0.4)] shrink-0">
              <span className="text-[11px] font-black text-white">{siteConfig.name.charAt(0)}</span>
            </div>
            <span className={`text-sm font-bold tracking-tight text-foreground whitespace-nowrap ${collapsed ? "md:hidden" : ""}`}>
              {siteConfig.name}
            </span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 text-muted-foreground hover:text-foreground rounded-md">
            <X className="w-4 h-4" />
          </button>
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="hidden md:flex p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <button onClick={() => setCollapsed(false)} className="hidden md:flex items-center justify-center h-10 w-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {!collapsed && (
            <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Main
            </p>
          )}
          {mainTabs.map(({ id, label }) => {
            const Icon = ICONS[id];
            const isActive = activeTabId === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                onMouseEnter={() => id === "team" && router.prefetch("/dashboard/team")}
                onFocus={() => id === "team" && router.prefetch("/dashboard/team")}
                title={collapsed ? label : undefined}
                className={`w-full flex items-center gap-3 rounded-lg text-[13px] transition-colors
                  ${collapsed ? "md:justify-center px-0 py-2.5" : "px-3 py-2"}
                  ${isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                <span className={collapsed ? "md:hidden" : ""}>{label}</span>
              </button>
            );
          })}
          {isFeatureEnabled("schedules", userRole) && (
            <button
              key="schedules"
              onClick={() => setTab("schedules")}
              onMouseEnter={() => router.prefetch("/dashboard/schedules")}
              onFocus={() => router.prefetch("/dashboard/schedules")}
              title="Schedules"
              className={`w-full flex items-center gap-3 rounded-lg text-[13px] transition-colors
                ${collapsed ? "md:justify-center px-0 py-2.5" : "px-3 py-2"}
                ${activeTabId === "schedules"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
            >
              <CalendarDays className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              <span className={collapsed ? "md:hidden" : ""}>Schedules</span>
            </button>
          )}
        </nav>

        <div className="shrink-0 border-t border-border p-2 space-y-0.5">
          {isFeatureEnabled("always", userRole) && (
            <button
              onClick={() => setTab("settings")}
              title={collapsed ? "Settings" : undefined}
              className={`w-full flex items-center gap-3 rounded-lg text-[13px] transition-colors
                ${collapsed ? "md:justify-center px-0 py-2.5" : "px-3 py-2"}
                ${activeTab === "settings" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            >
              <Settings className="w-4 h-4 shrink-0" strokeWidth={1.5} />
              <span className={collapsed ? "md:hidden" : ""}>Settings</span>
            </button>
          )}

          <div className="relative">
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 w-52 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-[12px] font-bold text-foreground truncate">{displayName}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{user.email}</p>
                    <div className="mt-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-[10px] font-medium text-primary">
                        {currentRoleLabel}
                      </span>
                    </div>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => { router.push("/"); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Home className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                      Back to Home
                    </button>
                    <button
                      onClick={() => { handleSignOut(); setUserMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="w-4 h-4 shrink-0" strokeWidth={1.5} />
                      Sign Out
                    </button>
                  </div>
                </div>
              </>
            )}
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              title={collapsed ? `${displayName} · ${currentRoleLabel}` : undefined}
              className={`w-full flex items-center gap-2.5 rounded-lg hover:bg-muted transition-colors
                ${collapsed ? "md:justify-center px-0 py-2" : "px-3 py-2"}`}
            >
              <Avatar className="h-7 w-7 border border-border shrink-0">
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary/70 text-white font-black text-[10px]">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className={`flex-1 min-w-0 text-left ${collapsed ? "md:hidden" : ""}`}>
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-[12px] font-semibold text-foreground truncate">{displayName}</p>
                  <RoleBadge label={currentRoleLabel} testId="sidebar-role-badge" />
                </div>
                <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
              </div>
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="h-14 flex items-center justify-between px-5 border-b border-border bg-background shrink-0 print:hidden">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-[14px] font-medium text-foreground hidden md:block">{activeLabel}</span>
          <div className="flex-1 md:hidden" />
          <div className="md:hidden">
            <RoleBadge label={currentRoleLabel} testId="header-role-badge" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 md:p-8 print:p-0">
          {pathname === "/dashboard" ? (
            <>
              {activeTab === "overview" && <OverviewTab displayName={displayName} setTab={setTab} role={userRole} />}
              {activeTab === "pets" && <PetsTab role={userRole} />}
              {activeTab === "owners" && <OwnersTab role={userRole} />}
              {activeTab === "appointments" && currentProfile ? (
                <AppointmentsTab role={userRole} userId={currentProfile.id} />
              ) : null}
              {activeTab === "settings" && <SettingsTab profile={currentProfile} onProfileUpdated={setCurrentProfile} />}
              {activeTab === "schedules" && <SchedulesTab role={userRole} />}
              {activeTab === "logs" && <LogsTab />}
              {activeTab === "approvals" && <ApprovalsTab />}
              {activeTab === "billing" && <OwnerBillingTab />}
            </>
          ) : children}
        </main>
      </div>
    </div>
  );
}
