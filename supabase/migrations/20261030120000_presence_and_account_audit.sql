-- Bug fixes (Oct 30): owner online/offline status (#1) and account change logs (#3).

-- ---------------------------------------------------------------------------
-- #1 Presence. The dashboard sends a heartbeat while it is open; an account is
-- "online" when its last heartbeat is recent (the threshold lives in the app).
-- ---------------------------------------------------------------------------

ALTER TABLE "public"."profiles" ADD COLUMN IF NOT EXISTS "last_seen_at" timestamp with time zone;

CREATE OR REPLACE FUNCTION "public"."touch_last_seen"() RETURNS void
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  UPDATE public.profiles SET last_seen_at = now() WHERE id = (SELECT auth.uid());
$$;

ALTER FUNCTION "public"."touch_last_seen"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."touch_last_seen"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_last_seen"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_last_seen"() TO "service_role";


-- ---------------------------------------------------------------------------
-- #3 Account change logs. Written by triggers so every path (Settings, onboarding,
-- password reset) is recorded. Role and approval changes are already logged by
-- the staff/approval server actions, so only personal details are tracked here.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "private"."log_profile_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
DECLARE
  tracked text[] := ARRAY['full_name', 'phone', 'address', 'emergency_contact_name', 'emergency_contact_phone'];
  previous_values jsonb;
  next_values jsonb;
BEGIN
  -- Service-role updates (server actions, tests) log themselves.
  IF (SELECT auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, to_jsonb(NEW) -> o.key)
  INTO previous_values, next_values
  FROM jsonb_each(to_jsonb(OLD)) o
  WHERE o.key = ANY (tracked)
    -- Blank and missing count as the same value (forms submit "" for empty fields).
    AND nullif(btrim(to_jsonb(NEW) ->> o.key), '') IS DISTINCT FROM nullif(btrim(o.value #>> '{}'), '');

  IF previous_values IS NOT NULL THEN
    INSERT INTO public.staff_audit_logs (actor_id, target_profile_id, action, previous_values, next_values)
    VALUES ((SELECT auth.uid()), NEW.id, 'profile_updated', previous_values, next_values);
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."log_profile_update"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."log_profile_update"() FROM PUBLIC;

CREATE OR REPLACE TRIGGER "log_profile_update" AFTER UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."log_profile_update"();


CREATE OR REPLACE FUNCTION "private"."log_auth_credentials_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.encrypted_password IS DISTINCT FROM OLD.encrypted_password THEN
    INSERT INTO public.staff_audit_logs (actor_id, target_profile_id, action)
    VALUES (NEW.id, NEW.id, 'password_changed');
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    INSERT INTO public.staff_audit_logs (actor_id, target_profile_id, action, previous_values, next_values)
    VALUES (NEW.id, NEW.id, 'email_changed', jsonb_build_object('email', OLD.email), jsonb_build_object('email', NEW.email));
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION "private"."log_auth_credentials_update"() OWNER TO "postgres";
REVOKE ALL ON FUNCTION "private"."log_auth_credentials_update"() FROM PUBLIC;

CREATE OR REPLACE TRIGGER "log_auth_credentials_update" AFTER UPDATE OF "encrypted_password", "email" ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "private"."log_auth_credentials_update"();
