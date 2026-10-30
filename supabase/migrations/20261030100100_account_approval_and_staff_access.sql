-- Account approval workflow + Staff access.
--
-- * New accounts start as `pending` and cannot use the clinic until an Admin or Staff
--   member approves them. Accounts that existed before this migration are approved.
-- * The role picked at sign-up is stored in `requested_role`. The effective `role`
--   stays the least-privilege `owner` until approval, so a pending account never has
--   clinic powers even if the UI is bypassed.
-- * Staff gets the same data access as Admin, except profile/role management and the
--   service catalog (clinic settings).

CREATE TYPE "public"."approval_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);

ALTER TYPE "public"."approval_status" OWNER TO "postgres";

-- Added with an `approved` default so every existing row is backfilled as approved,
-- then switched to `pending` for accounts created from now on.
ALTER TABLE "public"."profiles"
    ADD COLUMN "approval_status" "public"."approval_status" DEFAULT 'approved'::"public"."approval_status" NOT NULL,
    ADD COLUMN "requested_role" "public"."user_role",
    ADD COLUMN "approved_by" "uuid",
    ADD COLUMN "approved_at" timestamp with time zone;

ALTER TABLE "public"."profiles"
    ALTER COLUMN "approval_status" SET DEFAULT 'pending'::"public"."approval_status";

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

CREATE INDEX "idx_profiles_pending_approval" ON "public"."profiles" USING "btree" ("created_at") WHERE ("approval_status" = 'pending'::"public"."approval_status");


-- ---------------------------------------------------------------------------
-- Role helpers. Every helper now requires an active, approved account.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'admin'
      AND is_active = true
      AND approval_status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION "private"."is_owner"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'owner'
      AND is_active = true
      AND approval_status = 'approved'
  )
$$;

CREATE OR REPLACE FUNCTION "private"."is_veterinarian"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'veterinarian'
      AND is_active = true
      AND approval_status = 'approved'
  )
$$;

-- Admin or Staff: clinic operations (approvals, appointments, pets, schedules, logs).
CREATE OR REPLACE FUNCTION "private"."is_admin_or_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'staff')
      AND is_active = true
      AND approval_status = 'approved'
  )
$$;

ALTER FUNCTION "private"."is_admin_or_staff"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."is_admin_or_staff"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin_or_staff"() TO "authenticated";

-- Any clinic team member: Admin, Staff, or Veterinarian (clinical records, billing).
CREATE OR REPLACE FUNCTION "private"."is_clinic_member"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('admin', 'staff', 'veterinarian')
      AND is_active = true
      AND approval_status = 'approved'
  )
$$;

ALTER FUNCTION "private"."is_clinic_member"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."is_clinic_member"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_clinic_member"() TO "authenticated";


-- ---------------------------------------------------------------------------
-- Sign-up: record the requested role, start pending as a least-privilege owner.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
DECLARE
  profile_full_name text;
  profile_requested_role public.user_role;
BEGIN
  profile_full_name := private.auth_user_display_name(NEW.raw_user_meta_data);

  profile_requested_role := CASE NEW.raw_user_meta_data->>'requested_role'
    WHEN 'admin' THEN 'admin'::public.user_role
    WHEN 'staff' THEN 'staff'::public.user_role
    WHEN 'veterinarian' THEN 'veterinarian'::public.user_role
    WHEN 'owner' THEN 'owner'::public.user_role
    ELSE NULL
  END;

  INSERT INTO public.profiles (id, email, full_name, role, requested_role, approval_status)
  VALUES (NEW.id, NEW.email, profile_full_name, 'owner', profile_requested_role, 'pending')
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(BTRIM(public.profiles.full_name), ''), EXCLUDED.full_name);

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- Users cannot approve themselves. Approval fields change only through an Admin
-- session or the service role (used by the approval server actions).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."guard_profile_approval_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL OR (SELECT private.is_admin()) THEN
    RETURN NEW;
  END IF;

  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Account approval can only be changed by the clinic.';
  END IF;

  IF NEW.requested_role IS DISTINCT FROM OLD.requested_role
     AND OLD.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'The requested role can only be changed while the account is pending.';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."guard_profile_approval_fields"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."guard_profile_approval_fields"() FROM PUBLIC;

CREATE OR REPLACE TRIGGER "guard_profile_approval_fields" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."guard_profile_approval_fields"();


-- ---------------------------------------------------------------------------
-- RLS: give Staff access. "Admin or vet" checks become `is_clinic_member()`,
-- admin-only operational checks become `is_admin_or_staff()`. Profile/role
-- management and the service catalog stay admin-only.
-- ---------------------------------------------------------------------------

