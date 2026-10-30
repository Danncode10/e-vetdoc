-- Trash and Restore for pets and clinic team members, like owners (20261030200000).
--
-- Pets (Admin or Staff): trash_pet() hides a pet everywhere (lists, booking) without deleting
-- anything; restore_pet() brings it back. purge_pet() (Admin only, from Trash) deletes the pet
-- with its appointments, medical records and their invoices.
--
-- Team (Admin only): trash_team_member() signs a staff/vet/admin out and hides them from the
-- roster; restore_team_member() brings them back. purge_team_member() (Admin, from Trash)
-- deletes the account, but refuses while they authored medical or billing records, because
-- those belong to the patients' history (keep such members in Trash).

ALTER TABLE "public"."pets"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "deleted_by" "uuid" REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

-- A pet in Trash cannot be booked.
CREATE OR REPLACE FUNCTION "private"."refuse_booking_trashed_pet"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pets WHERE id = NEW.pet_id AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'This pet is in Trash and cannot be booked.';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION "private"."refuse_booking_trashed_pet"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."refuse_booking_trashed_pet"() FROM PUBLIC, "anon", "authenticated";
DROP TRIGGER IF EXISTS "appointments_refuse_trashed_pet" ON "public"."appointments";
CREATE TRIGGER "appointments_refuse_trashed_pet"
  BEFORE INSERT ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "private"."refuse_booking_trashed_pet"();

