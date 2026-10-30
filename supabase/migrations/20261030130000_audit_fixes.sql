-- Audit fixes (Oct 30). See docs/revisions/audit-report-oct-30.md for each item.
-- Safe to run on a database that already has data: uniqueness rules are only added when the
-- existing rows already satisfy them (otherwise a NOTICE explains what to clean up).

-- ---------------------------------------------------------------------------
-- H1 — owners book only through public.book_appointment() (capacity-checked).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "owners create appointments" ON "public"."appointments";

-- ---------------------------------------------------------------------------
-- H2 — appointment history is written only by the status trigger.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "system insert status history" ON "public"."appointment_status_history";

-- ---------------------------------------------------------------------------
-- H3 + L2 — schedules: everyone signed in can read; only Admin/Staff can change.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow write for staff/admin" ON "public"."appointment_schedules";
DROP POLICY IF EXISTS "Allow read for authenticated" ON "public"."appointment_schedules";
DROP POLICY IF EXISTS "staff view appointment schedules" ON "public"."appointment_schedules";
-- Kept: "allow authenticated to view appointment schedules" (read) and
--       "admins manage appointment schedules" (Admin/Staff write).

ALTER POLICY "Admins can insert schedule audit logs" ON "public"."schedule_audit_logs"
    WITH CHECK (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

-- L2 — only published services are public.
DROP POLICY IF EXISTS "Allow public read access on services" ON "public"."services";

-- ---------------------------------------------------------------------------
-- M1 — clinic staff contact details are not visible to owners.
-- Clinic members still see each other; owners get names only, via clinic_member_names().
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anyone can view veterinarians" ON "public"."profiles";

DROP POLICY IF EXISTS "clinic members view clinic profiles" ON "public"."profiles";
CREATE POLICY "clinic members view clinic profiles" ON "public"."profiles"
    FOR SELECT TO "authenticated"
    USING ((("role" = ANY (ARRAY['admin'::"public"."user_role", 'staff'::"public"."user_role", 'veterinarian'::"public"."user_role"]))
           AND ( SELECT "private"."is_clinic_member"() AS "is_clinic_member")));

CREATE OR REPLACE FUNCTION "public"."clinic_member_names"("p_ids" "uuid"[])
    RETURNS TABLE("id" "uuid", "full_name" "text", "role" "public"."user_role")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND p.id = ANY (p_ids)
    AND p.role IN ('admin', 'staff', 'veterinarian');
$$;

ALTER FUNCTION "public"."clinic_member_names"("p_ids" "uuid"[]) OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."clinic_member_names"("p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clinic_member_names"("p_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."clinic_member_names"("p_ids" "uuid"[]) TO "service_role";

-- ---------------------------------------------------------------------------
-- M2 — billing is Admin/Staff only (vets do medical work).
-- ---------------------------------------------------------------------------
ALTER POLICY "staff manage invoices" ON "public"."invoices"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"))
    WITH CHECK (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));
ALTER POLICY "staff manage invoice items" ON "public"."invoice_items"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"))
    WITH CHECK (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));
ALTER POLICY "staff manage payments" ON "public"."payments"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"))
    WITH CHECK (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

-- ---------------------------------------------------------------------------
-- M3 — a fully paid invoice marks its appointment Paid, whichever screen took the payment.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "private"."mark_appointment_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.encounter_id IS NOT NULL THEN
    UPDATE public.appointments a
    SET status = 'paid', updated_at = now()
    FROM public.encounters e
    WHERE e.id = NEW.encounter_id
      AND a.id = e.appointment_id
      AND a.status = 'diagnosed';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."mark_appointment_paid"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."mark_appointment_paid"() FROM PUBLIC;

CREATE OR REPLACE TRIGGER "mark_appointment_paid" AFTER UPDATE OF "status" ON "public"."invoices"
    FOR EACH ROW EXECUTE FUNCTION "private"."mark_appointment_paid"();

-- ---------------------------------------------------------------------------
-- M8 — "Charge & Mark Paid" as one all-or-nothing step that refuses double billing.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "public"."quick_bill_appointment"(
    "p_appointment_id" "uuid",
    "p_description" "text",
    "p_amount" numeric,
    "p_is_vatable" boolean,
    "p_method" "public"."payment_method",
    "p_reference" "text" DEFAULT NULL::"text"
) RETURNS TABLE("invoice_id" "uuid", "receipt_number" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
#variable_conflict use_column
DECLARE
  vat_rate constant numeric := 0.12;
  appt public.appointments;
  encounter_id uuid;
  vat numeric;
  total numeric;
  new_invoice public.invoices;
  new_payment public.payments;
BEGIN
  IF NOT (SELECT private.is_admin_or_staff()) THEN
    RAISE EXCEPTION 'Only Admin or Staff can bill appointments.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0.';
  END IF;
  IF btrim(coalesce(p_description, '')) = '' THEN
    RAISE EXCEPTION 'Service description is required.';
  END IF;

  SELECT * INTO appt FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Appointment not found.';
  END IF;
  IF appt.status = 'paid' THEN
    RAISE EXCEPTION 'This appointment is already paid.';
  END IF;
  IF appt.status <> 'diagnosed' THEN
    RAISE EXCEPTION 'Sign the encounter before charging this appointment.';
  END IF;

  SELECT e.id INTO encounter_id FROM public.encounters e WHERE e.appointment_id = appt.id ORDER BY e.created_at LIMIT 1;

  vat := CASE WHEN p_is_vatable THEN round(p_amount * vat_rate, 2) ELSE 0 END;
  total := p_amount + vat;

  INSERT INTO public.invoices (owner_id, encounter_id, status, vatable_sales, vat_exempt_sales, vat_amount, total_amount)
  VALUES (
    appt.owner_id, encounter_id, 'unpaid',
    CASE WHEN p_is_vatable THEN p_amount ELSE 0 END,
    CASE WHEN p_is_vatable THEN 0 ELSE p_amount END,
    vat, total
  )
  RETURNING * INTO new_invoice;

  INSERT INTO public.invoice_items (invoice_id, description, quantity, unit_price, is_vatable)
  VALUES (new_invoice.id, btrim(p_description), 1, p_amount, p_is_vatable);

  INSERT INTO public.payments (invoice_id, amount_paid, method, reference_number, recorded_by)
  VALUES (new_invoice.id, total, p_method, nullif(btrim(coalesce(p_reference, '')), ''), (SELECT auth.uid()))
  RETURNING * INTO new_payment;

  UPDATE public.invoices SET status = 'paid' WHERE id = new_invoice.id;
  -- The invoice trigger marks the appointment paid when an encounter is linked; do it here too
  -- for appointments billed without one.
  UPDATE public.appointments SET status = 'paid', updated_at = now() WHERE id = appt.id AND status = 'diagnosed';

  RETURN QUERY SELECT new_invoice.id, new_payment.receipt_number;
END;
$$;

ALTER FUNCTION "public"."quick_bill_appointment"("p_appointment_id" "uuid", "p_description" "text", "p_amount" numeric, "p_is_vatable" boolean, "p_method" "public"."payment_method", "p_reference" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."quick_bill_appointment"("p_appointment_id" "uuid", "p_description" "text", "p_amount" numeric, "p_is_vatable" boolean, "p_method" "public"."payment_method", "p_reference" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."quick_bill_appointment"("p_appointment_id" "uuid", "p_description" "text", "p_amount" numeric, "p_is_vatable" boolean, "p_method" "public"."payment_method", "p_reference" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."quick_bill_appointment"("p_appointment_id" "uuid", "p_description" "text", "p_amount" numeric, "p_is_vatable" boolean, "p_method" "public"."payment_method", "p_reference" "text") TO "service_role";

-- ---------------------------------------------------------------------------
-- H4 — one encounter per appointment.  M9 — schedule sanity rules.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.encounters WHERE appointment_id IS NOT NULL
    GROUP BY appointment_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped one-encounter-per-appointment index: duplicate encounters exist. Remove the extras, then rerun this block.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "encounters_one_per_appointment" ON "public"."encounters" ("appointment_id") WHERE "appointment_id" IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointment_schedules
    WHERE status = 'active' AND specific_date IS NOT NULL
    GROUP BY specific_date, start_time HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Skipped one-schedule-per-date index: duplicate active schedules exist. Deactivate the extras, then rerun this block.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "appointment_schedules_one_per_slot" ON "public"."appointment_schedules" ("specific_date", "start_time")
      WHERE "status" = 'active' AND "specific_date" IS NOT NULL;
  END IF;
END;
$$;

-- NOT VALID: enforced for new and edited rows without failing on old data.
ALTER TABLE "public"."appointment_schedules" DROP CONSTRAINT IF EXISTS "appointment_schedules_capacity_positive";
ALTER TABLE "public"."appointment_schedules" ADD CONSTRAINT "appointment_schedules_capacity_positive" CHECK ("max_capacity" >= 1) NOT VALID;
ALTER TABLE "public"."appointment_schedules" DROP CONSTRAINT IF EXISTS "appointment_schedules_start_before_end";
ALTER TABLE "public"."appointment_schedules" ADD CONSTRAINT "appointment_schedules_start_before_end" CHECK ("start_time" < "end_time") NOT VALID;

-- ---------------------------------------------------------------------------
-- L1 — unused double-booking check (it looked for statuses the app no longer uses).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS "public"."check_double_booking"("uuid", timestamp with time zone, timestamp with time zone, "uuid");

-- ---------------------------------------------------------------------------
-- L5 — fixed search paths; trigger functions and RPCs are not callable anonymously.
-- ---------------------------------------------------------------------------
ALTER FUNCTION "private"."auth_user_display_name"("jsonb") SET "search_path" TO 'public', 'pg_temp';
ALTER FUNCTION "public"."generate_invoice_number"() SET "search_path" TO 'public', 'pg_temp';
ALTER FUNCTION "public"."generate_receipt_number"() SET "search_path" TO 'public', 'pg_temp';

REVOKE EXECUTE ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."log_appointment_status_change"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."sync_profile_from_auth_user"() FROM PUBLIC, "anon", "authenticated";
REVOKE EXECUTE ON FUNCTION "public"."touch_last_seen"() FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."create_owned_pet"("text", "public"."pet_species", "text", "text", "public"."pet_sex", "date", integer, "text", "text") FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."book_appointment"("uuid", "uuid", "date", "text", timestamp with time zone, timestamp with time zone, "text", "text") FROM PUBLIC, "anon";
REVOKE EXECUTE ON FUNCTION "public"."clinic_member_names"("uuid"[]) FROM "anon";
REVOKE EXECUTE ON FUNCTION "public"."quick_bill_appointment"("uuid", "text", numeric, boolean, "public"."payment_method", "text") FROM "anon";

-- ---------------------------------------------------------------------------
-- L6 — indexes for foreign keys used in joins and Logs.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "idx_appointment_status_history_changed_by" ON "public"."appointment_status_history" ("changed_by_id");
CREATE INDEX IF NOT EXISTS "idx_appointments_rescheduled_from" ON "public"."appointments" ("rescheduled_from");
CREATE INDEX IF NOT EXISTS "idx_appointments_service_id" ON "public"."appointments" ("service_id");
CREATE INDEX IF NOT EXISTS "idx_encounter_amendments_veterinarian" ON "public"."encounter_amendments" ("veterinarian_id");
CREATE INDEX IF NOT EXISTS "idx_invoice_items_invoice_id" ON "public"."invoice_items" ("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_encounter_id" ON "public"."invoices" ("encounter_id");
CREATE INDEX IF NOT EXISTS "idx_invoices_owner_id" ON "public"."invoices" ("owner_id");
CREATE INDEX IF NOT EXISTS "idx_payments_invoice_id" ON "public"."payments" ("invoice_id");
CREATE INDEX IF NOT EXISTS "idx_payments_recorded_by" ON "public"."payments" ("recorded_by");
CREATE INDEX IF NOT EXISTS "idx_profiles_approved_by" ON "public"."profiles" ("approved_by");
CREATE INDEX IF NOT EXISTS "idx_schedule_audit_logs_actor" ON "public"."schedule_audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "idx_schedule_audit_logs_target" ON "public"."schedule_audit_logs" ("target_schedule_id");
CREATE INDEX IF NOT EXISTS "idx_staff_audit_logs_actor" ON "public"."staff_audit_logs" ("actor_id");

-- ---------------------------------------------------------------------------
-- L7 — the last approved, active Admin cannot be removed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "private"."prevent_removing_final_active_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.is_active AND (NEW.role <> 'admin' OR NOT NEW.is_active) THEN
    PERFORM 1
    FROM public.profiles
    WHERE id <> OLD.id
      AND role = 'admin'
      AND is_active = true
      AND approval_status = 'approved'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'The last active Admin cannot be deactivated or given another role.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
