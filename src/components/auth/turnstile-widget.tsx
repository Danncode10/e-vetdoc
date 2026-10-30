'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type TurnstileOptions = {
  sitekey: string;
  theme?: 'auto' | 'light' | 'dark';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
};

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: TurnstileOptions) => string;
      remove: (widgetId: string) => void;
    };
  }
}

/**
 * Cloudflare Turnstile "I'm not a robot" check. Renders nothing when no site key
 * is configured. Remount it (change its `key`) to get a fresh single-use token.
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  // The script may already be loaded when the widget remounts for a fresh token.
  const [scriptReady, setScriptReady] = useState(() => typeof window !== 'undefined' && Boolean(window.turnstile));

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) return;
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: 'auto',
      callback: (token) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(''),
      'error-callback': () => onTokenRef.current(''),
    });
    return () => window.turnstile?.remove(widgetId);
  }, [siteKey, scriptReady]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} data-testid="signup-captcha" style={{ minHeight: 65 }} />
    </>
  );
}
