import "server-only";

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/server";
import type { CaptchaChallenge, CaptchaSubmission } from "@/lib/captcha";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const CHALLENGE_TTL_MS = 10 * 60_000;

/**
 * Cloudflare Turnstile is used when both keys are configured. Otherwise the built-in math
 * challenge protects the forms, so production is never left without a spam check.
 */
export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export function createCaptchaChallenge(): CaptchaChallenge {
  if (isTurnstileEnabled()) return { mode: "turnstile" };

  const first = randomInt(2, 10);
  const second = randomInt(1, 10);
  const add = randomInt(0, 2) === 0;
  const [left, right] = add ? [first, second] : [Math.max(first, second), Math.min(first, second)];
  const answer = add ? left + right : left - right;

  const payload = Buffer.from(
    JSON.stringify({ n: randomBytes(12).toString("base64url"), e: Date.now() + CHALLENGE_TTL_MS }),
  ).toString("base64url");
  const svg = renderChallengeSvg(`${left}${add ? "+" : "-"}${right}=?`);

  return {
    mode: "builtin",
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    token: `${payload}.${sign(payload, String(answer))}`,
    ...(process.env.NODE_ENV !== "production" ? { testAnswer: String(answer) } : {}),
  };
}

/** Checks the honeypot, then Turnstile or the built-in challenge (single use). */
export async function verifyCaptcha(submission: CaptchaSubmission | undefined): Promise<boolean> {
  if (!submission?.token) return false;
  if (submission.website?.trim()) return false;
  if (isTurnstileEnabled()) return verifyTurnstile(submission.token);
  return verifyBuiltin(submission.token, submission.answer);
}

async function verifyTurnstile(token: string): Promise<boolean> {
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

async function verifyBuiltin(token: string, answer: string | undefined): Promise<boolean> {
  const [payload, signature] = token.split(".");
  const normalized = (answer ?? "").trim();
  if (!payload || !signature || !/^\d{1,2}$/.test(normalized)) return false;

  const expected = Buffer.from(sign(payload, String(Number(normalized))));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;

  let challenge: { n?: string; e?: number };
  try {
    challenge = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (!challenge.n || !challenge.e || challenge.e < Date.now()) return false;

  // Each solved challenge works once.
  const { data, error } = await createAdminClient().rpc("consume_captcha_challenge", { p_nonce: challenge.n });
  if (error) {
    console.error("consume_captcha_challenge failed:", error.message);
    return false;
  }
  return data === true;
}

function captchaKey() {
  // CAPTCHA_SECRET is optional; by default a key is derived from the service-role key,
  // which every deployment already has, so the captcha works with no extra setup.
  const base = process.env.CAPTCHA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("Set CAPTCHA_SECRET or SUPABASE_SERVICE_ROLE_KEY to enable the spam check.");
  return createHmac("sha256", base).update("e-vetdoc-captcha-v1").digest();
}

function sign(payload: string, answer: string) {
  return createHmac("sha256", captchaKey()).update(`${payload}|${answer}`).digest("base64url");
}

// ── Challenge image ─────────────────────────────────────────────────────────
// Characters are drawn as jittered strokes (not <text>), rotated, over noise lines, so the
// question cannot simply be read out of the page.

type Stroke = Array<[number, number]>;

const GLYPHS: Record<string, Stroke[]> = {
  "0": [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]],
  "1": [[[1, 1], [2, 0], [2, 6]], [[1, 6], [3, 6]]],
  "2": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  "3": [[[0, 0], [4, 0], [2, 2.8], [4, 4], [4, 5], [3, 6], [0, 6]]],
  "4": [[[3, 6], [3, 0], [0, 4], [4, 4]]],
  "5": [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]],
  "6": [[[4, 0], [1, 0], [0, 2], [0, 6], [4, 6], [4, 3], [0, 3]]],
  "7": [[[0, 0], [4, 0], [1.5, 6]]],
  "8": [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[0, 3], [4, 3]]],
  "9": [[[4, 3], [0, 3], [0, 0], [4, 0], [4, 6], [0, 6]]],
  "+": [[[2, 1.5], [2, 4.5]], [[0.5, 3], [3.5, 3]]],
  "-": [[[0.5, 3], [3.5, 3]]],
  "=": [[[0.5, 2], [3.5, 2]], [[0.5, 4], [3.5, 4]]],
  "?": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [2, 3.5], [2, 4.6]], [[2, 5.5], [2, 6]]],
};

const jitter = (amount: number) => (Math.random() - 0.5) * 2 * amount;

function renderChallengeSvg(text: string) {
  const cell = 30;
  const width = text.length * cell + 20;
  const height = 64;
  const parts: string[] = [];

  for (let i = 0; i < 6; i++) {
    parts.push(
      `<path d="M${jitter(5) + 2} ${randomInt(8, height - 8)} Q ${width / 2 + jitter(40)} ${randomInt(0, height)} ${width - 2 + jitter(5)} ${randomInt(8, height - 8)}" stroke="#94a3b8" stroke-width="1.2" fill="none" opacity="0.7"/>`,
    );
  }
  for (let i = 0; i < 24; i++) {
    parts.push(`<circle cx="${randomInt(0, width)}" cy="${randomInt(0, height)}" r="${(Math.random() * 1.6 + 0.6).toFixed(1)}" fill="#64748b" opacity="0.5"/>`);
  }

  [...text].forEach((char, index) => {
    const scale = 5 + jitter(0.6);
    const originX = 12 + index * cell + jitter(3);
    const originY = 16 + jitter(4);
    const rotate = jitter(16).toFixed(1);
    const centerX = originX + 2 * scale;
    const centerY = originY + 3 * scale;
    const strokes = (GLYPHS[char] ?? [])
      .map((stroke) =>
        stroke.map(([x, y], pointIndex) => `${pointIndex ? "L" : "M"}${(originX + x * scale + jitter(1.2)).toFixed(1)} ${(originY + y * scale + jitter(1.2)).toFixed(1)}`).join(" "),
      )
      .join(" ");
    parts.push(
      `<path d="${strokes}" transform="rotate(${rotate} ${centerX.toFixed(1)} ${centerY.toFixed(1)})" stroke="#0f3d3e" stroke-width="${(2.6 + jitter(0.4)).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="8" fill="#f1f5f9"/>${parts.join("")}</svg>`;
}
