import "server-only";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

/**
 * Verify a Cloudflare Turnstile token. When the keys are not configured the
 * captcha is disabled and every request passes, so local setups keep working.
 */
export async function verifyCaptcha(token: string | undefined): Promise<boolean> {
  if (!isCaptchaEnabled()) return true;
  if (!token) return false;

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token }),
      cache: "no-store",
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
