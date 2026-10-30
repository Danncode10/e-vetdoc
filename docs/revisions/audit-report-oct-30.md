# E-VetDoc audit report — Oct 30, 2026

Branch: `audit-fixes` (based on `bug-fixes` / PR #9, so it checks the newest code).
Scope: database security rules (RLS), database functions/triggers, server code in `src/services`,
page access guards, the main dashboard screens, and Supabase's built-in advisors.

**Status: report only — nothing is fixed yet.** Each item has a recommended fix. Items marked
**Confirmed** were reproduced against the e-vetdoc test database with real test accounts (the
test rows were deleted afterwards).

Severity: **High** = breaks a rule the client asked for or lets a user tamper with data.
**Medium** = wrong data / confusing behaviour users will notice. **Low** = cleanup, wording,
future-proofing.

## Summary

| # | Severity | Area | Problem (one line) | Confirmed |
|---|----------|------|--------------------|-----------|
| H1 | High | Booking | An owner can skip the booking limit by inserting an appointment directly through the API | ✅ |
| H2 | High | Logs | Any signed-in user can write fake appointment-history entries, which show up in Logs | ✅ |
| H3 | High | Schedules | Vets can create, edit and delete clinic schedules (should be Admin/Staff only) | ✅ |
| H4 | High | Clinical | "Start Encounter" works on cancelled/no-show appointments; signing turns them into "Diagnosed". Duplicate encounters per appointment are possible | code |
| M1 | Medium | Privacy | Owners can read Admin/Vet/Staff phone numbers and home addresses | ✅ |
| M2 | Medium | Billing | Vets can create invoices and record payments | ✅ |
| M3 | Medium | Billing | Paying from the Billing page does not mark the appointment "Paid" (only "Charge & Mark Paid" does) | code |
| M4 | Medium | Owner overview | "Upcoming appointments" lists old Diagnosed/Paid visits oldest-first, so real upcoming visits can be hidden | code |
| M5 | Medium | Pets tab | Clinic sees at most 100 pets (same kind of bug as the Owners tab) | code |
| M6 | Medium | Clinical | Saving an encounter ignores database errors for prescriptions, so data can be lost silently | code |
| M7 | Medium | Admin overview | "Active appointments" counts finished visits; "Pet Owners" counts pending/disapproved sign-ups | code |
| M8 | Medium | Billing | "Charge & Mark Paid" is 6 separate writes with errors ignored; the server does not stop billing the same appointment twice | code |
| M9 | Medium | Schedules | No server checks for start < end, capacity ≥ 1, or two schedules on the same date | code |
| L1 | Low | Code | Six unused, outdated appointment functions (one could bypass the booking limit if ever used) | code |
| L2 | Low | Database | Duplicate/overlapping security policies; unpublished services are readable by anyone | ✅ |
| L3 | Low | Template leftovers | `/dashboard/pages` "coming in Phase 5" page, your personal GitHub repo list, "vibe check" code | code |
| L4 | Low | Wording | Landing page still says "send your request to the clinic" / "appointment requested" | code |
| L5 | Low | Security settings | Leaked-password check off; 3 functions without a fixed search path; trigger functions callable over the API | advisor |
| L6 | Low | Performance | 13 foreign keys without an index | advisor |
| L7 | Low | Accounts | "Last active admin" protection ignores approval status; error text mentions only "veterinarian" | code |
| L8 | Low | Code | `isStaff()` also returns true for vets — the name hides that, and it caused M2 | code |

---

## High

### H1 — Owners can bypass the booking limit (Confirmed)
- **What:** the policy `owners create appointments` still lets an owner `INSERT` into
  `appointments` with status `booked`. The booking form uses the safe `book_appointment()`
  function, but anyone with the site's public key and their own login can call the API directly
  and add a 4th, 5th, … booking to a full day.
- **Proof:** an owner test account inserted a `booked` appointment directly → allowed.
- **Fix:** drop the direct-insert policy. Owners book only through `book_appointment()` (it
  already runs with its own permissions). Also delete the unused `createAppointment()` (L1).
- **Test:** Playwright/DB test "owner direct insert is rejected".

### H2 — Fake appointment history / Logs entries (Confirmed)
- **What:** the policy `system insert status history` on `appointment_status_history` allows
  **any** signed-in user to insert rows (`WITH CHECK true`). Logs reads this table, so an owner can
  make it look like staff marked an appointment Paid.
- **Proof:** an owner test account inserted a history row "booked → paid" → allowed.
- **Fix:** drop the policy. History is written by the database trigger, which does not need it.

### H3 — Vets can manage schedules (Confirmed)
- **What:** the old policy `Allow write for staff/admin` actually allows every clinic member
  (incl. vets) to insert/update/delete `appointment_schedules`. The Schedule tab is also shown to
  vets, and the schedule server functions have no role check.
- **Why it matters:** schedules set the booking limit. Vinz's rule: only Admin/Staff handle
  bookings.
- **Proof:** the vet test account created a schedule → allowed.
- **Fix:** drop that policy; add an Admin/Staff check to the schedule functions; hide the Schedule
  tab and `/dashboard/schedules` pages from vets (vets can still *see* schedules if wanted —
  see Decision 1).

### H4 — Encounters on cancelled appointments, duplicate encounters
- **What:**
  1. The "Start Encounter" button shows for every status, including Cancelled and No-show.
     Signing that encounter sets the appointment to **Diagnosed**, silently "un-cancelling" it.
  2. Starting an encounter never checks whether one already exists, and the database has no
     one-encounter-per-appointment rule. A double click or two open tabs creates two encounters.
- **Fix:** only allow starting an encounter for `booked` appointments; return the existing
  encounter if there is one; add a unique index on `encounters.appointment_id`.

## Medium

### M1 — Owners can read clinic staff contact details (Confirmed)
- **What:** policy `anyone can view veterinarians` lets every signed-in user read **all columns**
  of Admin, Staff and Vet profiles — phone, home address, emergency contact, last seen.
- **Proof:** the owner test account read the admin's and vet's phone and address.
- **Fix:** owners only need vet names. Replace with a small view/function that returns
  `id, full_name, role` for clinic members, and drop the broad policy.

### M2 — Vets can bill (Confirmed)
- **What:** invoices, invoice items and payments allow every clinic member; the billing pages use
  the same rule. Vinz's role list gives vets medical work only.
- **Fix (recommended):** Billing = Admin + Staff only (database + pages + sidebar). See
  Decision 2.

### M3 — Two payment paths, only one updates the appointment
- **What:** "Charge & Mark Paid" (appointment page) sets the appointment to **Paid**. Creating an
  invoice in **Billing** and recording payment there marks only the invoice Paid; the appointment
  stays **Diagnosed**, so it still shows "Charge & Mark Paid" and can be billed again.
- **Fix:** when an invoice becomes fully paid, also set its appointment (found through the
  invoice's encounter) to Paid.

### M4 — Owner overview hides upcoming visits
- **What:** the owner's "Upcoming appointments" includes Diagnosed and Paid (past) visits, sorted
  oldest date first, limited to 5. An owner with 5+ past visits sees only old ones.
- **Fix:** only `booked` visits dated today or later, soonest first.

### M5 — Pets tab stops at 100 pets
- **What:** `listPetsForCurrentUser()` has `.limit(100)`; the clinic Pets tab uses it.
- **Fix:** remove the limit (the tab already paginates in the browser), add an explicit owner
  filter for owners.

### M6 — Encounter draft save can lose prescriptions silently
- **What:** `saveEncounterDraft` deletes and re-inserts prescriptions without checking errors;
  a failure still reports success.
- **Fix:** check every write and throw a clear error.

### M7 — Wrong numbers on the clinic overview
- **What:** "Active appointments" counts Diagnosed and Paid visits (finished). "Pet Owners" counts
  pending and disapproved sign-ups, so it does not match the Owners tab.
- **Fix:** active = `booked` (+ `diagnosed` awaiting payment, labelled clearly); owners = approved
  or pending, not rejected — same rule as the Owners tab.

### M8 — "Charge & Mark Paid" is not safe against failures or double billing
- **What:** six separate writes; errors on totals, invoice status and appointment status are
  ignored. The server does not check the appointment is still unpaid — only the button state does.
- **Fix:** move it into one database function (all-or-nothing) that refuses already-paid
  appointments.

### M9 — Schedule validation only in the browser
- **What:** the server accepts end time before start time, capacity 0 or negative, and several
  schedules on the same date (the calendar then uses only one of them).
- **Fix:** server + database checks (`start_time < end_time`, `max_capacity >= 1`, one active
  schedule per date and start time).

## Low

- **L1 — Dead code:** `createAppointment`, `scheduleAppointment`, `rescheduleAppointment`,
  `completeAppointment`, `markNoShow`, `updateAppointment` are never called. `createAppointment`
  skips the booking limit; `check_double_booking()` still looks for the old statuses
  `requested/scheduled`. Remove them (no feature uses them).
- **L2 — Duplicate policies:** `appointment_schedules` has three identical "everyone can read"
  policies plus two write policies; `services` has `Allow public read access on services`
  (all rows, even unpublished) next to `public read published services`. Remove the duplicates.
- **L3 — Template leftovers:** `src/app/dashboard/pages` ("Page editor coming in Phase 5"),
  `getGithubRepos()` (your personal repos), `getVibeCheckData*()`. Remove.
- **L4 — Wording:** landing page "send your request to the clinic", "appointment requested"
  → bookings are confirmed instantly now.
- **L5 — Security settings:** Supabase "leaked password protection" is off (dashboard setting,
  Pro plan feature — optional). `auth_user_display_name`, `generate_invoice_number`,
  `generate_receipt_number` have no fixed `search_path`. Trigger functions
  (`handle_new_user`, `log_appointment_status_change`, `sync_profile_from_auth_user`) are listed
  as callable over the API — calling them fails, but revoking is cleaner.
- **L6 — Indexes:** 13 foreign keys without indexes (appointments.service_id, invoices.owner_id,
  payments.invoice_id, …). Not noticeable at thesis scale; cheap to add.
- **L7 — Last-admin guard:** counts other *active* admins but ignores approval status; its error
  message still says "changed to veterinarian".
- **L8 — Naming:** `isStaff()` means "admin, staff **or vet**". Rename to `isClinicMember()` so
  role checks read correctly.

## Checked and OK
- Booking limit inside `book_appointment()` (with row lock) — correct; also live on Vinz's DB.
- Registration approval: users cannot approve themselves or change their role (trigger + policy).
- Clinical records: owners only see **signed** encounters for their own pets with permission.
- Email templates are bundled into the Vercel build; SMTP failures are logged and never break
  approvals or payments.
- Owners see only their own pets, appointments, invoices.

## Decisions needed before fixing
1. **Schedules for vets** — recommended: vets can **view** the schedule but not create/edit it.
2. **Billing for vets** — recommended: **no billing for vets** (Admin + Staff only).

## Proposed fix plan (after approval)
| Step | Items | Tests |
|------|-------|-------|
| 1 Database rules | H1, H2, H3, M1, M2, L2, L5, L6, L7, H4 (unique index), M9 (checks) | DB tests per role (like `tests/10`) |
| 2 Server code | H3, H4, M2, M3, M5, M6, M8, M9, L1, L8 | unit/Playwright per item |
| 3 Screens & wording | H3/M2 tab visibility, H4 button, M4, M7, L3, L4 | Playwright per role |
| 4 Full regression | all | full suite with `TZ=UTC`, build, lint |
| 5 Docs | update human testing guide; write `OVERALL.md` (final system knowledge base) | — |
