import { HeartPulse, MapPin, Users } from "lucide-react";
import { CLINIC, DEVELOPERS } from "./clinic-info";

function initials(name: string) {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(" ").filter((p) => p.length > 1);
  return `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}`.toUpperCase();
}

export function About() {
  return (
    <section id="about" aria-labelledby="about-heading" className="scroll-mt-24 bg-background py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">About us</p>
          <h2 id="about-heading" className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built for {CLINIC.name}
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            E-VetDoc brings the clinic&apos;s appointments, medical records and billing into one secure place, so pet
            owners and the clinic team always see the same, up-to-date record of every pet&apos;s care.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {/* Clinic card */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HeartPulse className="h-6 w-6" />
            </div>
            <h3 className="mt-5 text-lg font-semibold text-foreground">The clinic</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {CLINIC.name} provides consultations, vaccinations, deworming, grooming and more for the pets of
              Bayombong and nearby towns.
            </p>
            <div className="mt-5 flex items-start gap-2 text-sm text-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <address className="not-italic">
                {CLINIC.addressLines.map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </address>
            </div>
          </div>

          {/* Team */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">The developers</h3>
                <p className="text-sm text-muted-foreground">The team behind E-VetDoc</p>
              </div>
            </div>
            <ul data-testid="developer-list" className="mt-6 grid gap-3 sm:grid-cols-2">
              {DEVELOPERS.map((dev) => (
                <li key={dev.name} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
                  <span
                    aria-hidden
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  >
                    {initials(dev.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{dev.name}</p>
                    <span className="mt-0.5 inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {dev.program}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
