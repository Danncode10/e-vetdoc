'use server';

import { createClient } from '@/utils/supabase/server';
import { verifyRateLimit } from '@/lib/ratelimit';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { isTurnstileEnabled, verifyCaptcha } from '@/services/captcha';
import { CAPTCHA_FAILED_MESSAGE, type CaptchaSubmission } from '@/lib/captcha';
import { isUserRole } from '@/lib/roles';
import { ACCOUNT_STATE_MESSAGES, getAccountState } from '@/lib/account-status';

const MIN_PASSWORD_SCORE = 3;

function captchaError() {
  return isTurnstileEnabled() ? 'Please complete the "I\'m not a robot" check and try again.' : CAPTCHA_FAILED_MESSAGE;
}

function getPasswordScore(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

export async function signInWithEmailRateLimited(email: string, password: string) {
  const { success } = await verifyRateLimit(email, "sign-in");
  if (!success) return { error: 'Too many login attempts. Try again in a few moments.' };

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) return { error: signInError.message };

  // Accounts must be approved by the clinic before they can sign in.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('approval_status, is_active').eq('id', user.id).single()
    : { data: null };
  const accountState = profile ? getAccountState(profile) : 'pending';
  if (accountState !== 'approved') {
    await supabase.auth.signOut();
    return { error: ACCOUNT_STATE_MESSAGES[accountState].message, accountState };
  }

  const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaError) return { error: mfaError.message };

  if (mfaData.nextLevel === 'aal2' && mfaData.nextLevel !== mfaData.currentLevel) {
    return { success: true, requiresMFA: true };
  }

  return { success: true, requiresMFA: false };
}

export async function signUpWithEmailRateLimited(
  email: string,
  password: string,
  origin: string,
  fullName: string | undefined,
  requestedRole: string,
  captcha?: CaptchaSubmission,
) {
  const { success } = await verifyRateLimit(email, "sign-up");
  if (!success) return { error: 'Too many signup attempts. Try again in a few moments.' };
  if (!isUserRole(requestedRole)) {
    return { error: 'Choose what you are registering as.' };
  }
  if (getPasswordScore(password) < MIN_PASSWORD_SCORE) {
    return { error: 'Use a stronger password before creating your account.' };
  }
  if (!(await verifyCaptcha(captcha))) {
    return { error: captchaError() };
  }

  const supabase = await createClient();
  const trimmedFullName = fullName?.trim();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // After user clicks the email link, Supabase will redirect here
      // with ?code=... → our /auth/callback route exchanges it for a session
      // → then redirects to the verified owner's profile-completion flow.
      emailRedirectTo: `${origin}/auth/callback?next=/onboarding`,
      // The requested role is only a request: the account stays pending until an
      // Admin or Staff member approves it (see handle_new_user()).
      data: {
        requested_role: requestedRole,
        ...(trimmedFullName
          ? { full_name: trimmedFullName, name: trimmedFullName, display_name: trimmedFullName }
          : {}),
      },
    },
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function forgotPasswordRateLimited(email: string, redirectUrl: string, captcha?: CaptchaSubmission) {
  const { success } = await verifyRateLimit(email, "password-reset");
  if (!success) return { error: 'Too many password reset attempts. Try again in a few moments.' };
  // Reset emails go to any address typed in, so they need the spam check too.
  if (!(await verifyCaptcha(captcha))) {
    return { error: captchaError() };
  }

  // Recovery emails may be opened in a different browser from the one that
  // requested them. Avoid PKCE's browser-local verifier for this one flow.
  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        flowType: 'implicit',
        persistSession: false,
      },
    },
  );
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: redirectUrl,
  });
  if (error) return { error: error.message };
  return { success: true };
}
