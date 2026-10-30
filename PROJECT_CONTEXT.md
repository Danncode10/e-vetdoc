# Project Context — E-VetDoc

> This is the durable product and implementation context for E-VetDoc. Read it before designing features, changing the schema, or creating new screens.

---

## Product identity

| Item | Decision |
| --- | --- |
| App name | **E-VetDoc** |
| Repository | https://github.com/Danncode10/e-vetdoc |
| Product type | Web-based veterinary clinic management system |
| One-liner | A single-clinic veterinary management system for pet owners, veterinarians, appointments, medical records, invoicing, and receipts. |
| Primary environment | A modern browser with clinic internet access and an optional printer. |

E-VetDoc replaces disconnected paper or manual processes with one clinic workspace for patient care, appointments, clinical history, and in-clinic billing. It also gives pet owners a controlled portal for the pets linked to their account.

---

## MVP boundary

E-VetDoc is built for **one veterinary clinic only**. It is not a multi-tenant SaaS in the MVP.

Do not introduce any of the following unless the project scope explicitly changes:

- A `clinics` table, organization records, clinic memberships, or `clinic_id` fields.
- Cross-clinic access rules or per-clinic configuration.
- Online payment gateways, mobile-payment integrations, or payment webhooks.
- Advanced laboratory integrations.
- Full confinement and surgery workflows before the core consultation workflow is complete.
- Backup/recovery or privacy/compliance features beyond the authorization needed to keep owner data separated.

Clinical and financial history must still be traceable. The MVP does not permit silently overwriting signed medical records or recorded payments.

---

## Users and authorization

> **Update (Oct 2026):** a fourth role, **Staff**, was added at the client's request, accounts
> need clinic approval, and Admin/Staff may also sign encounters. The current role matrix is in
> [`OVERALL.md`](OVERALL.md) §3. The table below is the original MVP decision.

There are exactly three application roles:

| Role | Responsibilities | Access boundary |
| --- | --- | --- |
| **Admin** | Manage owner profiles, pets, appointment schedules, walk-ins, veterinarian accounts, services, invoices, payments, receipts, and basic reports. | Does not sign veterinary clinical records or prescriptions. |
| **Veterinarian** | Review pet history; manage consultations, diagnoses, treatments, clinical notes, prescriptions, signing, and amendments. | Does not change payment history or unrelated system settings without separate admin authority. |
| **Owner** | Register/sign in, manage their own profile, request/view appointments, access linked pets, and view permitted medical history, invoices, and receipts. | Never accesses another owner's pets, records, appointments, invoices, or receipts. |

The system may generate notifications, receipts, and PDFs through server-side integrations, but those integrations must never bypass the same access rules.

### Authorization model

- Authentication uses Supabase Auth.
- App roles live in profile/application data, never in editable user metadata.
- RLS is required for every exposed application table.
- All business logic and Supabase queries live in `src/services/`, never in UI components.
- Route and page access must be role-aware, not a single generic authenticated-user experience.
- A profile has one canonical role in the MVP. Dual-role staff are intentionally out of scope until a dedicated staff-role assignment model is introduced; an admin must never gain veterinarian-only authority through a UI toggle or client-supplied metadata.

---

## Owner and pet relationship

An owner can have multiple pets. A pet can also have multiple authorized owners, such as co-owners or family members.

```text
profiles
  ├─ role: admin | veterinarian | owner
  └─< pet_owners >─ pets
```

`pet_owners` is the sole source of truth for an owner's link to a pet. Do **not** add a competing direct `owner_id` to `pets`.

Suggested fields for `pet_owners`:

| Field | Purpose |
| --- | --- |
| `pet_id` | The linked pet. |
| `owner_profile_id` | The linked owner profile. |
| `relationship` | For example: owner, co-owner, family member, caretaker. |
| `is_primary_contact` | Identifies the clinic's preferred contact for the pet. |
| `can_view_medical_records` | Controls whether the owner can see medical history. |
| `can_receive_notifications` | Controls whether the owner receives appointment and billing notifications. |

Each pet profile should include at least name, species, breed, sex, and date of birth or age.

---

## Core workflows

### Owner appointment journey

1. The owner registers or signs in.
2. The owner selects a linked pet.
3. The owner requests an appointment, such as a consultation or vaccination.
4. An admin reviews and schedules the request.
5. The owner views the status and can print the appointment details.
6. After the visit, the owner views permitted medical information, invoices, and receipts.

### Clinic check-in and consultation journey

1. An admin reviews the schedule or creates a walk-in check-in/logbook record.
2. The veterinarian opens the pet profile and reviews longitudinal history.
3. The veterinarian records the encounter, including notes, diagnosis, treatment, medication, and prescription details.
4. The veterinarian signs the final clinical record.
5. The clinic prepares an invoice for the visit's services or products.

### Payment and receipt journey

1. An admin creates or updates an invoice and its itemized lines.
2. The owner pays at the clinic; the first supported method is cash.
3. An authorized admin records the amount, method, payment time, optional reference/notes, and staff member.
4. The system sends an email receipt to the owner.
5. Any error is resolved by a correction record, not an edit or deletion of the original payment.

---

## Appointments and visits

The MVP supports owner appointment requests, staff-managed scheduling, walk-ins, and check-in records.

Minimum appointment state lifecycle:

```text
requested → confirmed/scheduled → completed
                         ├──────→ cancelled
                         └──────→ no-show
```

Each appointment should capture the pet, requested service, scheduled date/time when confirmed, owner note or reason for visit, current status, and status-history timestamps.

