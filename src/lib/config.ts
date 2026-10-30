export const siteConfig = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "E-VetDoc",
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || "https://github.com/Danncode10/e-vetdoc",
  description: "E-VetDoc gives pet owners, veterinarians, and clinic staff one secure place to manage appointments, pet records, care updates, invoices, and receipts.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
} as const;
