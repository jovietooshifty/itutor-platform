'use client';

/**
 * Log in, all roles — Figma LG01 (64:6973) and the wrong-password state LG02
 * (64:7075).
 *
 * One log-in for students, parents and teachers; where they land is decided
 * by lib/auth/passwordLogin (shared with the old page), so nobody picks a
 * role to log in. The three sign-up buttons skip the role picker and go
 * straight to that account type's form.
 *
 * Not built from the frames, on purpose:
 * - LG02's "After 5 tries, log-in pauses for 10 minutes" — we have no such
 *   rule of our own (Supabase rate-limits, on its own terms), so the line
 *   would be a promise we cannot keep.
 * - "Keep me signed in" is not in the frame, and the old page's default
 *   (off) is kept, so a session behaves exactly as it did.
 */

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { passwordLogin } from '@/lib/auth/passwordLogin';
import {
  AuthAlert,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthInput,
  AuthMain,
  AuthTitle,
  AuthTopBar,
  GoogleButton,
  OrDivider,
  PasswordInput,
  Wordmark,
} from './AuthKit';
import { useParentAccountsFlag } from './useParentAccountsFlag';

const CALLBACK_ERRORS: Record<string, string> = {
  no_session: 'We could not sign you in that way. Log in with your email instead.',
  invalid_callback: 'That sign-in link did not work. Log in below.',
  missing_code: 'That sign-in link did not work. Log in below.',
  profile_fetch_failed: 'We could not load your account. Contact support if this keeps happening.',
  profile_creation_failed: 'We could not set up your account. Try again.',
};

export default function LoginV2() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect');
  const parentAccounts = useParentAccountsFlag();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [badCredentials, setBadCredentials] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // The messages other flows hand over in the URL, same set as the old page.
  useEffect(() => {
    const userEmail = params.get('email');
    if (params.get('confirmed') === 'true') {
      setNotice('Email confirmed. You can log in now.');
      if (userEmail) setEmail(userEmail);
      return;
    }
    if (params.get('reason') === 'email_in_use') {
      if (userEmail) setEmail(userEmail);
      setError('That email already has an account. Log in instead.');
    }
    if (params.get('emailSent') === 'true' && userEmail) {
      setNotice('Account created. Check your email to verify it, then log in.');
      setEmail(userEmail);
    }
    const errorParam = params.get('error');
    if (errorParam) {
      const message = params.get('message');
      setError(
        errorParam === 'oauth_failed'
          ? message
            ? decodeURIComponent(message)
            : 'Google sign-in did not finish. Try again.'
          : CALLBACK_ERRORS[errorParam] ?? 'Something went wrong. Try logging in again.'
      );
    }
  }, [params]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setBadCredentials(false);
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    setBadCredentials(false);
    setNotice('');
    const result = await passwordLogin({ email, password, rememberMe: false, redirect });
    if (result.ok) {
      router.push(result.to); // the spinner stays up while the next page loads
      return;
    }
    if (result.reason === 'credentials') setBadCredentials(true);
    else setError(result.message);
    setBusy(false);
  };

  const signupHref = (role: 'student' | 'parent' | 'tutor') =>
    `/signup?role=${role}${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ''}`;

  return (
    <AuthFrame>
      <AuthTopBar backHref="/" />
      <AuthMain>
        <Wordmark />
        <AuthTitle>Welcome back</AuthTitle>

        {badCredentials && (
          <AuthAlert>
            <strong className="font-extrabold">That email and password don&apos;t match.</strong> Try again, or reset
            your password.
          </AuthAlert>
        )}
        {error && <AuthAlert>{error}</AuthAlert>}
        {notice && <AuthAlert tone="info">{notice}</AuthAlert>}

        {!badCredentials && (
          <>
            <GoogleButton redirect={redirect} />
            <OrDivider />
          </>
        )}

        <form onSubmit={submit} className="flex flex-col gap-[14px]" noValidate>
          <AuthField label="Email" htmlFor="login-email">
            <AuthInput
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </AuthField>
          <AuthField
            label="Password"
            htmlFor="login-password"
            aside={
              <Link href="/forgot-password" className="text-[14px] font-extrabold text-ink underline underline-offset-2">
                Forgot password?
              </Link>
            }
          >
            <PasswordInput
              id="login-password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              invalid={badCredentials}
              disabled={busy}
            />
          </AuthField>
          <AuthButton tone="ink" type="submit" busy={busy}>
            Log in
          </AuthButton>
        </form>

        <div className="flex-1" />

        <section className="flex flex-col gap-[10px] bw-t-hair border-border pt-4">
          <p className="text-center text-[16px] font-extrabold text-ink">New to iTutor? Sign up as a</p>
          <div className="flex gap-ds-2">
            <AuthButton tone="student" href={signupHref('student')} className="flex-1 px-2">
              Student
            </AuthButton>
            {parentAccounts && (
              <AuthButton tone="parent" href={signupHref('parent')} className="flex-1 px-2">
                Parent
              </AuthButton>
            )}
            <AuthButton tone="tutor" href={signupHref('tutor')} className="flex-1 px-2">
              Teacher
            </AuthButton>
          </div>
        </section>
      </AuthMain>
    </AuthFrame>
  );
}
