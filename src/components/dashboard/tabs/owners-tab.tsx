"use client";

import * as React from "react";
import {
  Search,
  Users,
  Mail,
  Phone,
  PawPrint,
  ExternalLink,
  X,
  CalendarDays,
  Calendar,
  Clock,
  Stethoscope,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { listOwnerRegistry } from "@/services/pets";
import type { UserRole } from "@/lib/dashboard-features";

type OwnerRecord = Awaited<ReturnType<typeof listOwnerRegistry>>[number];

function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim()) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "OW";
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

const STATUS_BADGE_STYLE: Record<string, string> = {
  booked: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300",
  diagnosed: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300",
  completed: "bg-green-100 text-green-900 border-green-300 dark:bg-green-950/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/40 dark:text-red-300",
};

export function OwnersTab({ role }: { role: UserRole }) {
  const router = useRouter();
  const [owners, setOwners] = React.useState<any[]>([]);
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const PAGE_SIZE = 6;
  const isClinicRole = role === "admin" || role === "staff" || role === "veterinarian";

  React.useEffect(() => {
    const loadOwners = async () => {
      try {
        const records = await listOwnerRegistry();
        setOwners(records);
        setError(null);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "We could not load the owner registry.");
      } finally {
        setIsLoading(false);
      }
    };

    if (isClinicRole) void loadOwners();
  }, [isClinicRole]);

  // Reset page when query changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  if (!isClinicRole) return null;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredOwners = owners.filter((owner) => {
    const ownerText = `${owner.full_name ?? ""} ${owner.email ?? ""} ${owner.phone ?? ""}`.toLowerCase();
    const petText = (owner.pet_owners ?? [])
      .map((po: any) => po.pets?.name ?? "")
      .join(" ")
      .toLowerCase();
    const apptText = (owner.appointments ?? [])
      .map((ap: any) => `${ap.services?.name ?? ""} ${ap.pets?.name ?? ""}`)
      .join(" ")
      .toLowerCase();

    return ownerText.includes(normalizedQuery) || petText.includes(normalizedQuery) || apptText.includes(normalizedQuery);
  });

  const totalItems = filteredOwners.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedOwners = filteredOwners.slice((validCurrentPage - 1) * PAGE_SIZE, validCurrentPage * PAGE_SIZE);

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Owner Directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lookup pet owner accounts, access patient records, and view appointment history.
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by owner name, email, phone, pet name, or service…"
          className="min-h-12 w-full rounded-xl border border-input bg-card pl-10 pr-10 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground rounded-md"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Owners Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : filteredOwners.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground mb-3" strokeWidth={1.5} />
          <p className="font-semibold text-foreground">
            {query ? "No owner profiles match that search." : "No owner profiles found."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {query
              ? "Try searching by a different name, email address, or phone number."
              : "Owner accounts will appear here once registered."}
          </p>
          {query && (
            <Button variant="outline" size="sm" onClick={() => setQuery("")} className="mt-4">
              Clear Search
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {paginatedOwners.map((owner) => {
              const initials = getInitials(owner.full_name, owner.email);
              const petCount = owner.pet_owners?.length ?? 0;
              const apptCount = owner.appointments?.length ?? 0;

              // Find latest/next active appointment
              const activeAppt = owner.appointments?.find((a: any) => ["booked"].includes(a.status)) || owner.appointments?.[0];

              return (
                <div
                  key={owner.id}
                  className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-md"
                >
                  <div className="p-5 flex-1 space-y-4">
                    {/* Header with Avatar & Badges */}
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-base border border-primary/20">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-base font-bold text-foreground truncate leading-tight">
                            {owner.full_name || "Owner Profile"}
                          </h3>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground border border-border/50">
                              <PawPrint className="w-3 h-3 text-primary" />
                              {petCount} {petCount === 1 ? "Pet" : "Pets"}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary border border-primary/20">
                              <CalendarDays className="w-3 h-3" />
                              {apptCount} {apptCount === 1 ? "Visit" : "Visits"}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1 text-xs text-muted-foreground pt-1">
                          {owner.email && (
                            <div className="flex items-center gap-1.5 truncate">
                              <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{owner.email}</span>
                            </div>
                          )}
                          {owner.phone && (
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                              <span>{owner.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Appointment Information Preview */}
                    <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px] flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-primary" /> Appointment Record
                        </span>
                        {activeAppt && (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.2 text-[10px] font-semibold ${STATUS_BADGE_STYLE[activeAppt.status] || "bg-muted text-muted-foreground"}`}>
                            {activeAppt.status}
                          </span>
                        )}
                      </div>

                      {activeAppt ? (
                        <div className="grid grid-cols-2 gap-2 text-foreground pt-1">
                          <div>
                            <p className="text-muted-foreground text-[10px]">Service & Patient</p>
                            <p className="font-semibold truncate">{activeAppt.services?.name || "Visit"}</p>
                            {activeAppt.pets?.name && (
                              <p className="text-[10px] text-muted-foreground truncate">for {activeAppt.pets.name}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-muted-foreground text-[10px]">Date / Time</p>
                            <p className="font-semibold truncate">
                              {activeAppt.scheduled_start ? fmtDate(activeAppt.scheduled_start) : activeAppt.preferred_date || "Date TBD"}
                            </p>
                            {activeAppt.scheduled_start && (
                              <p className="text-[10px] text-muted-foreground truncate">{fmtTime(activeAppt.scheduled_start)}</p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground italic text-[11px] py-0.5">No appointment history on file.</p>
                      )}
                    </div>
                  </div>

                  {/* Footer Link */}
                  <div className="border-t border-border px-5 py-3 bg-muted/20">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 text-xs h-9"
                      onClick={() => router.push(`/user/${owner.id}`)}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Owner Profile & Appointment Records
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{(validCurrentPage - 1) * PAGE_SIZE + 1}</span> to{" "}
                <span className="font-semibold text-foreground">{Math.min(validCurrentPage * PAGE_SIZE, totalItems)}</span> of{" "}
                <span className="font-semibold text-foreground">{totalItems}</span> owners
              </p>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={validCurrentPage === 1}
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Previous
                </Button>

                <div className="flex items-center gap-1 px-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={`h-7 w-7 rounded-lg text-xs font-medium transition-all ${
                        validCurrentPage === p
                          ? "bg-primary text-primary-foreground font-bold shadow-xs"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={validCurrentPage === totalPages}
                  className="h-8 px-2.5 text-xs gap-1"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

