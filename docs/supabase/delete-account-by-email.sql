-- ============================================================================
-- E-VetDoc — permanently delete EVERYTHING belonging to one email account
-- ============================================================================
-- NOT a migration. Copy-paste into Supabase Dashboard → SQL Editor and run.
--
-- 1. Replace the email on the `target_email` line below.
-- 2. Run STEP 1 (preview) on its own first and check the counts.
-- 3. Run STEP 2. It runs as one transaction: if anything fails, nothing is deleted.
--
-- What STEP 2 deletes for that account:
--   • the login (auth.users) and profile, plus sessions and identities
--   • pets ONLY this account owns (pets shared with another owner are kept; just this
--     account's link to them is removed)
--   • every appointment this account booked, with its status history
--   • encounters (SOAP notes, diagnoses, treatments, prescriptions, amendments) for those
--     appointments and for the deleted pets
--   • invoices billed to this account, with their line items and payments
--   • staff/schedule audit-log rows about this account or written by it
--
-- Clinic staff accounts (admin / staff / veterinarian): records they authored on OTHER
-- people's pets (encounters, prescriptions, amendments, payments they recorded) belong to
-- those patients and are NOT deleted by default, so the script stops with a message.
-- Prefer Team → Deactivate for staff. To wipe them anyway, set
-- `delete_authored_clinic_records := true` (this destroys other owners' medical/billing records).
-- The script also refuses to delete the last active administrator.
-- ============================================================================


-- STEP 1 — Preview (read only). Replace the email, then run this block alone.
WITH target AS (
  SELECT id, email, role FROM public.profiles WHERE lower(email) = lower('someone@example.com')
)
SELECT
  (SELECT email FROM target)                                                                  AS email,
  (SELECT role FROM target)                                                                   AS role,
  (SELECT count(*) FROM public.pet_owners po, target t WHERE po.owner_profile_id = t.id)      AS linked_pets,
  (SELECT count(*) FROM public.appointments a, target t WHERE a.owner_id = t.id)              AS booked_appointments,
  (SELECT count(*) FROM public.invoices i, target t WHERE i.owner_id = t.id)                  AS invoices,
  (SELECT count(*) FROM public.encounters e, target t WHERE e.veterinarian_id = t.id)         AS encounters_authored,
  (SELECT count(*) FROM public.payments p, target t WHERE p.recorded_by = t.id)               AS payments_recorded;


-- STEP 2 — Delete. Replace the email on the `target_email` line, then run this block.
DO $$
DECLARE
  target_email text := 'someone@example.com';   -- ← the account to delete
  delete_authored_clinic_records boolean := false;  -- see header before setting true

  uid uuid;
  user_role text;
  sole_pet_ids uuid[];
  appt_ids uuid[];
  enc_ids uuid[];
  authored integer;
BEGIN
  SELECT id, role::text INTO uid, user_role
  FROM public.profiles WHERE lower(email) = lower(btrim(target_email));

  IF uid IS NULL THEN
    SELECT id INTO uid FROM auth.users WHERE lower(email) = lower(btrim(target_email));
    IF uid IS NULL THEN
      RAISE EXCEPTION 'No account found for %', target_email;
    END IF;
  END IF;

  IF user_role = 'admin' AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE role = 'admin' AND is_active AND id <> uid
  ) THEN
    RAISE EXCEPTION '% is the last active administrator. Make another account an admin first.', target_email;
  END IF;

  -- Records this account authored on other people's patients.
  SELECT (SELECT count(*) FROM public.encounters WHERE veterinarian_id = uid)
       + (SELECT count(*) FROM public.prescriptions WHERE veterinarian_id = uid)
       + (SELECT count(*) FROM public.encounter_amendments WHERE veterinarian_id = uid)
       + (SELECT count(*) FROM public.payments WHERE recorded_by = uid)
  INTO authored;

  IF authored > 0 AND NOT delete_authored_clinic_records THEN
    RAISE EXCEPTION '% authored % clinic record(s) (encounters, prescriptions, amendments or payments). Deactivate the account in Team instead, or set delete_authored_clinic_records := true.', target_email, authored;
  END IF;

  -- Pets only this account owns.
  SELECT coalesce(array_agg(po.pet_id), '{}') INTO sole_pet_ids
  FROM public.pet_owners po
  WHERE po.owner_profile_id = uid
    AND NOT EXISTS (
      SELECT 1 FROM public.pet_owners other
      WHERE other.pet_id = po.pet_id AND other.owner_profile_id <> uid
    );

  -- Appointments booked by this account or for its sole-owned pets.
  SELECT coalesce(array_agg(id), '{}') INTO appt_ids
  FROM public.appointments
  WHERE owner_id = uid OR pet_id = ANY (sole_pet_ids);

  -- Encounters for those appointments/pets, plus (only if allowed) ones this account wrote.
  SELECT coalesce(array_agg(id), '{}') INTO enc_ids
  FROM public.encounters
  WHERE appointment_id = ANY (appt_ids)
     OR pet_id = ANY (sole_pet_ids)
     OR (delete_authored_clinic_records AND veterinarian_id = uid);

  -- Invoices: billed to this account, or tied to the encounters being deleted.
  DELETE FROM public.payments
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE owner_id = uid OR encounter_id = ANY (enc_ids))
     OR (delete_authored_clinic_records AND recorded_by = uid);
  DELETE FROM public.invoice_items
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE owner_id = uid OR encounter_id = ANY (enc_ids));
  DELETE FROM public.invoices WHERE owner_id = uid OR encounter_id = ANY (enc_ids);

  -- Clinical records.
  DELETE FROM public.encounter_amendments
  WHERE encounter_id = ANY (enc_ids) OR (delete_authored_clinic_records AND veterinarian_id = uid);
  DELETE FROM public.prescriptions
  WHERE encounter_id = ANY (enc_ids) OR pet_id = ANY (sole_pet_ids)
     OR (delete_authored_clinic_records AND veterinarian_id = uid);
  DELETE FROM public.treatments     WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.diagnoses      WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.clinical_notes WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.encounters     WHERE id = ANY (enc_ids);

  -- Appointments and their history.
  UPDATE public.appointments SET rescheduled_from = NULL WHERE rescheduled_from = ANY (appt_ids);
  DELETE FROM public.appointment_status_history WHERE appointment_id = ANY (appt_ids);
  DELETE FROM public.appointments WHERE id = ANY (appt_ids);

  -- Pets and ownership links.
  DELETE FROM public.pet_owners WHERE owner_profile_id = uid OR pet_id = ANY (sole_pet_ids);
  DELETE FROM public.pets WHERE id = ANY (sole_pet_ids);

  -- Audit rows about or by this account (their FKs would block the delete).
  DELETE FROM public.staff_audit_logs WHERE actor_id = uid OR target_profile_id = uid;
  DELETE FROM public.schedule_audit_logs WHERE actor_id = uid;

  -- Remaining references are SET NULL by their foreign keys (status-history actor,
  -- assigned vet, approved_by). Deleting the login cascades to the profile.
  DELETE FROM auth.users WHERE id = uid;
  DELETE FROM public.profiles WHERE id = uid;

  RAISE NOTICE 'Deleted % (%): % sole-owned pet(s), % appointment(s), % encounter(s).',
    target_email, coalesce(user_role, 'no profile'),
    cardinality(sole_pet_ids), cardinality(appt_ids), cardinality(enc_ids);
END;
$$;
