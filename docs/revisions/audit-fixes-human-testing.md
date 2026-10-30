# Audit fixes — human testing guide

Use this to check the audit fixes by hand (report: `docs/revisions/audit-report-oct-30.md`).
Automated tests cover the same items in `tests/19-audit-fixes.spec.ts`.

## Before you start

- Apply the database migrations first: `supabase link --project-ref <ref>` then `supabase db push`
  (includes `20261030130000_audit_fixes.sql`). Read the output: if it prints a **NOTICE** about
  duplicate encounters or schedules, remove the duplicates and run it again.
- Accounts: one **Admin**, one **Staff**, one **Vet**, two **Owners** (logins in your
  `.env.local`, never in the repo). Use two browser windows (one private) to be two people.
- Have one future **schedule** (e.g. 9:00–17:00, capacity 3) and one owner pet ready.

## Progress checklist

- [ ] A. Roles: what each role can see
- [ ] B. Schedules (H3, M9)
- [ ] C. Encounters (H4)
- [ ] D. Billing (M2, M3, M8)
- [ ] E. Owner screens (M1, M4)
- [ ] F. Clinic overview & lists (M5, M7)
- [ ] G. Security spot-checks (H1, H2) — optional, needs the browser console

---

## A. Roles — what each role sees

| # | Sign in as | Expected sidebar |
|---|-----------|------------------|
| A.1 | Admin | Overview, Pets, Owners, Appointments, Schedule, Billing, Approvals, Team, Logs |
| A.2 | Staff | Same as Admin **without Team** |
| A.3 | Vet | Overview, Pets, Owners, Appointments, Schedule — **no Billing, no Logs** |
| A.4 | Owner | Overview, Pets, Appointments, Billing |

## B. Schedules — Admin/Staff manage, vets view (H3, M9)

| # | Step | Expected |
|---|------|----------|
| B.1 | Vet → **Schedule** | Calendar shows the clinic days. Top right says **"View only — Admin or Staff manage the clinic schedule."** No **Add Schedule** button. Clicking a day shows times and capacity but **no Edit/Delete**. Double-clicking a day does nothing. |
| B.2 | Vet → type `/dashboard/schedules/new` in the address bar | Sent back to the dashboard. |
| B.3 | Staff → **Schedule** → **Add Schedule** → a date, 9:00–17:00, capacity 3 | Saved. |
| B.4 | Staff → add **the same date and start time** again | Error: "A schedule already exists for that date and start time." |
| B.5 | Staff → try end time **before** start time, or capacity **0** | Refused with a clear message. |

## C. Encounters (H4)

| # | Step | Expected |
|---|------|----------|
| C.1 | Vet → Appointments → open a **booked** appointment | **Start Encounter** button is shown. |
| C.2 | Click **Start Encounter** twice quickly (or in two tabs) | Only **one** encounter is created; both open the same one. |
| C.3 | Staff cancels another booked appointment; vet opens it | **No Start Encounter** button. |
| C.4 | Finish and **Sign** the encounter from C.1 | Appointment becomes **Diagnosed**. |
| C.5 | In the encounter, add 2 prescriptions → **Save draft** → reload | Both prescriptions are still there. |

## D. Billing (M2, M3, M8)

| # | Step | Expected |
|---|------|----------|
| D.1 | Vet → open the Diagnosed appointment from C.4 | **No "Charge & Mark Paid"** button. Typing `/dashboard/billing` sends the vet back to the dashboard. |
| D.2 | Staff → same appointment → **Charge & Mark Paid** → amount 500, VAT on, Cash | Success with a receipt number (RCPT-…). Total = 560.00. Appointment shows **Paid**; the button disappears. |
| D.3 | Staff → refresh an old tab that still shows the button and try to charge again | Error: "This appointment is already paid." No second invoice in **Billing**. |
| D.4 | Staff → **Billing → New invoice** for an owner → add an item → finalize → **Record payment** | Invoice becomes **Paid**. (Invoices made here are not linked to a visit, so no appointment changes. To bill a visit, use **Charge & Mark Paid** on the appointment. If an invoice *is* linked to a visit's encounter, paying it now also marks that visit Paid — covered by the automated test M3.) |
| D.5 | Owner → **Billing** | Sees the paid invoices and can print the receipt. |

## E. Owner screens (M1, M4)

| # | Step | Expected |
|---|------|----------|
| E.1 | Owner with only past visits → **Overview** | "No upcoming visits scheduled" (past Diagnosed/Paid visits are not listed as upcoming). |
| E.2 | Owner books a future visit → **Overview** | The new visit appears with status **booked**. |
| E.3 | Owner opens a signed visit record / prescription | The vet's **name** is shown (as before). |
| E.4 | (Privacy) Owner screens never show staff phone numbers or addresses | — |

## F. Clinic overview & lists (M5, M7)

| # | Step | Expected |
|---|------|----------|
| F.1 | Admin → **Overview** → "Pet Owners" number | Same as **Owners → All owners** count. |
| F.2 | "Active appointments" | Counts booked + diagnosed (not yet paid) visits only — paid/cancelled visits are not counted. |
| F.3 | Staff → **Overview** | Shows the **Audit Logs** quick card (staff have Logs access). |
| F.4 | Admin → **Pets** | All pets are listed (no cut-off at 100). |

## G. Security spot-checks (optional, technical)

These prove the database itself refuses tampering, even outside the website. In the browser
console on the site, signed in as an **Owner**, the Supabase client is not exposed, so the
simplest way is to trust the automated tests (`tests/19` H1/H2/M1/M2) — they sign in as real test
users and try each forbidden write directly against the database:

- H1: owner inserts an appointment directly → **refused** (must use the booking form).
- H2: owner writes appointment history → **refused**.
- M1: owner reads staff phone/address → **nothing returned**; names only via the safe function.
- M2: vet creates an invoice → **refused**.

## If something fails

Note the account, step number and a screenshot; check the browser console and Vercel logs.
