"use client";

import * as React from "react";
import {
  ScrollText,
  Search,
  Calendar,
  Stethoscope,
  Receipt,
  ShieldCheck,
  Clock,
  RefreshCw,
  Activity,
  Layers,
  X,
  ChevronLeft,
  ChevronRight,
  CalendarRange,
  UserCog,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getClinicActivityLogs, type ClinicActivityLog, type LogCategory } from "@/services/audit-logs";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateTime(isoStr: string): string {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const month = MONTHS[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${month} ${day}, ${year} at ${hours}:${minutes} ${ampm}`;
}

function timeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / (1000 * 60));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type DatePreset = "all" | "today" | "7d" | "30d";

const CATEGORIES = [
  { id: "all", label: "All Activity", icon: Layers },
  { id: "appointment", label: "Appointments", icon: Calendar },
  { id: "clinical", label: "Clinical & EMR", icon: Stethoscope },
  { id: "billing", label: "Billing & Payments", icon: Receipt },
  { id: "staff", label: "Staff & Security", icon: ShieldCheck },
  { id: "account", label: "Account Changes", icon: UserCog },
] as const;

const BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  appointment: {
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
    border: "border-blue-500/20",
  },
  clinical: {
    bg: "bg-purple-500/10 dark:bg-purple-500/20",
    text: "text-purple-600 dark:text-purple-400",
    border: "border-purple-500/20",
  },
  billing: {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20",
  },
  staff: {
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/20",
  },
  account: {
    bg: "bg-sky-500/10 dark:bg-sky-500/20",
    text: "text-sky-600 dark:text-sky-400",
    border: "border-sky-500/20",
  },
};

// Memory Cache (3 mins TTL)
let logsMemoryCache: { data: ClinicActivityLog[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000;

export function LogsTab() {
  const [logs, setLogs] = React.useState<ClinicActivityLog[]>(() => logsMemoryCache?.data ?? []);
  const [loading, setLoading] = React.useState(!logsMemoryCache?.data);
  const [refreshing, setRefreshing] = React.useState(false);

  // Filters
  const [category, setCategory] = React.useState<LogCategory>("all");
  const [search, setSearch] = React.useState("");
  const [datePreset, setDatePreset] = React.useState<DatePreset>("all");

  // Pagination
  const [currentPage, setCurrentPage] = React.useState(1);
  const pageSize = 12;

  const loadLogs = React.useCallback(async (forceBypassCache = false) => {
    const isCacheValid =
      !forceBypassCache &&
      logsMemoryCache &&
      Date.now() - logsMemoryCache.fetchedAt < CACHE_TTL_MS;

    // Show cached logs instantly, but always fetch fresh ones so new changes appear on open.
    if (isCacheValid && logsMemoryCache) {
      setLogs(logsMemoryCache.data);
      setLoading(false);
      setRefreshing(true);
    } else if (forceBypassCache) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await getClinicActivityLogs({ limit: 300 });
      logsMemoryCache = { data, fetchedAt: Date.now() };
      setLogs(data);
    } catch (err) {
      console.error("Failed to load clinic activity logs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reset pagination on filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [category, search, datePreset]);

  // Filtered logs
  const filteredLogs = React.useMemo(() => {
    let result = logs;

    if (category !== "all") {
      result = result.filter((l) => l.category === category);
    }

    const now = new Date();
    if (datePreset === "today") {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      result = result.filter((l) => new Date(l.timestamp).getTime() >= startOfToday);
    } else if (datePreset === "7d") {
      const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
      result = result.filter((l) => new Date(l.timestamp).getTime() >= sevenDaysAgo);
    } else if (datePreset === "30d") {
      const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
      result = result.filter((l) => new Date(l.timestamp).getTime() >= thirtyDaysAgo);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.description.toLowerCase().includes(q) ||
          l.actor.name.toLowerCase().includes(q) ||
          (l.target?.label && l.target.label.toLowerCase().includes(q))
      );
    }

    return result;
  }, [logs, category, search, datePreset]);

  const counts = React.useMemo(() => {
    return {
      all: logs.length,
      appointment: logs.filter((l) => l.category === "appointment").length,
      clinical: logs.filter((l) => l.category === "clinical").length,
      billing: logs.filter((l) => l.category === "billing").length,
      staff: logs.filter((l) => l.category === "staff").length,
      account: logs.filter((l) => l.category === "account").length,
    };
  }, [logs]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredLogs.length);
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ScrollText className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Clinic Audit Logs</h1>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {logs.length} events
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Real-time audit ledger of staff diagnoses, status transitions, payments, and system changes.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => loadLogs(true)}
          disabled={refreshing || loading}
          className="min-h-10 px-3.5 rounded-xl gap-2 font-semibold shadow-xs hover:bg-muted self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Control Area */}
      <div className="space-y-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = category === cat.id;
            const count = counts[cat.id];

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{cat.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dedicated Search & Timeframe Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by staff name, patient, action, or receipt #..."
              className="h-10 w-full rounded-xl border border-border bg-card pl-10 pr-9 text-xs text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 rounded-full cursor-pointer"
                aria-label="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-1.5 shrink-0 bg-card border border-border rounded-xl px-3 h-10">
            <CalendarRange className="size-3.5 text-muted-foreground shrink-0" />
            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as DatePreset)}
              aria-label="Filter by date range"
              className="bg-transparent text-xs font-semibold text-foreground outline-none cursor-pointer pr-1"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Unified Log Stream Container */}
      <Card className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <p className="text-xs font-medium text-muted-foreground">Loading activity feed...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Activity className="size-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No events recorded</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {search || datePreset !== "all"
                  ? "No activity matched your search or date criteria."
                  : "No events recorded in this category yet."}
              </p>
            </div>
            {(search || datePreset !== "all" || category !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setDatePreset("all");
                  setCategory("all");
                }}
                className="mt-1 rounded-xl text-xs cursor-pointer"
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {paginatedLogs.map((log) => {
              const badgeStyle = BADGE_STYLES[log.category] ?? BADGE_STYLES.appointment;
              const actorInitial = log.actor.name.charAt(0).toUpperCase();

              return (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 hover:bg-muted/20 transition-colors"
                >
                  {/* Left: Event Details */}
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="flex flex-col items-start gap-1 min-w-0">
                      {/* Action Pill + Target */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                        >
                          {log.action}
                        </span>
                        {log.target && (
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/90 font-mono">
                            {log.target.label}
                          </span>
                        )}
                      </div>

                      {/* Description sentence */}
                      <p className="text-xs sm:text-sm text-foreground/90 leading-snug">
                        {log.description}
                      </p>

                      {/* Actor */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                        <div className="size-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                          {actorInitial}
                        </div>
                        <span className="font-medium text-foreground text-[11px]">{log.actor.name}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] capitalize text-muted-foreground font-medium">
                          {log.actor.role || "staff"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Timestamp */}
                  <div className="flex sm:flex-col items-center sm:items-end justify-between shrink-0 sm:text-right">
                    <span className="text-xs font-bold text-foreground font-mono">{timeAgo(log.timestamp)}</span>
                    <span className="text-[11px] text-muted-foreground mt-0.5">{formatDateTime(log.timestamp)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Integrated Pagination Footer */}
        {filteredLogs.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing <span className="font-semibold text-foreground font-mono">{startIndex + 1}</span>–
              <span className="font-semibold text-foreground font-mono">{endIndex}</span> of{" "}
              <span className="font-semibold text-foreground font-mono">{filteredLogs.length}</span> events
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px]">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="h-8 px-2.5 rounded-lg text-xs cursor-pointer gap-1"
                  >
                    <ChevronLeft className="size-3.5" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="h-8 px-2.5 rounded-lg text-xs cursor-pointer gap-1"
                  >
                    Next
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
