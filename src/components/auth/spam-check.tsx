'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { getCaptchaChallenge } from '@/services/captcha-actions';
import type { CaptchaChallenge, CaptchaSubmission } from '@/lib/captcha';

/**
 * Spam check for sign-up and password reset: Cloudflare Turnstile when it is configured,
 * otherwise a built-in math question drawn as an image. Both include a hidden honeypot
 * field. Challenges are single use, so remount this (change its `key`) after each submit.
 */
export function SpamCheck({ onChange }: { onChange: (value: CaptchaSubmission) => void }) {
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [answer, setAnswer] = useState('');
  const [website, setWebsite] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    const loadChallenge = async () => {
      try {
        const next = await getCaptchaChallenge();
        if (cancelled) return;
        setChallenge(next);
        setAnswer('');
        setLoadFailed(false);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    };
    void loadChallenge();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!challenge) return;
    onChangeRef.current(
      challenge.mode === 'builtin'
        ? { token: challenge.token, answer, website }
        : { token: turnstileToken, website },
    );
  }, [challenge, answer, website, turnstileToken]);

  const honeypot = (
    <div aria-hidden="true" className="sr-only">
      <label htmlFor="captcha-website">Leave this field empty</label>
      <input
        id="captcha-website"
        name="website"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
      />
    </div>
  );

  if (loadFailed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 text-xs text-destructive">
        Could not load the spam check.
        <Button type="button" variant="outline" className="min-h-12" onClick={() => setReload((value) => value + 1)}>
          Try again
        </Button>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="flex min-h-16 items-center gap-2 text-xs text-muted-foreground" data-testid="spam-check-loading">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading spam check…
      </div>
    );
  }

  if (challenge.mode === 'turnstile') {
    return (
      <>
        {honeypot}
        <TurnstileWidget onToken={setTurnstileToken} />
      </>
    );
  }

  return (
    <div data-testid="spam-check" data-test-answer={challenge.testAnswer} className="space-y-2">
      {honeypot}
      <label htmlFor="captcha-answer" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Spam check — solve the question
      </label>
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- a generated data URL, nothing to optimize */}
        <img
          src={challenge.image}
          alt="Math question: type the answer in the box below"
          data-testid="spam-check-image"
          className="h-16 w-auto rounded-lg border border-border"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-12 w-12 shrink-0"
          aria-label="Show a different question"
          onClick={() => setReload((value) => value + 1)}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      <input
        id="captcha-answer"
        name="captcha-answer"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        value={answer}
        onChange={(event) => setAnswer(event.target.value.replace(/\D/g, ''))}
        placeholder="Answer"
        className="min-h-12 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
