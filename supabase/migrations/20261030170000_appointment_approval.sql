-- Clinic approval of bookings.
--
-- * An owner's booking now starts as `requested` ("Pending approval") instead of `booked`.
-- * Admin or Staff approve it with `approve_appointment()`, which makes it `booked`
--   ("Approved"). Veterinarians cannot approve.
-- * The schedule's `max_capacity` limits APPROVED appointments only. Pending requests do not
--   take a place; approving is refused once the slot already has `max_capacity` approved
--   visits, and new requests are refused while the slot is full of approved visits.
-- * Unchanged: same-day booking until the slot ends, one appointment per owner per day
--   (pending requests count), and overdue pending requests are auto-cancelled
--   (20261030150000_auto_cancel_overdue_appointments.sql).

-- Places taken in a schedule slot on a date: approved visits only.
CREATE OR REPLACE FUNCTION "private"."approved_count_in_slot"(
    "p_date" "date",
    "p_slot" "public"."appointment_schedules",
    "p_exclude_id" "uuid" DEFAULT NULL
) RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT count(*)::integer
  FROM public.appointments a
  WHERE a.preferred_date = p_date
    AND a.status NOT IN ('requested', 'cancelled', 'no_show')
    AND (p_exclude_id IS NULL OR a.id <> p_exclude_id)
    AND (
      a.preferred_time IS NULL
      OR (
        extract(hour FROM p_slot.start_time)::integer <= nullif(split_part(a.preferred_time, ':', 1), '')::integer
        AND nullif(split_part(a.preferred_time, ':', 1), '')::integer < extract(hour FROM p_slot.end_time)::integer
      )
    );
$$;

