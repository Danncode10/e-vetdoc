import { siteConfig } from "@/lib/config";

const productLinks = [
  { label: "Appointments", href: "/#how-it-works" },
  { label: "Pet records", href: "/#features" },
  { label: "Invoices", href: "/#features" },
  { label: "Owner portal", href: "/#pricing" },
  { label: "About us", href: "/#about" },
  { label: "Contact us", href: "/#contact" },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.04] bg-background overflow-hidden">
      {/* Subtle background grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-grid-sm opacity-30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grid-fade-overlay-v"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid gap-10 sm:grid-cols-2">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex h-7 w-7 items-center justify-center rounded-lg bg-primary shadow-sm">
                <span className="text-[11px] font-black text-primary-foreground">
                  D
                </span>
              </div>
              <span className="text-sm font-semibold tracking-tight text-foreground">
                {siteConfig.name}
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground max-w-xs leading-relaxed">
              {siteConfig.description}
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-[10px] font-semibold text-foreground/60 mb-4 uppercase tracking-[0.2em]">
              Product
            </h4>
            <ul className="space-y-2.5">
              {productLinks.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    className="text-[13px] text-muted-foreground hover:text-foreground transition-colors duration-300"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[12px] text-muted-foreground/70 font-mono">
            © {new Date().getFullYear()} {siteConfig.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-3">
            <a
              href={siteConfig.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View the E-VetDoc source repository on GitHub"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02] text-muted-foreground hover:text-foreground hover:bg-white/[0.05] transition-all duration-300"
            >
              <svg
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