-- appointment_schedules
ALTER POLICY "Allow write for staff/admin" ON "public"."appointment_schedules"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

ALTER POLICY "admins manage appointment schedules" ON "public"."appointment_schedules"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"))
    WITH CHECK (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

ALTER POLICY "staff view appointment schedules" ON "public"."appointment_schedules"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- appointment_status_history
ALTER POLICY "staff view appointment status history" ON "public"."appointment_status_history"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- appointments: vets keep the updates the encounter flow needs, but only Admin/Staff
-- can cancel (appointment management is not a veterinarian task).
ALTER POLICY "admins delete appointments" ON "public"."appointments"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

ALTER POLICY "staff manage appointments" ON "public"."appointments"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"))
    WITH CHECK ((( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff") OR ((( SELECT "private"."is_veterinarian"() AS "is_veterinarian")) AND ("status" <> 'cancelled'::"public"."appointment_status"))));

ALTER POLICY "staff view all appointments" ON "public"."appointments"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- clinical_notes
ALTER POLICY "staff manage notes" ON "public"."clinical_notes"
    USING ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "clinical_notes"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))))
    WITH CHECK ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "clinical_notes"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))));

ALTER POLICY "staff view all notes" ON "public"."clinical_notes"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- diagnoses
ALTER POLICY "staff manage diagnoses" ON "public"."diagnoses"
    USING ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "diagnoses"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))))
    WITH CHECK ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "diagnoses"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))));

ALTER POLICY "staff view all diagnoses" ON "public"."diagnoses"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- encounter_amendments
ALTER POLICY "staff insert amendments" ON "public"."encounter_amendments"
    WITH CHECK ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "encounter_amendments"."encounter_id") AND ("e"."status" = 'signed'::"public"."encounter_status"))))));

ALTER POLICY "staff view all amendments" ON "public"."encounter_amendments"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- encounters
ALTER POLICY "admins delete encounters" ON "public"."encounters"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

ALTER POLICY "staff insert encounters" ON "public"."encounters"
    WITH CHECK (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

ALTER POLICY "staff update draft encounters" ON "public"."encounters"
    USING ((("status" = 'draft'::"public"."encounter_status") AND ( SELECT "private"."is_clinic_member"() AS "is_clinic_member")))
    WITH CHECK (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

ALTER POLICY "staff view all encounters" ON "public"."encounters"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- billing
ALTER POLICY "staff manage invoice items" ON "public"."invoice_items"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"))
    WITH CHECK (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

ALTER POLICY "staff manage invoices" ON "public"."invoices"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"))
    WITH CHECK (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

ALTER POLICY "staff manage payments" ON "public"."payments"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"))
    WITH CHECK (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- pets + pet_owners
ALTER POLICY "admins manage pet_owners" ON "public"."pet_owners"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"))
    WITH CHECK (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

ALTER POLICY "admins manage pets" ON "public"."pets"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"))
    WITH CHECK (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

ALTER POLICY "staff view all pets" ON "public"."pets"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- prescriptions
ALTER POLICY "staff manage prescriptions" ON "public"."prescriptions"
    USING ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "prescriptions"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))))
    WITH CHECK ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "prescriptions"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))));

ALTER POLICY "staff view all prescriptions" ON "public"."prescriptions"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- treatments
ALTER POLICY "staff manage treatments" ON "public"."treatments"
    USING ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "treatments"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))))
    WITH CHECK ((( SELECT "private"."is_clinic_member"() AS "is_clinic_member") AND (EXISTS ( SELECT 1
   FROM "public"."encounters" "e"
  WHERE (("e"."id" = "treatments"."encounter_id") AND ("e"."status" = 'draft'::"public"."encounter_status"))))));

ALTER POLICY "staff view all treatments" ON "public"."treatments"
    USING (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

-- profiles: clinic team members are listed to every signed-in user; Staff can read
-- every profile (owners registry, approvals) but cannot change roles.
ALTER POLICY "anyone can view veterinarians" ON "public"."profiles"
    USING (("role" = ANY (ARRAY['veterinarian'::"public"."user_role", 'admin'::"public"."user_role", 'staff'::"public"."user_role"])));

CREATE POLICY "staff view all profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

-- audit logs
ALTER POLICY "Admins can insert schedule audit logs" ON "public"."schedule_audit_logs"
    WITH CHECK (( SELECT "private"."is_clinic_member"() AS "is_clinic_member"));

ALTER POLICY "Admins can view schedule audit logs" ON "public"."schedule_audit_logs"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));

ALTER POLICY "admins view staff audit logs" ON "public"."staff_audit_logs"
    USING (( SELECT "private"."is_admin_or_staff"() AS "is_admin_or_staff"));
