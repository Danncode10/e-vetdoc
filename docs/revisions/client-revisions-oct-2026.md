# E-VetDoc — Client Revisions (Oct 2026)

> **Status:** Approved — in progress (see checklist below).
> **Source:** Client revision list + Messenger thread with Vinz (Vinz-ops).
> **Delivery:** All items below ship together as one PR from `Danncode10/e-vetdoc` → `Vinz-ops/e-vetdoc:main`.
> **Dev database:** Supabase project `e-vetdoc test` (`kvpotatpvwauunwhbyir`). Nothing is applied to the client's production database until the PR is merged.

---

## Agreed context from the conversation

- Scope was renegotiated: instead of "fixes only now, new features after the defense", **all 7 items are done now** as one batch.
- **"Client" = "Owner".** The system already uses **Owner** for pet owners. Vinz confirmed he'll inform the group. Registration therefore offers **Admin, Staff, Veterinarian, Owner** (no separate Client role).
- **Role display (#5):** Vinz sent a screenshot circling the empty area at the bottom-left of the sidebar. The role should be visible **all the time in the sidebar**, not only on the Overview page ("o baka may mas maganda kapang idea" — open to a better idea).
- Classification we told the client: **#6 is a fix**, the **Veterinarian appointment-approval restriction in #4 is a fix**, **#5 is already implemented** (moved to a more visible spot), everything else is new.

---

## What already exists (audit of current code)

| Area | Current state | Where |
|---|---|---|
| Roles | `user_role` enum = `admin`, `veterinarian`, `owner`. **No `staff`.** | `supabase/migrations/…_baseline.sql`, `src/services/authorization.ts` |
| Registration | Name + email + password, or Google. Every new account becomes `owner`. No role choice, no captcha. | `src/app/login/page.tsx`, `src/services/auth-server.ts`, `handle_new_user()` trigger |
| Account approval | None. Only `profiles.is_active` (used for deactivating staff). | `profiles` table |
| Staff management | Admin-only **Team** tab: promote an existing account to admin/vet, deactivate. | `src/components/staff-management.tsx`, `src/services/staff.ts` |
| Role display | Shown in the Overview banner and inside the profile pop-up menu (only after clicking the avatar). | `overview-tab.tsx`, `dashboard-shell.tsx` |
| Booking | New appointments are inserted directly as `booked` (auto-approved). The **capacity check is only in the browser** — the server never re-checks the slot. | `src/services/appointments.ts` (`createAppointment`, `getAvailableSlots`), `appointment-request-form.tsx` |
| Cancel modal | One shared modal with owner wording ("I need to reschedule", "My pet is unwell / not ready"). It is shown to **every role**, including vets. | `cancel-modal.tsx`, `appointment-detail-view.tsx`, `appointments-tab.tsx` |
| Owner data scope | RLS already limits owners to their own pets and appointments. | `owners view own appointments` policy, pet policies |
| Permissions in DB | ~26 RLS policies check `admin` / `veterinarian` directly. | baseline migration |

---

## Revision items

### 1. Add a Staff role — *New*
> "Dagdag Staff user"

- Add `staff` to the `user_role` enum.
- Staff appears everywhere roles are listed: Team tab, role pickers, role badges, filters.
- Seed one test Staff account on the test database for QA.

**Done when:** a Staff account can log in and sees the Staff dashboard described in #4.

---

### 2. Registration with role selection + pending approval + captcha — *New*
> "Maglagay ng registration options para sa Admin, Staff, Veterinarian, Owner… magiging Pending ang account hanggang ma-approve. Or captcha ex. I'm not a robot"

- Sign-up form gets a **"Register as"** selector: Admin, Staff, Veterinarian, Owner.
- Google sign-up: first-time Google users pick their role on the existing `/onboarding` page before continuing.
- Every new account starts as **Pending**.
- **Security:** the chosen role is stored as a *requested* role. The real role is only granted when the account is approved. A pending account never has Admin/Staff powers, even if someone bypasses the UI and calls Supabase directly.
- **Captcha:** add Cloudflare Turnstile ("I'm not a robot"). It's free and Supabase Auth supports it natively. We're doing approval **and** captcha, not either/or.
- **Existing accounts are marked Approved** in the migration so nobody, including the current admin, gets locked out.

**Done when:** a new sign-up for any role lands on a "Waiting for approval" screen. A failed or missing captcha blocks sign-up.

---

### 3. Login gate + Approve / Disapprove — *New*
> "Kailangan munang ma-approve ng Admin o Staff ang account bago makapag-login. May Approve at Disapprove buttons para sa mga bagong registration"

- Logging in with a Pending account shows: *"Your account is waiting for approval by the clinic."* No dashboard access.
- Logging in with a Disapproved account shows: *"Your registration was not approved. Please contact the clinic."*
- New **Pending registrations** list, visible to Admin and Staff. Each row shows name, email, requested role and sign-up date, with **Approve** and **Disapprove** buttons.
- Approver can adjust the role before approving (e.g. someone picked Admin by mistake).
- Every approve/disapprove is written to the existing staff audit log, so it shows in **Logs**.
- Optional: email the user when they're approved, using the SMTP setup the project already has.

**Done when:** Admin or Staff can approve or disapprove from the dashboard. An approved user can log in immediately, and a disapproved one can't.

---

### 4. Role permissions — *Mostly done; vet restriction is a Fix*
> Admin: full access… Staff: parehas sa admin pero hindi maka-edit ng settings… Veterinarian: medical records, diagnosis, consultations, treatments, walang approval for appointments… Owner: sariling pets at appointments lang

| Capability | Admin | Staff | Veterinarian | Owner |
|---|:-:|:-:|:-:|:-:|
| Overview, Pets, Owners, Appointments, Schedule, Billing | ✅ | ✅ | ✅ (no Billing edits) | Own data only |
| Approve / disapprove registrations | ✅ | ✅ | — | — |
| Manage appointments (cancel, reschedule, status) | ✅ | ✅ | **— (fix)** | Cancel own |
| Medical records, diagnosis, consultations, treatments | ✅ | ✅ | ✅ | View own pets |
| Team: change roles, deactivate users | ✅ | **—** | — | — |
| Clinic settings | ✅ | **view only** | — | — |
| Logs | ✅ | ✅ | — | — |

Implementation:
- Update `dashboard-features.ts` and `authorization.ts` with a shared `isAdminOrStaff()` helper. Today ~19 files hard-code `admin || veterinarian`, and each one has to be reviewed.
- Add a matching `private.is_admin_or_staff()` SQL helper and update the RLS policies so Staff has admin-level data access.
- Vet: keep UPDATE access the encounter flow needs (diagnosed/finished statuses). Remove cancel, reschedule and booking-management actions from the vet UI and services.
- Owner: already scoped by RLS. Verify only.

**Done when:** each test account (one per role) sees exactly the matrix above.

---

### 5. Show the logged-in user's role in the sidebar — *Already implemented; making it more visible*
> "Dapat nakikita sa dashboard ang role… sa tabi ng pangalan ng user o sa profile section." + Vinz's screenshot

- Add a **role badge** to the bottom-left profile button in the sidebar (the area Vinz circled). It's visible on every page without opening the menu.
- Same badge in the mobile top bar, since the sidebar is hidden on phones.
- Use the existing `ShieldCheck` + primary-color style already used in the Overview banner.

**Done when:** the role is visible on every dashboard page on desktop and mobile.

---

### 6. Automatic booking approval + booking limit — *Fix*
> "Automatic na ma-a-approve ang appointment kapag available ang napiling date at time. Kapag naabot na ang booking limit, hindi na puwedeng mag-book."

- Bookings are already auto-set to `booked`. What's missing is a **server-side capacity check**: today two people can book the last spot at the same time, or bypass the disabled button.
- Re-check slot capacity on the server inside the booking request (atomic, so simultaneous bookings can't overflow). If the slot is full, reject with: *"This schedule is fully booked. Please choose another date or time."*
- In the booking form, mark full slots (and fully booked days) as unavailable before the user picks them.

**Done when:** with `max_capacity = 3`, the 4th booking for the same slot is rejected even when submitted at the same moment, and the first 3 show as approved right away.

---

### 7. Remove owner-only cancel options from the Veterinarian view — *Fix*
> "Sa veterinarian sa pet, 'cancel my appointment' pang-owner yung features niya like 'my pet is unwell' etc."

- Vets no longer see **Cancel appointment** on the appointment detail page or the Appointments list (consistent with #4: vets don't manage appointments).
- Admin/Staff keep a cancel action with **clinic-side reasons** that already exist in the database: clinic emergency, no veterinarian available, weather, other.
- Owners keep their current owner wording ("I need to reschedule", "My pet is unwell / not ready").

**Done when:** logged in as a vet, no owner-worded cancel option appears anywhere. Admin/Staff see clinic reasons, and Owners see owner reasons.

---

## Decisions (resolved — no need to wait on Vinz)

1. **"Admin: … replace yung owner sa dashboard ng active now"** → Admin is the top role and takes the place of the "clinic owner" from their document. Admin already has full access, so no extra dashboard change. Mentioned in the PR so Vinz can flag it if he meant something else.
2. **Staff "can't edit settings"** → Staff can do everything Admin can **except** clinic configuration: **Team management** (add staff, change roles, deactivate accounts) and the **service catalog**. Staff *can* approve registrations, manage schedules, appointments, pets, billing, and see Logs. Everyone can still edit their own profile in Settings.
3. **Who approves whom** → Admin can approve any role. **Staff can approve Veterinarian and Owner only**, so a Staff member can never create an Admin or another Staff.
4. **Approval email** → Yes. Approved users get an email through the existing SMTP setup. If the email fails, the approval still goes through.
5. **Captcha** → Cloudflare Turnstile, checked on the server inside the sign-up action. If the keys aren't set, captcha is skipped, so nothing breaks before Vinz adds them.
6. **Booking-limit root cause (#6)** → `getAvailableSlots()` counts bookings by comparing `scheduled_start` timestamps in the **server's** timezone. Vercel runs in UTC while bookings are made in PH time (UTC+8), so in production existing bookings never count toward the limit. Fix: count by the clinic-local `preferred_date` + `preferred_time`, and enforce the limit atomically in the database.

---

## Database changes (new migrations)

1. `add_staff_role`: `ALTER TYPE user_role ADD VALUE 'staff'`. It has to be its own migration because Postgres can't use a new enum value in the same transaction.
2. `account_approval`:
   - `approval_status` enum (`pending`, `approved`, `rejected`) on `profiles`, default `pending`. Backfill **all existing rows to `approved`**.
   - `requested_role`, `approved_by`, `approved_at` columns on `profiles`.
   - `handle_new_user()` reads the requested role from sign-up metadata, and `role` stays least-privilege until approval.
   - `private.is_admin_or_staff()` helper. RLS policies updated for Staff, and pending users are blocked from writes.
3. `booking_capacity_guard`: a database function that checks capacity and inserts the appointment atomically (row lock on the schedule slot).

Applied to the **test database** during development. The client applies them to production after merging (see rollout).

---

## Progress checklist

Every stage ends with its own automated tests, lint, and a commit. Tests live in `tests/` and run with `npx playwright test <file>`.

### Stage 0 — Setup
- [x] Fork `Vinz-ops/e-vetdoc` → `Danncode10/e-vetdoc`, clone as `e-vetdoc-vinz`
- [x] Test Supabase (`e-vetdoc test`) restored and migrations synced with the repo
- [x] Branch `revisions/role-approval`, dependencies installed
- [ ] Staff test account created; `TEST_STAFF_*` + Turnstile test keys in `.env.local`

### Stage 1 — Database: Staff role, approvals, permissions (#1, #2, #3, #4)
- [ ] Migration `add_staff_role` (enum value)
- [ ] Migration `account_approval_and_staff_access` (approval columns, sign-up trigger, guard trigger, RLS for Staff)
- [ ] Applied to test Supabase + `src/types/supabase.ts` regenerated
- [ ] **Tests** `tests/10-db-approval-rls.spec.ts`: new sign-ups are pending with least-privilege role, users can't self-approve, pending owners can't add pets, Staff can read clinic data but can't change roles

### Stage 2 — Staff role + permission matrix in the app (#1, #4)
- [ ] Shared role helpers (`isAdminOrStaff`, `isClinicMember`) in `authorization.ts` and `dashboard-features.ts`
- [ ] All pages/services/components that check roles updated for Staff
- [ ] Team tab: Staff can be added and shown; Admin-only
- [ ] Vets can't cancel/reschedule appointments (UI + service layer)
- [ ] **Tests** `tests/11-role-permissions.spec.ts`: sidebar tabs per role; Staff blocked from Team; Vet has no appointment management

### Stage 3 — Registration with role + captcha (#2)
- [ ] "Register as" selector (Admin, Staff, Veterinarian, Owner) on sign-up
- [ ] Turnstile widget + server-side verification
- [ ] Google sign-ups pick their role on the account-status page
- [ ] **Tests** `tests/12-registration.spec.ts`: role options shown, captcha rendered, sign-up creates a pending account with the requested role

### Stage 4 — Login gate + Approve / Disapprove (#3)
- [ ] Pending / disapproved / deactivated accounts can't log in (clear message), and the redirect loop for inactive users is fixed
- [ ] `/account-status` page for signed-in users who aren't approved yet
- [ ] **Approvals** tab for Admin + Staff with Approve / Disapprove + role override, audit-logged
- [ ] Approval email
- [ ] **Tests** `tests/13-approvals.spec.ts`: pending user blocked → Admin approves → user logs in; Disapprove blocks; Staff can't approve an Admin request

### Stage 5 — Role badge in sidebar (#5)
- [ ] Role badge on the sidebar profile button + mobile top bar
- [ ] **Tests** `tests/14-role-badge.spec.ts`: badge visible for every role on desktop and mobile widths

### Stage 6 — Booking limit fix (#6)
- [ ] Migration `book_appointment_with_capacity` (atomic, locked capacity check)
- [ ] Slot counting uses clinic-local date/time (fixes the UTC bug)
- [ ] Booking form uses the new booking function; full slots show as unavailable
- [ ] **Tests** `tests/15-booking-capacity.spec.ts`: capacity 2 + 3 simultaneous bookings → exactly 2 succeed; full slot shown as fully booked; server running in UTC still enforces the limit

### Stage 7 — Cancel options per role (#7)
- [ ] Vet: no cancel action. Admin/Staff: clinic reasons. Owner: owner reasons
- [ ] **Tests** `tests/16-cancel-options.spec.ts`

### Stage 8 — Final QA + PR
- [ ] `pnpm lint` + `pnpm build` clean
- [ ] All new specs + existing booking/clinical flows pass
- [ ] Push to fork, open PR to `Vinz-ops/e-vetdoc:main`

---

## Rollout to the client's production (after the PR is merged)

These can't be done from the PR alone and must be done on Vinz's side:

- [ ] Apply the new migrations to the production Supabase project (`supabase db push`).
- [ ] Create a Cloudflare Turnstile site and add the **site key** to Vercel env (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
- [ ] In production Supabase → Auth → Bot & Abuse Protection: enable captcha (Turnstile) with the **secret key**.
- [ ] Redeploy on Vercel (`e-vetdoc-five.vercel.app`).
- [ ] Log in as the existing admin and confirm access still works (existing accounts are auto-approved by the migration).

---

## Out of scope

- Dependabot dependency-update PRs on the client repo (left untouched).
- Any change to billing, encounters, or prescriptions beyond the role checks above.
- Renaming "Owner" to "Client" in the UI (agreed to keep "Owner").
