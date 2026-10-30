-- Same-day booking + one booking per owner per day.
--
-- 1. Owners may book for today (clinic time, Asia/Manila) as long as the chosen slot has not
--    ended yet. A slot that already ended today is refused.
-- 2. An owner can hold only ONE appointment per day. Any appointment on that date that is not
--    cancelled / no-show counts (booked, diagnosed, paid, …). Cancelling frees the day again.
--    A transaction-scoped advisory lock per owner + date stops two simultaneous requests
--    (e.g. two tabs, different slots) from both getting through.
--
-- Everything else is unchanged from 20261030100200_book_appointment_with_capacity.sql.

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
  clinic_now timestamp := now() AT TIME ZONE 'Asia/Manila';
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

  IF p_preferred_date < clinic_now::date THEN
    RAISE EXCEPTION 'Please choose a date that has not passed.';
  END IF;

  slot_hour := nullif(split_part(coalesce(p_preferred_time, ''), ':', 1), '')::integer;
  IF slot_hour IS NULL THEN
    RAISE EXCEPTION 'Please choose a time slot.';
  END IF;

  -- One appointment per owner per day (serialised per owner + date).
  PERFORM pg_advisory_xact_lock(hashtextextended(current_user_id::text || ':' || p_preferred_date::text, 0));
  IF EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.owner_id = current_user_id
      AND a.preferred_date = p_preferred_date
      AND a.status NOT IN ('cancelled', 'no_show')
  ) THEN
    RAISE EXCEPTION 'You already have an appointment on this day. You can book only one appointment per day.';
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

  -- Same-day booking: allowed until the slot ends (schedule times are clinic-local).
  IF p_preferred_date = clinic_now::date
     AND clinic_now::time >= make_time(
       extract(hour FROM slot.end_time)::integer,
       extract(minute FROM slot.end_time)::integer,
       0
     ) THEN
    RAISE EXCEPTION 'That time slot has already ended today. Please choose a later slot or another date.';
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
