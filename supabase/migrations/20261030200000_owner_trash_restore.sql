-- Owners tab: Trash and Restore instead of an immediate permanent delete.
--
-- * trash_owner(): Admin or Staff move an owner to Trash. The account is signed out of the
--   app (is_active = false) and hidden from the Owners tab, but nothing is deleted.
-- * restore_owner(): Admin or Staff bring the owner back exactly as before.
-- * admin_delete_owner() (Admin only) now permanently deletes only owners already in Trash.

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deleted_by" "uuid" REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "idx_profiles_deleted_at" ON "public"."profiles" ("deleted_at") WHERE "deleted_at" IS NOT NULL;

CREATE OR REPLACE FUNCTION "public"."trash_owner"("p_owner_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  target public.profiles;
BEGIN
  IF NOT (SELECT private.is_admin_or_staff()) THEN
    RAISE EXCEPTION 'Only Admin or Staff can move owners to Trash.';
  END IF;
  SELECT * INTO target FROM public.profiles WHERE id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR target.role <> 'owner' THEN
    RAISE EXCEPTION 'Only pet-owner accounts can be moved to Trash.';
  END IF;
  IF target.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This owner is already in Trash.';
  END IF;

  UPDATE public.profiles
  SET deleted_at = now(), deleted_by = (SELECT auth.uid()), is_active = false
  WHERE id = p_owner_id;

  INSERT INTO public.staff_audit_logs (actor_id, target_profile_id, action, previous_values, next_values)
  VALUES ((SELECT auth.uid()), p_owner_id, 'owner_trashed', jsonb_build_object('is_active', target.is_active), jsonb_build_object('is_active', false));

  RETURN target.email;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restore_owner"("p_owner_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  target public.profiles;
BEGIN
  IF NOT (SELECT private.is_admin_or_staff()) THEN
    RAISE EXCEPTION 'Only Admin or Staff can restore owners.';
  END IF;
  SELECT * INTO target FROM public.profiles WHERE id = p_owner_id FOR UPDATE;
  IF NOT FOUND OR target.role <> 'owner' OR target.deleted_at IS NULL THEN
    RAISE EXCEPTION 'This owner is not in Trash.';
  END IF;

  UPDATE public.profiles
  SET deleted_at = NULL, deleted_by = NULL, is_active = true
  WHERE id = p_owner_id;

  INSERT INTO public.staff_audit_logs (actor_id, target_profile_id, action, previous_values, next_values)
  VALUES ((SELECT auth.uid()), p_owner_id, 'owner_restored', jsonb_build_object('is_active', false), jsonb_build_object('is_active', true));

  RETURN target.email;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['trash_owner', 'restore_owner'] LOOP
    EXECUTE format('ALTER FUNCTION public.%I(uuid) OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid) FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(uuid) TO authenticated, service_role', fn);
  END LOOP;
END;
$$;

-- Permanent delete: Admin only, and only from Trash (two deliberate steps).
CREATE OR REPLACE FUNCTION "public"."admin_delete_owner"("p_owner_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  uid uuid := p_owner_id;
  target_email text;
  target_role text;
  sole_pet_ids uuid[];
  appt_ids uuid[];
  enc_ids uuid[];
BEGIN
  IF NOT (SELECT private.is_admin()) THEN
    RAISE EXCEPTION 'Only an Administrator can delete owner accounts.';
  END IF;

  SELECT email, role::text INTO target_email, target_role FROM public.profiles WHERE id = uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner not found.';
  END IF;
  IF target_role <> 'owner' THEN
    RAISE EXCEPTION 'Only pet-owner accounts can be deleted here. Use Team to manage clinic staff.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Move the owner to Trash first. Only owners in Trash can be deleted permanently.';
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

  -- Encounters for those appointments/pets (an owner never authors clinical records).
  SELECT coalesce(array_agg(id), '{}') INTO enc_ids
  FROM public.encounters
  WHERE appointment_id = ANY (appt_ids)
     OR pet_id = ANY (sole_pet_ids);

  -- Invoices: billed to this account, or tied to the encounters being deleted.
  DELETE FROM public.payments
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE owner_id = uid OR encounter_id = ANY (enc_ids));
  DELETE FROM public.invoice_items
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE owner_id = uid OR encounter_id = ANY (enc_ids));
  DELETE FROM public.invoices WHERE owner_id = uid OR encounter_id = ANY (enc_ids);

  -- Clinical records.
  DELETE FROM public.encounter_amendments
  WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.prescriptions
  WHERE encounter_id = ANY (enc_ids) OR pet_id = ANY (sole_pet_ids);
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
  RETURN target_email;
END;
$$;

ALTER FUNCTION "public"."admin_delete_owner"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."admin_delete_owner"("uuid") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."admin_delete_owner"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."admin_delete_owner"("uuid") TO "service_role";
