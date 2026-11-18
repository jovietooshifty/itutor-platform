'use client';

/**
 * Set a new password, new UI — the screen the reset email opens (/reset-password).
 * Figma LG04's note points at an "AU08 new password" frame that is not in the
 * file, so this is built from the same set's pieces (LG03 layout): PROVISIONAL.
 *
 * Same logic as the old page, step for step: needs the recovery session the
 * link creates; 8+ characters, typed twice; supabase.auth.updateUser; then
 * POST /api/parent/self-pay/revoke-all (awaited, never blocking — the §7
 * recovery path), then on to /login.
 */

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  AuthAlert,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthLead,
  AuthMain,
  AuthTitle,
  AuthTopBar,
  PasswordInput,
  Spinner,
  ULink,
  Wordmark,
} from './AuthKit';

export default function ResetPasswordV2() {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setState(session ? 'ready' : 'invalid'))
      .catch(() => setState('invalid'));
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        setBusy(false);
        return;
      }
      try {
        await fetch('/api/parent/self-pay/revoke-all', { method: 'POST' });
      } catch {
        // A completed password change must not look broken because this failed.
      }
      setState('done');
      setTimeout(() => router.push('/login'), 3000);
    } catch {
      setError('We could not change your password. Try again.');
      setBusy(false);
    }
  };

  return (
    <AuthFrame>
      <AuthTopBar backHref="/login" />
      <AuthMain>
        <Wordmark />
        {state === 'checking' ? (
          <>
            <AuthTitle>Checking your link</AuthTitle>
            <span className="text-ink-muted">
              <Spinner />
            </span>
          </>
        ) : state === 'invalid' ? (
          <>
            <AuthTitle>This link has expired</AuthTitle>
            <AuthLead>Reset links work once, for 1 hour. Ask for a new one and use the newest email.</AuthLead>
            <AuthButton tone="ink" href="/forgot-password">
              Send a new link
            </AuthButton>
            <div className="flex-1" />
            <div className="flex justify-center">
              <ULink href="/login">Back to log in</ULink>
            </div>
          </>
        ) : state === 'done' ? (
          <>
            <AuthTitle>Password changed</AuthTitle>
            <AuthLead>Taking you to log in…</AuthLead>
            <AuthButton tone="ink" href="/login">
              Log in now
            </AuthButton>
          </>
        ) : (
          <>
            <AuthTitle>Set a new password</AuthTitle>
            <AuthLead>Use at least 8 characters.</AuthLead>
            {error ? <AuthAlert>{error}</AuthAlert> : null}
            <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
              <AuthField
                label="New password"
                htmlFor="rp-new"
                hint="At least 8 characters"
                ok={password.length >= 8 ? '8 characters or more' : undefined}
              >
                <PasswordInput id="rp-new" value={password} onChange={setPassword} autoComplete="new-password" placeholder="New password" disabled={busy} />
              </AuthField>
              <AuthField
                label="Type it again"
                htmlFor="rp-confirm"
                error={confirm && password !== confirm ? 'Doesn’t match yet' : undefined}
                ok={confirm && password === confirm ? 'Matches' : undefined}
              >
                <PasswordInput id="rp-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" placeholder="Same password" disabled={busy} />
              </AuthField>
              <AuthButton tone="ink" type="submit" busy={busy}>
                Change password
              </AuthButton>
            </form>
          </>
        )}
      </AuthMain>
    </AuthFrame>
  );
}