Staff and veterinarians need a schedule and appointment-detail view. Owners can access only appointments associated with pets linked to them.

Open decisions before implementing this schema:

- Standard appointment duration by service.
- Veterinarian availability and double-booking behavior.
- Cancellation and rescheduling rules.
- Whether owners may cancel confirmed appointments online.
- Minimum details required for a walk-in record.

---

## Clinical records and prescriptions

The clinical record is a longitudinal **encounter** or consultation for a pet. It may contain:

- Presenting concern and clinical notes.
- Patient-history questionnaire: acquisition/origin, living environment, diet, appetite and attitude, drinking habits, symptoms, prior veterinary history, examinations, and vaccinations/preventives.
- Diagnoses.
- Treatments and medications administered or recommended.
- Prescriptions and prescription items.
- Document metadata or attachments when needed in a later phase.

### Signing and amendment policy

1. A veterinarian creates an encounter as a draft.
2. The veterinarian may edit their draft record under role rules.
3. The veterinarian signs the completed record.
4. A signed record is never directly overwritten.
5. A later change creates an amendment linked to the original record and records author, timestamp, change reason, and amended content.
6. Only veterinarians may sign clinical records and prescriptions.

---

## Billing, payments, and receipts

Invoices represent charges for services or products. They need a header, itemized lines, totals, state, and a relationship to the relevant pet, appointment, or encounter when applicable.

Minimum invoice state lifecycle:

```text
unpaid → partially paid → paid
  └──────────────────────→ voided
paid ────────────────────→ refunded/corrected
```

### Numbering and correction policy

- Invoice numbers are sequential, human-readable identifiers, for example `INV-2026-00001`.
- Receipt numbers are separate sequential identifiers, for example `RCT-2026-00001`.
- The MVP starts with staff-recorded in-clinic cash payments.
- Payments record amount, method, time, optional reference/notes, and the admin who entered the payment.
- Recorded payments are never overwritten or deleted.
- A linked void, refund, or correction record resolves payment mistakes and preserves the original entry.
- Owners can view invoices and receipts; admins issue email receipts.

The exact tax treatment, receipt wording, and refund/correction fields require a business decision before the invoice schema is final.

---

## MVP modules

| Module | MVP capability |
| --- | --- |
| Authentication and roles | Owner registration, sign in/out, profiles, role-aware routes, admin and veterinarian accounts. |
| Owner and pet registry | Owner profiles, pet profiles, `pet_owners`, and patient search/listing for staff. |
| Appointments and visits | Appointment requests, scheduling, statuses, history, walk-ins, and check-in logbook. |
| Clinical workspace | Pet history, encounters, diagnoses, treatments, and signed prescriptions. |
| Billing | Invoices, itemized charges, cash payment recording, receipt creation, and correction records. |
| Owner portal | Linked pets, appointments, permitted medical history, invoices, and email receipts. |
| Documents and reports | Printable patient record, prescription, and basic patient/diagnosis/payment reports. |
| Notifications | Appointment reminders/status updates and receipt messages through the simplest initial channel. |

---

## Data-model direction

Keep identity, ownership, scheduling, clinical history, and finance as separate concepts:

```text
profiles ──< pet_owners >── pets
pets ──< appointments >── services
appointments ──< encounters ──< diagnoses
encounters ──< treatments
encounters ──< prescriptions ──< prescription_items
appointments / encounters ──< invoices ──< invoice_items
invoices ──< payments ──< payment_corrections
payments ──< receipts
profiles / pets / appointments / invoices ──< notifications
```

The database schema is authored in `db/schema/` using Drizzle. Generate a reviewed migration before applying it, refresh generated Supabase types after the migration, and define explicit RLS policies for every exposed table.

---

## Design decisions

- Build a clear, calm, clinic-oriented interface that works from 375px mobile width through clinic desktops.
- Use the existing Shadcn UI primitives and Tailwind semantic tokens only.
- Default to Server Components; add client components only when interaction requires them.
- Keep forms labelled, accessible, and spacious; interactive controls are at least 48px tall.
- Owner-facing language is professional, reassuring, and plain-spoken. Avoid unexplained medical jargon and sales-heavy language.

### Registry navigation

- Staff registry searches remain compact lists. Opening a result always navigates to a dedicated record page; details must not expand below a search result.
- Owner records use `/user/[ownerId]`. Linked patient records use `/user/[ownerId]/pet/[petId]`, where `ownerId` must be an authorized link for that pet.
- These routes are restricted to active admins and veterinarians. They are read-only until the relevant operational workflow grants a mutation capability.
- The pet record page may show an empty medical-record state before Phase 3 clinical encounters exist; it must never imply that a record was created when none exists.

---

## Delivery order

1. Define roles, profiles, owner-pet access, and RLS.
2. Build the owner and pet registry.
3. Build appointment requests, scheduling, statuses, walk-ins, and check-in.
4. Build the clinical workspace and signing/amendment workflow.
5. Build invoices, cash payments, receipts, and corrections.
6. Add owner-facing history, invoices, email receipts, and printable-document views for clinical records.
7. Add basic notifications and reports after the core workflows work end-to-end.

## Current focus

Project initialization and product context are in place. The database migration is pending correction of the `DATABASE_URL` password. Once migrated, create a non-draft GitHub Project board with `Backlog`, `Ready`, `In progress`, and `Done`, then run `/masterplan-init` to build the ordered Phase 0 work plan.

### Authentication decisions

- New owner accounts must confirm their email address before access is granted.

*Last updated: 2026-08-22*
