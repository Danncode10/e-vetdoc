-- 1. One appointment per PET per day (was per owner): an owner can book pet A and pet B on
--    the same day, but the same pet only once that day.
-- 2. admin_delete_owner(): Admin permanently deletes an owner account and all of its data
--    (same rules as docs/supabase/delete-account-by-email.sql, owners only).

CREATE OR REPLACE FUNCTION "public"."book_appointment"(
    "p_pet_id" "uuid",
    "p_service_id" "uuid",
    "p_preferred_date" "date",
    "p_preferred_time" "text",
    "p_scheduled_start" timestamp with time zone DEFAULT NULL::timestamp with time zone,
    "p_scheduled_end" timestamp with time zone DEFAULT NULL::timestamp with time zone,
    "p_reason" "text" DEFAULT NULL::"text",
    "p_notes" "text" DEFAULT NULL::"text"
) RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  clinic_now timestamp := now() AT TIME ZONE 'Asia/Manila';
  slot public.appointment_schedules;
  new_appointment public.appointments;
BEGIN
  IF current_user_id IS NULL OR NOT (SELECT private.is_owner()) THEN
    RAISE EXCEPTION 'Only approved pet owners can book appointments.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pet_owners
    WHERE pet_id = p_pet_id AND owner_profile_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'You can only book appointments for your own pets.';
  END IF;

  IF p_preferred_date < clinic_now::date THEN
    RAISE EXCEPTION 'Please choose a date that has not passed.';
  END IF;

  IF nullif(split_part(coalesce(p_preferred_time, ''), ':', 1), '') IS NULL THEN
    RAISE EXCEPTION 'Please choose a time slot.';
  END IF;

  -- One appointment per PET per day (serialised per pet + date). Other pets of the same
  -- owner can still be booked that day.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_pet_id::text || ':' || p_preferred_date::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.pet_id = p_pet_id
      AND a.preferred_date = p_preferred_date
      AND a.status NOT IN ('cancelled', 'no_show')
  ) THEN
    RAISE EXCEPTION 'This pet already has an appointment on this day. Each pet can be booked once per day.';
  END IF;

  slot := private.lock_schedule_slot(p_preferred_date, p_preferred_time);
  IF slot.id IS NULL THEN
    RAISE EXCEPTION 'There is no clinic schedule for that date and time. Please choose another slot.';
  END IF;

  IF slot.is_closed THEN
    RAISE EXCEPTION 'The clinic is closed on that date. Please choose another date.';
  END IF;

  -- Same-day booking: allowed until the slot ends (schedule times are clinic-local).
  IF p_preferred_date = clinic_now::date
     AND clinic_now::time >= make_time(
       extract(hour FROM slot.end_time)::integer,
       extract(minute FROM slot.end_time)::integer,
       0
     ) THEN
    RAISE EXCEPTION 'That time slot has already ended today. Please choose a later slot or another date.';
  END IF;

  IF private.approved_count_in_slot(p_preferred_date, slot) >= slot.max_capacity THEN
    RAISE EXCEPTION 'This schedule is fully booked. Please choose another date or time.';
  END IF;

  INSERT INTO public.appointments (
    pet_id, owner_id, service_id, status, preferred_date, preferred_time,
    scheduled_start, scheduled_end, reason, notes, requested_at
  )
  VALUES (
    p_pet_id, current_user_id, p_service_id, 'requested', p_preferred_date, p_preferred_time,
    p_scheduled_start, p_scheduled_end,
    nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    now()
  )
  RETURNING * INTO new_appointment;

  RETURN new_appointment;
END;
$$;


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
