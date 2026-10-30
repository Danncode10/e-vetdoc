-- Atomic owner booking with a server-side capacity check (#6).
--
-- Bookings are approved immediately (`booked`) when the chosen slot has room; once a
-- slot reaches `max_capacity` it rejects further bookings. Slot membership uses the
-- clinic-local `preferred_date` + `preferred_time` (both timezone-free), not
-- `scheduled_start`, whose UTC value depends on the booking device's timezone.
-- The schedule row is locked so simultaneous bookings for the last spot cannot overflow.

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
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  slot_hour integer;
  slot public.appointment_schedules;
  booked_count integer;
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

  IF p_preferred_date < (now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'Please choose a date that has not passed.';
  END IF;

  slot_hour := nullif(split_part(coalesce(p_preferred_time, ''), ':', 1), '')::integer;
  IF slot_hour IS NULL THEN
    RAISE EXCEPTION 'Please choose a time slot.';
  END IF;

  -- Date-specific schedules override the recurring weekly schedule (same rule as the booking form).
  SELECT s.* INTO slot
  FROM public.appointment_schedules s
  WHERE s.status = 'active'
    AND extract(hour FROM s.start_time)::integer <= slot_hour
    AND slot_hour < extract(hour FROM s.end_time)::integer
    AND (
      s.specific_date = p_preferred_date
      OR (
        s.is_recurring
        AND s.day_of_week = extract(dow FROM p_preferred_date)::integer
        AND NOT EXISTS (
          SELECT 1 FROM public.appointment_schedules d
          WHERE d.specific_date = p_preferred_date AND d.status = 'active'
        )
      )
    )
  ORDER BY (s.specific_date IS NOT NULL) DESC, s.start_time
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'There is no clinic schedule for that date and time. Please choose another slot.';
  END IF;

  IF slot.is_closed THEN
    RAISE EXCEPTION 'The clinic is closed on that date. Please choose another date.';
  END IF;

  SELECT count(*) INTO booked_count
  FROM public.appointments a
  WHERE a.preferred_date = p_preferred_date
    AND a.status NOT IN ('cancelled', 'no_show')
    AND (
      a.preferred_time IS NULL
      OR (
        extract(hour FROM slot.start_time)::integer <= nullif(split_part(a.preferred_time, ':', 1), '')::integer
        AND nullif(split_part(a.preferred_time, ':', 1), '')::integer < extract(hour FROM slot.end_time)::integer
      )
    );

  IF booked_count >= slot.max_capacity THEN
    RAISE EXCEPTION 'This schedule is fully booked. Please choose another date or time.';
  END IF;

  INSERT INTO public.appointments (
    pet_id,
    owner_id,
    service_id,
    status,
    preferred_date,
    preferred_time,
    scheduled_start,
    scheduled_end,
    reason,
    notes,
    requested_at,
    confirmed_at
  )
  VALUES (
    p_pet_id,
    current_user_id,
    p_service_id,
    'booked',
    p_preferred_date,
    p_preferred_time,
    p_scheduled_start,
    p_scheduled_end,
    nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    now(),
    now()
  )
  RETURNING * INTO new_appointment;

  RETURN new_appointment;
END;
$$;

ALTER FUNCTION "public"."book_appointment"("p_pet_id" "uuid", "p_service_id" "uuid", "p_preferred_date" "date", "p_preferred_time" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_reason" "text", "p_notes" "text") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."book_appointment"("p_pet_id" "uuid", "p_service_id" "uuid", "p_preferred_date" "date", "p_preferred_time" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_reason" "text", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."book_appointment"("p_pet_id" "uuid", "p_service_id" "uuid", "p_preferred_date" "date", "p_preferred_time" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_reason" "text", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."book_appointment"("p_pet_id" "uuid", "p_service_id" "uuid", "p_preferred_date" "date", "p_preferred_time" "text", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_reason" "text", "p_notes" "text") TO "service_role";