CREATE OR REPLACE FUNCTION "public"."trash_pet"("p_pet_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  pet_name text;
BEGIN
  IF NOT (SELECT private.is_admin_or_staff()) THEN
    RAISE EXCEPTION 'Only Admin or Staff can move pets to Trash.';
  END IF;
  UPDATE public.pets SET deleted_at = now(), deleted_by = (SELECT auth.uid())
  WHERE id = p_pet_id AND deleted_at IS NULL
  RETURNING name INTO pet_name;
  IF pet_name IS NULL THEN
    RAISE EXCEPTION 'Pet not found or already in Trash.';
  END IF;
  RETURN pet_name;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restore_pet"("p_pet_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  pet_name text;
BEGIN
  IF NOT (SELECT private.is_admin_or_staff()) THEN
    RAISE EXCEPTION 'Only Admin or Staff can restore pets.';
  END IF;
  UPDATE public.pets SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_pet_id AND deleted_at IS NOT NULL
  RETURNING name INTO pet_name;
  IF pet_name IS NULL THEN
    RAISE EXCEPTION 'This pet is not in Trash.';
  END IF;
  RETURN pet_name;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."purge_pet"("p_pet_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  pet_name text;
  appt_ids uuid[];
  enc_ids uuid[];
BEGIN
  IF NOT (SELECT private.is_admin()) THEN
    RAISE EXCEPTION 'Only an Administrator can delete pets permanently.';
  END IF;
  SELECT name INTO pet_name FROM public.pets WHERE id = p_pet_id AND deleted_at IS NOT NULL;
  IF pet_name IS NULL THEN
    RAISE EXCEPTION 'Move the pet to Trash first. Only pets in Trash can be deleted permanently.';
  END IF;

  SELECT coalesce(array_agg(id), '{}') INTO appt_ids FROM public.appointments WHERE pet_id = p_pet_id;
  SELECT coalesce(array_agg(id), '{}') INTO enc_ids FROM public.encounters
  WHERE pet_id = p_pet_id OR appointment_id = ANY (appt_ids);

  DELETE FROM public.payments WHERE invoice_id IN (SELECT id FROM public.invoices WHERE encounter_id = ANY (enc_ids));
  DELETE FROM public.invoice_items WHERE invoice_id IN (SELECT id FROM public.invoices WHERE encounter_id = ANY (enc_ids));
  DELETE FROM public.invoices WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.encounter_amendments WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.prescriptions WHERE encounter_id = ANY (enc_ids) OR pet_id = p_pet_id;
  DELETE FROM public.treatments WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.diagnoses WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.clinical_notes WHERE encounter_id = ANY (enc_ids);
  DELETE FROM public.encounters WHERE id = ANY (enc_ids);
  UPDATE public.appointments SET rescheduled_from = NULL WHERE rescheduled_from = ANY (appt_ids);
  DELETE FROM public.appointment_status_history WHERE appointment_id = ANY (appt_ids);
  DELETE FROM public.appointments WHERE id = ANY (appt_ids);
  DELETE FROM public.pet_owners WHERE pet_id = p_pet_id;
  DELETE FROM public.pets WHERE id = p_pet_id;
  RETURN pet_name;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."trash_team_member"("p_profile_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  target public.profiles;
BEGIN
  IF NOT (SELECT private.is_admin()) THEN
    RAISE EXCEPTION 'Only an Administrator can move team members to Trash.';
  END IF;
  IF p_profile_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'You cannot move your own account to Trash.';
  END IF;
  SELECT * INTO target FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR target.role NOT IN ('admin', 'staff', 'veterinarian') THEN
    RAISE EXCEPTION 'Only clinic team members can be moved to Trash here.';
  END IF;
  IF target.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This team member is already in Trash.';
  END IF;

  -- protect_final_active_admin refuses this for the last active Admin.
  UPDATE public.profiles SET deleted_at = now(), deleted_by = (SELECT auth.uid()), is_active = false
  WHERE id = p_profile_id;

  INSERT INTO public.staff_audit_logs (actor_id, target_profile_id, action, previous_values, next_values)
  VALUES ((SELECT auth.uid()), p_profile_id, 'staff_trashed', jsonb_build_object('is_active', target.is_active), jsonb_build_object('is_active', false));
  RETURN target.email;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restore_team_member"("p_profile_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  target public.profiles;
BEGIN
  IF NOT (SELECT private.is_admin()) THEN
    RAISE EXCEPTION 'Only an Administrator can restore team members.';
  END IF;
  SELECT * INTO target FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF NOT FOUND OR target.role NOT IN ('admin', 'staff', 'veterinarian') OR target.deleted_at IS NULL THEN
    RAISE EXCEPTION 'This team member is not in Trash.';
  END IF;
  UPDATE public.profiles SET deleted_at = NULL, deleted_by = NULL, is_active = true WHERE id = p_profile_id;
  INSERT INTO public.staff_audit_logs (actor_id, target_profile_id, action, previous_values, next_values)
  VALUES ((SELECT auth.uid()), p_profile_id, 'staff_restored', jsonb_build_object('is_active', false), jsonb_build_object('is_active', true));
  RETURN target.email;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."purge_team_member"("p_profile_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  target public.profiles;
  authored integer;
BEGIN
  IF NOT (SELECT private.is_admin()) THEN
    RAISE EXCEPTION 'Only an Administrator can delete team members permanently.';
  END IF;
  IF p_profile_id = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'You cannot delete your own account.';
  END IF;
  SELECT * INTO target FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND OR target.role NOT IN ('admin', 'staff', 'veterinarian') THEN
    RAISE EXCEPTION 'Only clinic team members can be deleted here.';
  END IF;
  IF target.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Move the team member to Trash first. Only members in Trash can be deleted permanently.';
  END IF;

  SELECT (SELECT count(*) FROM public.encounters WHERE veterinarian_id = p_profile_id)
       + (SELECT count(*) FROM public.prescriptions WHERE veterinarian_id = p_profile_id)
       + (SELECT count(*) FROM public.encounter_amendments WHERE veterinarian_id = p_profile_id)
       + (SELECT count(*) FROM public.payments WHERE recorded_by = p_profile_id)
  INTO authored;
  IF authored > 0 THEN
    RAISE EXCEPTION 'This team member wrote % medical or billing record(s) that are part of patients'' history. Keep them in Trash instead of deleting.', authored;
  END IF;

  DELETE FROM public.staff_audit_logs WHERE actor_id = p_profile_id OR target_profile_id = p_profile_id;
  DELETE FROM public.schedule_audit_logs WHERE actor_id = p_profile_id;
  DELETE FROM auth.users WHERE id = p_profile_id;
  DELETE FROM public.profiles WHERE id = p_profile_id;
  RETURN target.email;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['trash_pet', 'restore_pet', 'purge_pet', 'trash_team_member', 'restore_team_member', 'purge_team_member'] LOOP
    EXECUTE format('ALTER FUNCTION public.%I(uuid) OWNER TO postgres', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(uuid) FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(uuid) TO authenticated, service_role', fn);
  END LOOP;
END;
$$;
