-- Auto-cancel overdue bookings.
--
-- A booking the clinic never acted on (still `booked`, no encounter started) is cancelled by
-- the system once its clinic-local date (Asia/Manila) has passed. `auto_cancelled` marks
-- these rows so the screens can show "Cancelled automatically by the system", and the status
-- history records them with no actor and reason `auto_cancelled`.
--
-- The sweep runs whenever appointments are loaded (see `sweepOverdueAppointments` in
-- src/services/appointments.ts) and, if pg_cron is enabled, every hour as well.

ALTER TABLE "public"."appointments"
  ADD COLUMN IF NOT EXISTS "auto_cancelled" boolean DEFAULT false NOT NULL;

-- Only the sweep function may set `auto_cancelled`; anyone else's write to it is ignored,
-- so a user cannot disguise their own cancellation as a system one.
CREATE OR REPLACE FUNCTION "private"."guard_auto_cancelled"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF coalesce(current_setting('evetdoc.auto_cancel', true), '') <> 'on' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.auto_cancelled := false;
    ELSE
      NEW.auto_cancelled := OLD.auto_cancelled;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."guard_auto_cancelled"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_auto_cancelled"() FROM PUBLIC, "anon", "authenticated";

DROP TRIGGER IF EXISTS "appointments_guard_auto_cancelled" ON "public"."appointments";
CREATE TRIGGER "appointments_guard_auto_cancelled"
  BEFORE INSERT OR UPDATE ON "public"."appointments"
  FOR EACH ROW EXECUTE FUNCTION "private"."guard_auto_cancelled"();

-- Status history: a system cancellation has no actor and its own reason.
CREATE OR REPLACE FUNCTION "public"."log_appointment_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  current_user_id uuid := (SELECT auth.uid());
  is_auto_cancel boolean := NEW.auto_cancelled AND NOT OLD.auto_cancelled;
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.appointment_status_history (
      appointment_id,
      previous_status,
      new_status,
      changed_by_id,
      reason,
      notes
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      CASE WHEN is_auto_cancel THEN NULL ELSE current_user_id END,
      CASE
        WHEN is_auto_cancel THEN 'auto_cancelled'
        WHEN NEW.status = 'cancelled' THEN NEW.cancellation_reason::text
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

-- The sweep. Idempotent and only touches rows that are already overdue, so it is safe for
-- any signed-in user's page load to trigger it.
CREATE OR REPLACE FUNCTION "public"."cancel_overdue_appointments"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  clinic_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  affected integer;
BEGIN
  PERFORM set_config('evetdoc.auto_cancel', 'on', true);

  UPDATE public.appointments a
  SET status = 'cancelled',
      cancellation_reason = 'other',
      cancelled_at = now(),
      auto_cancelled = true
  WHERE a.status IN ('booked', 'requested', 'scheduled', 'confirmed')
    AND coalesce(a.preferred_date, (a.scheduled_start AT TIME ZONE 'Asia/Manila')::date) < clinic_today
    AND NOT EXISTS (SELECT 1 FROM public.encounters e WHERE e.appointment_id = a.id);
  GET DIAGNOSTICS affected = ROW_COUNT;

  PERFORM set_config('evetdoc.auto_cancel', 'off', true);
  RETURN affected;
END;
$$;

ALTER FUNCTION "public"."cancel_overdue_appointments"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."cancel_overdue_appointments"() FROM PUBLIC, "anon";
GRANT EXECUTE ON FUNCTION "public"."cancel_overdue_appointments"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."cancel_overdue_appointments"() TO "service_role";

-- Hourly background sweep when pg_cron is enabled (Dashboard → Database → Extensions).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cancel-overdue-appointments';
    PERFORM cron.schedule('cancel-overdue-appointments', '5 * * * *', 'SELECT public.cancel_overdue_appointments()');
  END IF;
END;
$$;
