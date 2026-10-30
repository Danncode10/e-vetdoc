import Link from "next/link";
import { CalendarPlus, MapPin, Navigation } from "lucide-react";
import { CLINIC } from "./clinic-info";

export function Contact({ isAuthed }: { isAuthed: boolean }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CLINIC.mapQuery)}`;
  const embedUrl = `https://www.google.com/maps?q=${encodeURIComponent(CLINIC.mapQuery)}&output=embed`;

  return (
    <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24 bg-muted/40 py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Contact us</p>
          <h2 id="contact-heading" className="mt-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Visit {CLINIC.name}
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Drop by the clinic or book a visit online. We&apos;ll confirm your appointment in the app.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-5">
          <div className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2">
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{CLINIC.name}</h3>
              <address data-testid="clinic-address" className="mt-2 text-sm not-italic text-muted-foreground">
                {CLINIC.addressLines.map((line) => (
                  <span key={line} className="block">{line}</span>
                ))}
              </address>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Navigation className="h-4 w-4" /> Get directions
              </a>
              <Link
                href={isAuthed ? "/dashboard/appointments/new" : "/login"}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CalendarPlus className="h-4 w-4" /> Book an appointment
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:col-span-3">
            <iframe
              title={`Map to ${CLINIC.name}`}
              src={embedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full border-0 sm:h-96 lg:h-full lg:min-h-[22rem]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
