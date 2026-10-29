import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';
import type { Database } from '../../src/types/supabase';

type UserRole = Database['public']['Enums']['user_role'];

export const TEST_PASSWORD = 'E2e-Approval-Pass1!';

export const accounts = {
  admin: { email: process.env.TEST_ADMIN_EMAIL!, password: process.env.TEST_ADMIN_PASSWORD! },
  staff: { email: process.env.TEST_STAFF_EMAIL!, password: process.env.TEST_STAFF_PASSWORD! },
  vet: { email: process.env.TEST_VET_EMAIL!, password: process.env.TEST_VET_PASSWORD! },
  owner: { email: process.env.TEST_OWNER_EMAIL!, password: process.env.TEST_OWNER_PASSWORD! },
};

/** Service-role client: bypasses RLS, used only for test setup and assertions. */
export function serviceDb(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** A client signed in as a real user, so every query goes through RLS. */
export async function userDb(email: string, password: string): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return client;
}

export function uniqueEmail(label: string) {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
}

/**
 * Creates a confirmed account exactly like the sign-up trigger would (pending,
 * least-privilege). Pass `approveAs` to approve it with that role right away.
 */
export async function createAccount(options: {
  email?: string;
  requestedRole?: UserRole;
  fullName?: string;
  approveAs?: UserRole;
}) {
  const db = serviceDb();
  const email = options.email ?? uniqueEmail(options.requestedRole ?? 'user');
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: options.fullName ?? 'E2E Test User',
      ...(options.requestedRole ? { requested_role: options.requestedRole } : {}),
    },
  });
  if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`);

  if (options.approveAs) {
    const { error: approveError } = await db
      .from('profiles')
      .update({
        role: options.approveAs,
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        phone: '09170000000',
        address: '1 Test Street',
      })
      .eq('id', data.user.id);
    if (approveError) throw approveError;
  }

  return { id: data.user.id, email, password: TEST_PASSWORD };
}

export async function deleteAccounts(ids: string[]) {
  const db = serviceDb();
  for (const id of ids) {
    await db.from('staff_audit_logs').delete().or(`actor_id.eq.${id},target_profile_id.eq.${id}`);
    await db.auth.admin.deleteUser(id);
  }
}

export async function getProfile(id: string) {
  const { data, error } = await serviceDb().from('profiles').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  const signInTab = page.getByRole('button', { name: 'Sign In', exact: true }).first();
  if (await signInTab.isVisible().catch(() => false)) await signInTab.click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('button[type="submit"]').click();
}

export async function loginAndOpenDashboard(page: Page, email: string, password: string) {
  await loginThroughUi(page, email, password);
  await page.waitForURL('**/dashboard**', { timeout: 20000 });
  await expect(page.getByText('Overview').first()).toBeVisible({ timeout: 20000 });
}
