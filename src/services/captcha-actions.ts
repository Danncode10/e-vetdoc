"use server";

import { createCaptchaChallenge } from "@/services/captcha";
import type { CaptchaChallenge } from "@/lib/captcha";

/** A fresh spam-check challenge for the sign-up and password-reset forms. */
export async function getCaptchaChallenge(): Promise<CaptchaChallenge> {
  return createCaptchaChallenge();
}
