'use client';

/**
 * Security — frame `160:8156`. Settings › Security.
 *
 * REAL, unlike the old Settings › Security section, whose three password
 * boxes and button had no handler at all. Update password re-checks the
 * current password with signInWithPassword, then calls updateUser. The frame
 * has no email field, so email change is not offered here.
 *
 * Accounts that sign in with Google have no password to check. For them the
 * form is replaced by a note (PROVISIONAL copy, no frame) rather than a form
 * that can only ever say "Current password is incorrect".
 *
 * Deviations: back link reads "Settings" with "Security" as the page title;
 * Cancel returns to Settings.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { FloatField, FormError, FormNote } from './accountKit';

export default function ParentSecurityV2() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      setEmail(user?.email ?? null);
      const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
      const identities = user?.identities?.map((i) => i.provider) ?? [];
      setHasPassword(providers.includes('email') || identities.includes('email'));
    })();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (!current) return setError('Enter your current password.');
    if (next.length < 8) return setError('New password must be at least 8 characters.');
    if (next !== confirm) return setError('The new passwords do not match.');
    if (next === current) return setError('Choose a password you are not using now.');
    if (!email) return setError('Could not read your account. Sign in again and retry.');

    setBusy(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
      if (signInErr) return setError('Current password is incorrect.');
      const { error: updErr } = await supabase.auth.updateUser({ password: next });
      if (updErr) return setError(updErr.message || 'Could not update your password. Try again.');
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Security">
      {hasPassword === null ? (
        <DetailSkeleton rows={2} />
      ) : !hasPassword ? (
        <EmptyCard
          title="You sign in with Google"
          body="Your account has no iTutor password to change. Manage your password in your Google account."
        />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-ds-3">
          <FloatField label="Current password" type="password" value={current} onChange={setCurrent} autoComplete="current-password" />
          <FloatField label="New password" type="password" value={next} onChange={setNext} placeholder="At least 8 characters" autoComplete="new-password" />
          <FloatField label="Confirm new password" type="password" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" autoComplete="new-password" />
          {error ? <FormError>{error}</FormError> : null}
          {done ? <FormNote>Password updated.</FormNote> : null}
          <Button type="submit" size="lg" block="always" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>
          <Button variant="outline" size="lg" block="always" onClick={() => router.push('/parent/settings')} disabled={busy}>
            Cancel
          </Button>
        </form>
      )}
    </DetailScreen>
  );
}
