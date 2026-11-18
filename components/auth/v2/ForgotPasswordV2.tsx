'use client';

/**
 * Reset your password — Figma LG03 (64:7144) and Reset link sent, LG04
 * (64:7194).
 *
 * Same Supabase call as the old page; the link lands on /reset-password.
 * "The link works for 1 hour" is Supabase's recovery-link lifetime, which the
 * old page also states. Resend unlocks after 60 seconds, as before.
 *
 * LG04's "Open email app" button is not built: a web page cannot open a
 * phone's inbox (mailto: opens a blank new message instead), so the button
 * would not do what it says.
 */

import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { isNetworkError } from '@/lib/auth/passwordLogin';
import {
  AuthAlert,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthInput,
  AuthLead,
  AuthMain,
  AuthTitle,
  AuthTopBar,
  ULink,
  Wordmark,
} from './AuthKit';

export default function ForgotPasswordV2() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async (): Promise<boolean> => {
    setBusy(true);
    setError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(resetError.message);
        return false;
      }
      setCooldown(60);
      return true;
    } catch (err) {
      setError(isNetworkError(err) ? 'Connect to the Internet and try again.' : 'We could not send the email. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter the email you log in with.');
      return;
    }
    if (await send()) setSent(true);
  };

  const mm = Math.floor(cooldown / 60);
  const ss = String(cooldown % 60).padStart(2, '0');

  if (sent) {
    return (
      <AuthFrame>
        <AuthTopBar onBack={() => setSent(false)} />
        <AuthMain>
          <Wordmark />
          <AuthTitle>Check your inbox</AuthTitle>
          <AuthLead>We sent you a link to reset your password.</AuthLead>
          <div className="flex items-center gap-[14px] rounded-[10px] bw-bold border-ink bg-surface-card p-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[8px] bw-bold border-ink">
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <path d="M3.5 6.5L12 13l8.5-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block break-words text-[16px] font-extrabold text-ink">{email.trim()}</span>
              <span className="block text-[14px] text-ink-muted">The link works for 1 hour</span>
            </span>
          </div>
          {error && <AuthAlert>{error}</AuthAlert>}
          {resent && !error && <AuthAlert tone="info">Sent again. Check your spam folder too.</AuthAlert>}
          <AuthButton
            tone="outline"
            busy={busy}
            disabled={cooldown > 0}
            waiting={cooldown > 0}
            onClick={async () => {
              setResent(false);
              if (await send()) setResent(true);
            }}
          >
            {cooldown > 0 ? `Resend in ${mm}:${ss}` : 'Resend link'}
          </AuthButton>
          <div className="flex-1" />
          <div className="flex justify-center">
            <ULink href="/login">Back to log in</ULink>
          </div>
        </AuthMain>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <AuthTopBar backHref="/login" />
      <AuthMain>
        <Wordmark />
        <AuthTitle>Reset your password</AuthTitle>
        <AuthLead>We&apos;ll email you a link to set a new one.</AuthLead>
        {error && <AuthAlert>{error}</AuthAlert>}
        <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
          <AuthField label="Email" htmlFor="fp-email">
            <AuthInput
              id="fp-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </AuthField>
          <AuthButton tone="ink" type="submit" busy={busy} disabled={!email.trim()}>
            Send reset link
          </AuthButton>
        </form>
        <div className="flex-1" />
        <div className="flex justify-center">
          <ULink href="/login">Back to log in</ULink>
        </div>
      </AuthMain>
    </AuthFrame>
  );
}
