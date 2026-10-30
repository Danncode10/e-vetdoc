'use client';

import { useState, useEffect } from 'react';
import { signInWithOAuthProvider } from '@/services/auth';
import { forgotPasswordRateLimited, signInWithEmailRateLimited, signUpWithEmailRateLimited } from '@/services/auth-server';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2, Check } from 'lucide-react';
import { TurnstileWidget } from '@/components/auth/turnstile-widget';
import { REGISTRATION_ROLES, type UserRole } from '@/lib/roles';

type AuthMode = 'login' | 'signup' | 'recovery';

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" fill="#EA4335" />
    </svg>
  );
}

function getAuthErrorMessage(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong. Please try again.';

  const message = err.message.toLowerCase();
  if (message.includes('user is banned') || message.includes('user_banned')) {
    return 'This account has been deactivated. Contact your clinic administrator to restore access.';
  }
  if (message.includes('fetch failed') || message.includes('failed to fetch')) {
    return 'Could not reach Supabase. Check that the project is active and your environment URL is correct.';
  }
  if (message.includes('invalid login')) {
    return 'The email or password does not match an account.';
  }
  if (message.includes('password')) {
    return 'Use a stronger password before creating your account.';
  }
  if (message.includes('provider') || message.includes('oauth')) {
    return 'Google sign-in is unavailable right now. Please check the provider settings and try again.';
  }

  return err.message;
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [formKey, setFormKey] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [requestedRole, setRequestedRole] = useState<UserRole>('owner');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [resetSentTo, setResetSentTo] = useState('');
  const [error, setError] = useState('');
  const [windowWidth, setWindowWidth] = useState(1024);
  const router = useRouter();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setWindowWidth(window.innerWidth);
      const saved = localStorage.getItem('df_auth_mode');
      if (saved === 'login' || saved === 'signup') setMode(saved);
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'recovery') setMode('recovery');
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const authErrorCode = params.get('error_code') ?? hashParams.get('error_code');
      const authError = params.get('error') ?? hashParams.get('error');

      if (authErrorCode === 'user_banned' || authError === 'User is banned') {
        setError('This account has been deactivated. Contact your clinic administrator to restore access.');
        window.history.replaceState(null, '', window.location.pathname);
      } else if (params.get('error') === 'confirmation_failed') {
        setError('We could not complete that auth link. Please try again.');
      }
    }, 0);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const switchMode = (m: AuthMode) => {
    setMode(m);
    if (m === 'login' || m === 'signup') localStorage.setItem('df_auth_mode', m);
    setFormKey(k => k + 1);
    setError('');
    setSuccess(false);
    setResetSentTo('');
    if (m !== 'recovery') setEmail('');
    setPassword('');
    setName('');
    setRequestedRole('owner');
    setCaptchaToken('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Enter an email address.');
      return;
    }

    if (mode !== 'recovery' && !password) {
      setError('Enter your password.');
      return;
    }

    if (mode === 'signup' && passwordScore < 3) {
      setError('Use at least 3 password requirements before creating an account.');
      return;
    }

    setLoading(true);

    try {
      if (mode === 'recovery') {
        const result = await forgotPasswordRateLimited(email, `${window.location.origin}/reset-password`);
        if (result.error) throw new Error(result.error);
        setResetSentTo(email);
        toast.success('Reset email sent', { description: `Check ${email} for the setup link.` });
      } else if (mode === 'login') {
        const result = await signInWithEmailRateLimited(email, password);
        if (result.error) throw new Error(result.error);
        if (result.requiresMFA) {
          router.push('/auth/mfa');
        } else {
          setSuccess(true);
          setTimeout(() => {
            toast.success('Login successful!');
            router.push('/dashboard');
            router.refresh();
          }, 800);
        }
      } else {
        const result = await signUpWithEmailRateLimited(
          email,
          password,
          window.location.origin,
          name.trim(),
          requestedRole,
          captchaToken,
        );
        if (result.error) {
          // Captcha tokens are single-use, so get a fresh one for the next attempt.
          setCaptchaToken('');
          setCaptchaKey(k => k + 1);
          throw new Error(result.error);
        }
        setSuccess(true);
        setTimeout(() => {
          toast.success('Account created!', { description: 'Confirm your email, then wait for clinic approval.' });
        }, 800);
      }
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setOauthLoading(true);

    try {
      await signInWithOAuthProvider('google');
    } catch (err: unknown) {
      setError(getAuthErrorMessage(err));
      setOauthLoading(false);
    }
  };

  const clearAuthError = () => {
    setError('');
    if (typeof window !== 'undefined' && window.location.search.includes('error=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const isDesktop = windowWidth >= 900;
  const passwordScore = (() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  })();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-background)', color: 'var(--color-foreground)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Grid Background */}
      <div style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        backgroundImage: `linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
        opacity: 0.025,
      }} />

      {/* Glows */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute',
          top: '-10%',
          right: '-8%',
          width: 560,
          height: 560,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          opacity: 0.04,
          filter: 'blur(110px)',
          animation: 'float 9s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-15%',
          left: '-8%',
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'var(--color-primary)',
          opacity: 0.03,
          filter: 'blur(110px)',
          animation: 'float 11s ease-in-out infinite reverse',
        }} />
        <div style={{
          position: 'absolute',
          top: '45%',
          left: '38%',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: 'var(--color-accent)',
          opacity: 0.05,
          filter: 'blur(77px)',
          animation: 'float 13s ease-in-out infinite 3s',
        }} />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', zIndex: 10, flexDirection: isDesktop ? 'row' : 'column' }}>
        {/* Brand Panel - Desktop Only */}
        {isDesktop && (
          <div style={{
            width: 400,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '52px 44px',
            borderRight: '1px solid var(--color-border)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Tint */}
            <div style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: 'linear-gradient(145deg, color-mix(in srgb, var(--color-primary) 8%, transparent) 0%, transparent 55%)',
            }} />

            {/* Orbital Ring */}
            <div style={{
              position: 'absolute',
              top: 100,
              right: -50,
              width: 180,
              height: 180,
              borderRadius: '50%',
              border: '1px solid color-mix(in srgb, var(--color-primary) 18%, transparent)',
              pointerEvents: 'none',
            }}>
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                marginTop: -3.5,
                marginLeft: -3.5,
                animation: 'orbit 5s linear infinite',
                boxShadow: 'none',
              }} />
            </div>

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Logo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 56 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: 14,
                  color: 'var(--color-primary-foreground)',
                  boxShadow: '0 8px 18px color-mix(in srgb, var(--color-primary) 18%, transparent)',
                }}>E</div>
                <span style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: -0.025, color: 'var(--color-foreground)' }}>E-VetDoc</span>
                <span style={{
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: 'var(--color-accent)',
                  border: '1px solid var(--color-border)',
                  fontSize: 10,
                  color: 'var(--color-primary)',
                  letterSpacing: 0.06,
                }}>Clinic portal</span>
              </div>

              {/* Headline */}
              <h1 style={{ fontSize: 32, fontWeight: 'bold', lineHeight: 1.18, marginBottom: 14, letterSpacing: -0.03 }}>
                Care for every pet.
                <br />
                <span style={{
                  background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary), var(--color-primary))',
                  backgroundSize: '200% auto',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  animation: 'shimmer 3s linear infinite',
                }}>With clarity.</span>
              </h1>

              <p style={{ fontSize: 13.5, color: 'var(--color-muted-foreground)', lineHeight: 1.7, maxWidth: 290, marginBottom: 36 }}>
                One secure workspace for appointments, pet records, billing, and the people who care for them.
              </p>

              {/* Features */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {['Secure accounts for pet owners', 'Role-aware access for clinic staff', 'Appointments and records in one place', 'Clear billing and receipt history'].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      background: 'var(--color-accent)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-primary)',
                      flexShrink: 0,
                    }}>
                      <Check size={11} />
                    </div>
                    <span style={{ fontSize: 13, color: 'var(--color-muted-foreground)', lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Chip */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 15px',
              borderRadius: 10,
              background: 'var(--color-accent)',
              border: '1px solid var(--color-border)',
              position: 'relative',
              zIndex: 1,
            }}>
              <div style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--color-primary)',
                flexShrink: 0,
                boxShadow: 'none',
                animation: 'pulse-dot 2s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>Secure clinic workspace</span>
            </div>
          </div>
        )}

        {/* Form Section */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: isDesktop ? 'center' : 'flex-start',
          padding: isDesktop ? '40px 44px' : '24px 20px 28px',
          position: 'relative',
          zIndex: 10,
        }}>
          <div style={{ width: '100%', maxWidth: 400, animation: 'fadeUp 0.45s ease both' }}>
            {!isDesktop && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 22 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: 13,
                  color: 'var(--color-primary-foreground)',
                  boxShadow: '0 8px 18px color-mix(in srgb, var(--color-primary) 18%, transparent)',
                }}>E</div>
                <span style={{ fontSize: 17, fontWeight: 'bold', letterSpacing: -0.025, color: 'var(--color-foreground)' }}>E-VetDoc</span>
                <span style={{
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: 'var(--color-accent)',
                  border: '1px solid var(--color-border)',
                  fontSize: 10,
                  color: 'var(--color-primary)',
                  letterSpacing: 0.06,
                }}>Clinic portal</span>
              </div>
            )}
            {/* Tabs */}
            {mode !== 'recovery' && (
            <div style={{
              display: 'flex',
              background: 'var(--color-muted)',
              borderRadius: 11,
              padding: 3,
              marginBottom: 32,
              border: '1px solid var(--color-border)',
              gap: 4,
            }}>
              {(['login', 'signup'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    background: mode === m ? 'var(--color-primary)' : 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                    color: mode === m ? 'var(--color-primary-foreground)' : 'var(--color-muted-foreground)',
                    fontWeight: 600,
                    fontSize: 13,
                    transition: 'all 0.2s',
                    boxShadow: mode === m ? '0 4px 12px color-mix(in srgb, var(--color-primary) 22%, transparent)' : 'none',
                  }}
                >
                  {m === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>
            )}

            {/* Heading */}
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 26, fontWeight: 'bold', letterSpacing: -0.025, marginBottom: 5, color: 'var(--color-foreground)' }}>
                {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--color-muted-foreground)', lineHeight: 1.55 }}>
                {mode === 'login'
                  ? 'Sign in to manage appointments, care records, and clinic updates.'
                  : mode === 'signup'
                    ? 'Create an account to access your pet care information securely.'
                    : email
                      ? `Send a secure reset link to ${email}.`
                      : 'Enter your account email and we will send a secure reset link.'}
              </p>
            </div>

            {/* Success State */}
            {resetSentTo ? (
              <div style={{
                padding: 28,
                borderRadius: 12,
                textAlign: 'center',
                background: 'rgba(34,197,94,0.07)',
                border: '1px solid rgba(34,197,94,0.22)',
                animation: 'fadeUp 0.35s ease both',
              }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
                <p style={{ fontWeight: 600, marginBottom: 5, color: 'var(--color-foreground)' }}>
                  Reset email sent
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)', lineHeight: 1.55 }}>
                  We sent a reset link to {resetSentTo}. Open it to choose a new password.
                </p>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  style={{
                    marginTop: 18,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-primary)',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Back to Sign In
                </button>
              </div>
            ) : success ? (
              <div style={{
                padding: 28,
                borderRadius: 12,
                textAlign: 'center',
                background: 'rgba(34,197,94,0.07)',
                border: '1px solid rgba(34,197,94,0.22)',
                animation: 'fadeUp 0.35s ease both',
              }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>✓</div>
                <p style={{ fontWeight: 600, marginBottom: 5, color: 'var(--color-foreground)' }}>
                  {mode === 'login' ? 'Welcome back!' : 'Account created!'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--color-muted-foreground)' }}>
                  {mode === 'login'
                    ? 'Opening your clinic workspace…'
                    : 'Check your email to confirm your account. An Admin or Staff member must approve it before you can sign in.'}
                </p>
              </div>
            ) : (
              <form key={formKey} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {mode === 'signup' && (
                  <fieldset style={{ border: 'none', margin: 0, padding: 0, animation: 'slideIn 0.25s ease both' }}>
                    <legend style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: 0.08, textTransform: 'uppercase', color: 'var(--color-muted-foreground)', marginBottom: 6, padding: 0 }}>
                      Register as
                    </legend>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                      {REGISTRATION_ROLES.map(option => {
                        const selected = requestedRole === option.value;
                        return (
                          <label
                            key={option.value}
                            htmlFor={`register-as-${option.value}`}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'auto 1fr',
                              columnGap: 8,
                              rowGap: 2,
                              alignItems: 'center',
                              minHeight: 48,
                              padding: '10px 12px',
                              borderRadius: 9,
                              cursor: 'pointer',
                              background: selected ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-card))' : 'var(--color-card)',
                              border: `1px solid ${selected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                              boxShadow: selected ? '0 0 0 1px var(--color-primary)' : 'none',
                              transition: 'all 0.18s',
                            }}
                          >
                            <input
                              id={`register-as-${option.value}`}
                              type="radio"
                              name="requested_role"
                              value={option.value}
                              checked={selected}
                              onChange={() => setRequestedRole(option.value)}
                              style={{ margin: 0, width: 16, height: 16, accentColor: 'var(--color-primary)' }}
                            />
                            <span style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--color-primary)' : 'var(--color-foreground)' }}>
                              {option.label}
                            </span>
                            <span style={{ gridColumn: '1 / -1', fontSize: 11, lineHeight: 1.35, color: 'var(--color-muted-foreground)' }}>
                              {option.description}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p style={{ fontSize: 11, marginTop: 6, color: 'var(--color-muted-foreground)' }}>
                      New accounts stay pending until an Admin or Staff member approves them.
                    </p>
                  </fieldset>
                )}

                {mode === 'signup' && (
                  <div style={{ animation: 'slideIn 0.25s ease both' }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: 0.08, textTransform: 'uppercase', color: 'var(--color-muted-foreground)', marginBottom: 6 }}>
                      Full name
                    </label>
                    <div style={{ position: 'relative' }}>
                      <User size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted-foreground)', pointerEvents: 'none' }} />
                      <input
                        id="name"
                        name="name"
                        autoComplete="name"
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onFocus={clearAuthError}
                        placeholder="Full name"
                        style={{
                          width: '100%',
                          paddingLeft: 40,
                          paddingRight: 14,
                          paddingTop: 12,
                          paddingBottom: 12,
                          background: 'var(--color-card)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 9,
                          color: 'var(--color-foreground)',
                          fontSize: 14,
                          outline: 'none',
                          transition: 'all 0.18s',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: 0.08, textTransform: 'uppercase', color: 'var(--color-muted-foreground)', marginBottom: 6 }}>
                    Email address
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted-foreground)', pointerEvents: 'none' }} />
                    <input
                      id="email"
                      name="email"
                      autoComplete="email"
                      type="email"
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value);
                        clearAuthError();
                        setResetSentTo('');
                      }}
                      onFocus={clearAuthError}
                      placeholder="you@example.com"
                      required
                      style={{
                        width: '100%',
                        paddingLeft: 40,
                        paddingRight: 14,
                        paddingTop: 12,
                        paddingBottom: 12,
                        background: 'var(--color-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 9,
                        color: 'var(--color-foreground)',
                        fontSize: 14,
                        outline: 'none',
                        transition: 'all 0.18s',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {mode !== 'recovery' && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: 0.08, textTransform: 'uppercase', color: 'var(--color-muted-foreground)', marginBottom: 6 }}>
                    Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted-foreground)', pointerEvents: 'none' }} />
                    <input
                      id="password"
                      name="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => {
                        setPassword(e.target.value);
                        clearAuthError();
                      }}
                      onFocus={clearAuthError}
                      placeholder={mode === 'login' ? '••••••••' : 'Min. 8 characters'}
                      required
                      style={{
                        width: '100%',
                        paddingLeft: 40,
                        paddingRight: 40,
                        paddingTop: 12,
                        paddingBottom: 12,
                        background: 'var(--color-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 9,
                        color: 'var(--color-foreground)',
                        fontSize: 14,
                        outline: 'none',
                        transition: 'all 0.18s',
                        boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: 12,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-muted-foreground)',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  {mode === 'signup' && (
                    <div style={{ marginTop: 7 }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[0, 1, 2, 3].map(i => {
                          const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
                          const visualScore = password ? Math.max(1, passwordScore) : 0;
                          return (
                            <div key={i} style={{
                              flex: 1,
                              height: 3,
                              borderRadius: 2,
                              background: i < visualScore ? colors[visualScore - 1] : 'var(--color-border)',
                              transition: 'background 0.25s',
                            }} />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                )}

                {mode === 'login' && (
                  <div style={{ textAlign: 'right', marginTop: -4 }}>
                    <button type="button" onClick={() => switchMode('recovery')} style={{ fontSize: 11, color: 'var(--color-muted-foreground)', textDecoration: 'none', letterSpacing: 0.05, transition: 'color 0.2s', cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }} onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)'} onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-muted-foreground)'}>
                      FORGOT PASSWORD?
                    </button>
                  </div>
                )}

                {mode === 'signup' && <TurnstileWidget key={captchaKey} onToken={setCaptchaToken} />}

                {error && (
                  <div style={{
                    padding: '10px 13px',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,0.07)',
                    border: '1px solid rgba(239,68,68,0.22)',
                    fontSize: 12,
                    color: '#f87171',
                  }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '13px 0',
                    marginTop: 2,
                    background: loading ? 'color-mix(in srgb, var(--color-primary) 45%, var(--color-muted))' : 'var(--color-primary)',
                    border: 'none',
                    borderRadius: 10,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    color: 'var(--color-primary-foreground)',
                    fontWeight: 700,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: loading ? 'none' : '0 8px 18px color-mix(in srgb, var(--color-primary) 18%, transparent)',
                    transition: 'all 0.18s',
                  }}
                  onMouseEnter={e => { if (!loading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 22px color-mix(in srgb, var(--color-primary) 22%, transparent)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 18px color-mix(in srgb, var(--color-primary) 18%, transparent)'; }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} style={{ animation: 'spin 0.75s linear infinite' }} />
                      Processing…
                    </>
                  ) : (
                    <>
                      {mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                {mode === 'signup' && (
                  <p style={{ fontSize: 11, color: 'var(--color-muted-foreground)', textAlign: 'center', lineHeight: 1.55 }}>
                    By signing up you agree to the{' '}
                    <Link href="#" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>Terms</Link>{' '}and{' '}
                    <Link href="#" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>Privacy Policy</Link>.
                  </p>
                )}
              </form>
            )}

            {mode === 'recovery' ? (
              <button
                type="button"
                onClick={() => switchMode('login')}
                style={{
                  width: '100%',
                  marginTop: 18,
                  padding: '12px 0',
                  background: 'transparent',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  color: 'var(--color-muted-foreground)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Back to Sign In
              </button>
            ) : (
            <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              <span style={{ fontSize: 10, color: 'var(--color-muted-foreground)' }}>OR</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>

            <button type="button" disabled={oauthLoading || loading} onClick={handleGoogleSignIn} style={{
              width: '100%',
              padding: '12px 0',
              background: 'var(--color-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              color: 'var(--color-foreground)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 9,
              transition: 'all 0.18s',
            }} onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.background = 'var(--color-muted)'; }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'var(--color-card)'; }}>
              {oauthLoading ? <Loader2 size={16} style={{ animation: 'spin 0.75s linear infinite' }} /> : <GoogleIcon />}
              Continue with Google
            </button>
            </>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        borderTop: '1px solid var(--color-border)',
        padding: '10px 44px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        background: 'var(--color-muted)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-muted-foreground)' }}>© 2026 E-VetDoc</span>
        <div style={{ display: 'flex', gap: 18 }}>
          {['Privacy', 'Terms'].map(l => (
            <Link key={l} href="#" style={{ fontSize: 11, color: 'var(--color-muted-foreground)', textDecoration: 'none', transition: 'color 0.2s', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary)'} onMouseLeave={e => e.currentTarget.style.color = 'var(--color-muted-foreground)'}>{l}</Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes float { 0%, 100% { transform: translateY(0px) scale(1); } 50% { transform: translateY(-24px) scale(1.04); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes orbit { from { transform: rotate(0deg) translateX(72px) rotate(0deg); } to { transform: rotate(360deg) translateX(72px) rotate(-360deg); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
