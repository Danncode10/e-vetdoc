import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Transactional emails read their HTML templates from disk at runtime (src/services/email.ts).
  // Include them in every server bundle so invoice/receipt/approval emails work on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./docs/supabase/email-templates/**/*"],
  },
};

export default nextConfig;
