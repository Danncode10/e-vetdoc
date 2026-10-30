/** What the sign-up and password-reset forms send for the spam check. */
export type CaptchaSubmission = {
  /** Turnstile token, or the signed token of the built-in math challenge. */
  token: string;
  /** The user's answer to the built-in math challenge. */
  answer?: string;
  /** Honeypot: a hidden field people never see. Bots that fill it are rejected. */
  website?: string;
};

export type CaptchaChallenge =
  | { mode: "turnstile" }
  | {
      mode: "builtin";
      /** The question as an SVG image (data URL), so it is not readable as page text. */
      image: string;
      token: string;
      /** Development and tests only; never sent by a production build. */
      testAnswer?: string;
    };

export const CAPTCHA_FAILED_MESSAGE = "The spam check answer is wrong or expired. Please try the new question.";