ALTER FUNCTION "private"."approved_count_in_slot"("date", "public"."appointment_schedules", "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."approved_count_in_slot"("date", "public"."appointment_schedules", "uuid") FROM PUBLIC, "anon", "authenticated";

-- The schedule slot an appointment on `p_date` at `p_time` belongs to (date-specific
-- schedules override the recurring weekly one). Locks the row so capacity checks serialise.
CREATE OR REPLACE FUNCTION "private"."lock_schedule_slot"("p_date" "date", "p_time" "text")
    RETURNS "public"."appointment_schedules"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  slot_hour integer := nullif(split_part(coalesce(p_time, ''), ':', 1), '')::integer;
  slot public.appointment_schedules;
BEGIN
  SELECT s.* INTO slot
  FROM public.appointment_schedules s
  WHERE s.status = 'active'
    AND extract(hour FROM s.start_time)::integer <= slot_hour
    AND slot_hour < extract(hour FROM s.end_time)::integer
    AND (
      s.specific_date = p_date
      OR (
        s.is_recurring
        AND s.day_of_week = extract(dow FROM p_date)::integer
        AND NOT EXISTS (
          SELECT 1 FROM public.appointment_schedules d
          WHERE d.specific_date = p_date AND d.status = 'active'
        )
      )
    )
  ORDER BY (s.specific_date IS NOT NULL) DESC, s.start_time
  LIMIT 1
  FOR UPDATE;
  RETURN slot;
END;
$$;

ALTER FUNCTION "private"."lock_schedule_slot"("date", "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."lock_schedule_slot"("date", "text") FROM PUBLIC, "anon", "authenticated";

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

-- Admin / Staff approve a pending request, within the slot's capacity.
CREATE OR REPLACE FUNCTION "public"."approve_appointment"("p_appointment_id" "uuid")
    RETURNS "public"."appointments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private', 'pg_temp'
    AS $$
DECLARE
  appt public.appointments;
  slot public.appointment_schedules;
  approved integer;
BEGIN
  IF NOT (SELECT private.is_admin_or_staff()) THEN
    RAISE EXCEPTION 'Only Admin or Staff can approve appointments.';
  END IF;

  SELECT * INTO appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found.';
  END IF;
  IF appt.status <> 'requested' THEN
    RAISE EXCEPTION 'Only pending appointments can be approved.';
  END IF;
  IF appt.preferred_date < (now() AT TIME ZONE 'Asia/Manila')::date THEN
    RAISE EXCEPTION 'This appointment''s date has passed. It can no longer be approved.';
  END IF;

  slot := private.lock_schedule_slot(appt.preferred_date, appt.preferred_time);
  IF slot.id IS NULL THEN
    RAISE EXCEPTION 'There is no clinic schedule for this appointment''s date and time.';
  END IF;
  IF slot.is_closed THEN
    RAISE EXCEPTION 'The clinic is closed on this date.';
  END IF;

  approved := private.approved_count_in_slot(appt.preferred_date, slot, appt.id);
  IF approved >= slot.max_capacity THEN
    RAISE EXCEPTION 'This schedule already has % of % appointments approved. Cancel one or raise the capacity first.', approved, slot.max_capacity;
  END IF;

  PERFORM set_config('evetdoc.approve', 'on', true);
  UPDATE public.appointments
  SET status = 'booked', confirmed_at = now()
  WHERE id = appt.id
  RETURNING * INTO appt;
  PERFORM set_config('evetdoc.approve', 'off', true);

  RETURN appt;
END;
$$;

ALTER FUNCTION "public"."approve_appointment"("uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."approve_appointment"("uuid") FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."approve_appointment"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."approve_appointment"("uuid") TO "service_role";

-- A pending request may only leave `requested` through approve_appointment() (capacity
-- checked) or by being cancelled; a direct UPDATE to another status is refused.
CREATE OR REPLACE FUNCTION "private"."guard_appointment_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.status = 'requested'
     AND NEW.status NOT IN ('requested', 'cancelled')
     AND coalesce(current_setting('evetdoc.approve', true), '') <> 'on' THEN
    RAISE EXCEPTION 'Pending appointments must be approved with Approve (capacity is checked there).';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."guard_appointment_approval"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_appointment_approval"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "appointments_guard_approval" ON "public"."appointments";
CREATE TRIGGER "appointments_guard_approval"
  BEFORE UPDATE OF "status" ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "private"."guard_appointment_approval"();

-- Status history: label approvals.
CREATE OR REPLACE FUNCTION "public"."log_appointment_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  is_auto_cancel boolean := NEW.auto_cancelled AND NOT OLD.auto_cancelled;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.appointment_status_history (
      appointment_id, previous_status, new_status, changed_by_id, reason, notes
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      CASE WHEN is_auto_cancel THEN NULL ELSE current_user_id END,
      CASE
        WHEN is_auto_cancel THEN 'auto_cancelled'
        WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason::text
        WHEN NEW.status = 'booked' AND OLD.status = 'requested' THEN 'approved'
        WHEN NEW.status = 'scheduled' AND OLD.status = 'requested' THEN 'confirmed'
        WHEN NEW.status = 'no_show' THEN 'no_show'
        ELSE NULL
      END,
      CASE
        WHEN is_auto_cancel THEN 'Cancelled automatically by the system: the appointment date passed before the clinic acted on the booking.'
        ELSE NEW.notes
      END
    );
  END IF;
  RETURN NEW;
END;
$$;

-- An encounter can only be opened for an APPROVED appointment (`booked`). Pending requests
-- must be approved first. Service-role maintenance (no signed-in user) is not restricted.
CREATE OR REPLACE FUNCTION "private"."guard_encounter_requires_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  appt_status public.appointment_status;
BEGIN
  IF NEW.appointment_id IS NULL OR (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT status INTO appt_status FROM public.appointments WHERE id = NEW.appointment_id;
  IF appt_status = 'requested' THEN
    RAISE EXCEPTION 'This appointment is still pending. Admin or Staff must approve it before an encounter can start.';
  END IF;
  IF appt_status IS DISTINCT FROM 'booked' THEN
    RAISE EXCEPTION 'An encounter can only be started for an approved appointment.';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."guard_encounter_requires_approval"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_encounter_requires_approval"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "encounters_require_approved_appointment" ON "public"."encounters";
CREATE TRIGGER "encounters_require_approved_appointment"
  BEFORE INSERT ON "public"."encounters"
  FOR EACH ROW EXECUTE FUNCTION "private"."guard_encounter_requires_approval"();
