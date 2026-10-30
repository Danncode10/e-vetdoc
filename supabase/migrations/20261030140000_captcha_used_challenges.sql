-- Built-in captcha: every solved challenge can be used once (stops a bot from reusing one
-- human-solved answer to send many sign-ups or reset emails). The table lives in the
-- private schema, which the public API cannot reach; the server calls the function below
-- with the service role.

CREATE TABLE IF NOT EXISTS "private"."captcha_used_challenges" (
    "nonce" "text" PRIMARY KEY,
    "used_at" timestamp with time zone NOT NULL DEFAULT "now"()
);

ALTER TABLE "private"."captcha_used_challenges" ENABLE ROW LEVEL SECURITY;

-- Returns true the first time a challenge is used, false on every reuse.
CREATE OR REPLACE FUNCTION "public"."consume_captcha_challenge"("p_nonce" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'private', 'pg_temp'
    AS $$
DECLARE
  inserted integer;
BEGIN
  -- Challenges expire after 10 minutes, so anything older than a day is safe to forget.
  DELETE FROM private.captcha_used_challenges WHERE used_at < now() - interval '1 day';

  INSERT INTO private.captcha_used_challenges (nonce) VALUES (p_nonce)
  ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted = 1;
END;
$$;

ALTER FUNCTION "public"."consume_captcha_challenge"("p_nonce" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."consume_captcha_challenge"("p_nonce" "text") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."consume_captcha_challenge"("p_nonce" "text") TO "service_role";
