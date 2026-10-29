-- Staff: clinic front-desk role with admin-level access except clinic configuration
-- (team management and the service catalog). Kept in its own migration because a new
-- enum value cannot be referenced in the same transaction that adds it.
ALTER TYPE "public"."user_role" ADD VALUE IF NOT EXISTS 'staff';
