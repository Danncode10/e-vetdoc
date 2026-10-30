# E-VetDoc

Web-based veterinary clinic management system for one clinic: role-based accounts with clinic
approval, online booking with instant confirmation and a booking limit, SOAP medical records,
VAT billing with receipts, and a full audit log.

- **Everything about the system (features, roles, architecture, data model, rules):** [`OVERALL.md`](OVERALL.md)
- Revision plans, audit report and manual test guides: [`docs/revisions/`](docs/revisions/)

## Run locally

```bash
pnpm install
cp .env.example .env.local   # fill in Supabase, SMTP and Turnstile values
pnpm dev                     # http://localhost:3000
```

Database changes live in `supabase/migrations/`; apply them with `supabase link --project-ref <ref>`
then `supabase db push`. Tests: `npx playwright test` (uses the `TEST_*` accounts in `.env.local`).
