'use client';

/**
 * The tutor Settings sub-screens in the new UI: Account details
 * (?section=profile), Password and security (?section=security) and Video
 * setup (/tutor/video-setup). Owner, 2026-11-16: "these pages do not have the
 * new ui". No canvas frames: PROVISIONAL layout, built from the parent
 * account screens' own field (FloatField) so the two apps read the same.
 *
 * Behaviour is the old screens', with these deliberate differences:
 * - Account details saves on a button, not on a 1.2s autosave timer, and a
 *   username clash says so instead of silently failing mid-typing.
 * - Google sign-in accounts get a note instead of a password form that can
 *   only ever answer "Current password is incorrect".
 * - Video setup no longer posts every Connect click to a leftover local
 *   debug endpoint (127.0.0.1:7242), and uses inline notices, not alert().
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CaretRight, Camera, VideoCamera } from '@phosphor-icons/react';
import { Button, Card, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { useInstitutionsSearch } from '@/lib/hooks/useInstitutionsSearch';
import CountrySelect from '@/components/CountrySelect';
import { FloatField, FormError, FormNote, Switch } from '@/components/parent/v2/accountKit';
import TutorV2Shell from './TutorV2Shell';

/* ─── Frame: back link + title, inside the tutor shell ─────────────── */

function Detail({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <TutorV2Shell title={title}>
      <div className="flex max-w-[640px] flex-col gap-ds-4">
        <Link
          href="/tutor/settings"
          className="ds-press -ml-ds-1 inline-flex min-h-[44px] items-center gap-[6px] self-start px-ds-1 font-body text-[15px] font-extrabold text-ink no-underline"
        >
          <span className="rotate-180" aria-hidden>
            <CaretRight size={18} weight="bold" />
          </span>
          Settings
        </Link>
        <header className="flex flex-col gap-ds-1">
          <h1 className="m-0 font-display text-[28px] font-extrabold leading-tight text-ink">{title}</h1>
          {intro ? <p className="m-0 text-[15px] text-ink-muted">{intro}</p> : null}
        </header>
        {children}
      </div>
    </TutorV2Shell>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="m-0 mt-ds-2 text-[12px] font-extrabold uppercase tracking-[0.08em] text-ink-muted">{children}</h2>;
}

function useTutorGuard() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  useEffect(() => {
    if (!loading && (!profile || profile.role !== 'tutor')) router.push('/login');
  }, [loading, profile, router]);
  return { profile, loading };
}

const initialsOf = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'T';

/**
 * School or institution, with search. The old screen was a bare text box, so
 * typing a school found nothing. This searches the institutions list
 * (/api/institutions/search) as you type; picking a result fills in its exact
 * name. A school that isn't listed can still be kept as typed. Only the name is
 * saved (profiles.school), as before.
 */
function SchoolSearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const { results, loading } = useInstitutionsSearch(focused ? value : '');
  const exact = results.some((r) => r.name.toLowerCase() === value.trim().toLowerCase());
  const open = focused && value.trim().length >= 2 && !exact;
  return (
    <div className="relative">
      <label className="flex flex-col gap-[2px] rounded-ds-card bw-hair border-ink bg-surface-card px-ds-card py-ds-2 focus-within:[outline-style:solid] focus-within:outline-2 focus-within:outline-ink">
        <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">School or institution</span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          // Let a tap on a result land before the list closes.
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Optional. Start typing to search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls="school-results"
          className="w-full border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink placeholder:font-body placeholder:font-normal placeholder:text-ink-muted focus:outline-none"
        />
      </label>
      {open ? (
        <ul
          id="school-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-ds-card bw-hair border-ink bg-surface-card shadow-[0_4px_0_rgb(var(--ds-ink))]"
        >
          {loading ? (
            <li className="px-ds-card py-ds-3 text-[14px] text-ink-muted">Searching…</li>
          ) : results.length === 0 ? (
            <li className="px-ds-card py-ds-3 text-[14px] text-ink-muted">No school matches. We&apos;ll keep what you typed.</li>
          ) : (
            results.slice(0, 8).map((r) => (
              <li key={r.id} role="option" aria-selected={false} className="bw-t-hair border-line-soft first:border-t-0">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(r.name);
                    setFocused(false);
                  }}
                  className="flex min-h-[44px] w-full items-center px-ds-card text-left text-[15px] text-ink hover:bg-surface-sunken"
                >
                  {r.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/* ─── Account details ─────────────────────────────────────────────── */

export function TutorAccountDetailsV2() {
  const { profile, loading } = useTutorGuard();
  const [form, setForm] = useState({ username: '', displayName: '', email: '', school: '', country: '' });
  const [saved, setSaved] = useState(form);
  const [sameDay, setSameDay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Changing email needs the current password first.
  const [emailPassword, setEmailPassword] = useState('');
  const [askPassword, setAskPassword] = useState(false);
  const isTestAccount = profile?.email === 'jovangoodluck@myitutor.com';
  // Once an ID check has started (or locked the name), the database refuses any
  // change to full_name/display_name (trigger profiles_name_lock_guard). Read
  // the same condition so the field is shown as fixed instead of failing on save.
  const [nameLocked, setNameLocked] = useState(false);
  useEffect(() => {
    if (!profile?.id) return;
    let live = true;
    supabase
      .from('tutor_verification_v2')
      .select('name_locked_at, identity_status')
      .eq('tutor_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live || !data) return;
        setNameLocked(
          Boolean(data.name_locked_at) || ['pending', 'processing', 'verified'].includes(String(data.identity_status))
        );
      });
    return () => {
      live = false;
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const f = {
      username: profile.username || '',
      displayName: profile.display_name || profile.full_name || '',
      email: profile.email || '',
      school: profile.school || '',
      country: profile.country || '',
    };
    setForm(f);
    setSaved(f);
    if (isTestAccount) setSameDay(Boolean(profile.allow_same_day_bookings));
  }, [profile, isTestAccount]);

  const set = (k: keyof typeof form) => (v: string) => {
    setNote(null);
    setForm((f) => ({ ...f, [k]: k === 'username' ? v.toLowerCase() : v }));
  };
  const dirty =
    (Object.keys(form) as (keyof typeof form)[]).some((k) => form[k] !== saved[k]) ||
    (isTestAccount && sameDay !== Boolean(profile?.allow_same_day_bookings));

  /**
   * Writes ONLY the fields that changed. It used to send every field, and the
   * display name box is pre-filled from full_name when display_name is empty,
   * so each save "changed" display_name from null to the full name. For a tutor
   * with an ID check that trips the name-lock trigger, and the whole save
   * failed with "your name is set by your ID check", whatever was edited.
   */
  const writeProfile = async (email: string) => {
    const updates: Record<string, unknown> = {};
    if (form.username.trim() !== saved.username) updates.username = form.username.trim();
    if (!nameLocked && form.displayName.trim() !== saved.displayName.trim()) {
      updates.display_name = form.displayName.trim() || null;
    }
    if (email !== saved.email) updates.email = email;
    if (form.school.trim() !== saved.school.trim()) updates.school = form.school.trim() || null;
    if (form.country !== saved.country) updates.country = form.country;
    if (isTestAccount && sameDay !== Boolean(profile?.allow_same_day_bookings)) updates.allow_same_day_bookings = sameDay;
    if (Object.keys(updates).length === 0) return;
    const { error: e } = await supabase.from('profiles').update(updates).eq('id', profile!.id);
    if (e) {
      if (e.code === '23505') throw new Error('That username is taken. Try another.');
      if (e.code === '42501' && /ID check/i.test(e.message)) {
        throw new Error('Your name comes from your ID check, so it can’t be changed here. Contact support if it’s wrong.');
      }
      throw new Error(e.message);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote(null);
    if (!form.username.trim()) return setError('Choose a username.');
    if (!/^[a-z0-9_-]+$/.test(form.username.trim())) return setError('Usernames use letters, numbers, - and _ only.');
    if (!form.country) return setError('Choose your country.');
    if (form.email.trim() !== saved.email) {
      setAskPassword(true);
      return;
    }
    setBusy(true);
    try {
      await writeProfile(saved.email);
      setSaved(form);
      setNote('Saved.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmEmail = async () => {
    setError(null);
    if (!emailPassword) return setError('Enter your password to change your email.');
    setBusy(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: saved.email, password: emailPassword });
      if (signInErr) throw new Error('That password is incorrect.');
      const { error: authErr } = await supabase.auth.updateUser({ email: form.email.trim() });
      if (authErr) throw new Error(authErr.message);
      await writeProfile(form.email.trim());
      setSaved(form);
      setAskPassword(false);
      setEmailPassword('');
      setNote('Saved. Check your new inbox to confirm the change.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setError(null);
    setNote(null);
    setUploading(true);
    try {
      const path = `${profile.id}/avatar.jpg`;
      // Remove first, or the CDN keeps serving the old picture.
      await supabase.storage.from('avatars').remove([path]);
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
      if (upErr) throw new Error(upErr.message);
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: updErr } = await supabase.from('profiles').update({ avatar_url: `${data.publicUrl}?t=${Date.now()}` }).eq('id', profile.id);
      if (updErr) throw new Error(updErr.message);
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setUploading(false);
    }
  };

  return (
    <Detail title="Account details" intro="How you sign in and what families see next to your classes.">
      {loading || !profile ? (
        <div aria-busy className="h-64 animate-pulse rounded-ds-card bg-surface-sunken" />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-ds-3">
          <Card className="flex-row items-center gap-ds-4">
            <span className="relative shrink-0">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="size-20 rounded-full object-cover" />
              ) : (
                <span className="flex size-20 items-center justify-center rounded-full bg-brand font-display text-[24px] font-extrabold text-ink">
                  {initialsOf(form.displayName || profile.email || '')}
                </span>
              )}
              <label className="ds-press absolute -bottom-1 -right-1 flex size-9 cursor-pointer items-center justify-center rounded-full bw-hair border-ink bg-surface-card text-ink">
                <Camera size={18} weight="bold" aria-hidden />
                <span className="sr-only">Change photo</span>
                <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
              </label>
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[17px] font-extrabold text-ink">{form.displayName || profile.full_name}</span>
              <span className="block truncate text-[14px] text-ink-muted">{uploading ? 'Uploading photo…' : saved.email}</span>
            </span>
          </Card>

          <SectionLabel>Sign-in</SectionLabel>
          <FloatField label="Username" value={form.username} onChange={set('username')} autoComplete="username" />
          <FloatField label="Email" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
          {askPassword ? (
            <Card tone="alert" className="gap-ds-3">
              <p className="m-0 text-[14px] font-bold text-ink">Enter your password to move your account to {form.email.trim()}.</p>
              <FloatField label="Current password" type="password" value={emailPassword} onChange={setEmailPassword} autoComplete="current-password" />
              <div className="flex flex-wrap gap-ds-2">
                <Button type="button" variant="dark" size="md" disabled={busy} onClick={confirmEmail}>
                  {busy ? 'Saving…' : 'Confirm and save'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  disabled={busy}
                  onClick={() => {
                    setAskPassword(false);
                    setEmailPassword('');
                    setForm((f) => ({ ...f, email: saved.email }));
                  }}
                >
                  Keep my email
                </Button>
              </div>
            </Card>
          ) : null}

          <SectionLabel>About you</SectionLabel>
          <FloatField
            label="Display name"
            value={form.displayName}
            onChange={nameLocked ? undefined : set('displayName')}
            readOnly={nameLocked}
            placeholder="How families see your name"
          />
          {nameLocked ? (
            <p className="-mt-ds-2 m-0 text-[13px] text-ink-muted">
              Set by your ID check. Contact support if it needs correcting.
            </p>
          ) : null}
          <SchoolSearchField value={form.school} onChange={set('school')} />
          <label className="flex flex-col gap-[2px] rounded-ds-card bw-hair border-ink bg-surface-card px-ds-card py-ds-2 focus-within:[outline-style:solid] focus-within:outline-2 focus-within:outline-ink">
            <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">Country</span>
            <CountrySelect
              value={form.country}
              onChange={set('country')}
              className="w-full cursor-pointer border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink focus:outline-none"
            />
          </label>

          {isTestAccount ? (
            <Card className="flex-row items-center justify-between gap-ds-3">
              <span>
                <span className="block text-[15px] font-extrabold text-ink">Allow same-day bookings</span>
                <span className="block text-[13px] text-ink-muted">Test account only: skips the 24-hour notice.</span>
              </span>
              <Switch on={sameDay} onToggle={() => setSameDay((v) => !v)} label="Allow same-day bookings" />
            </Card>
          ) : null}

          {error ? <FormError>{error}</FormError> : null}
          {note ? <FormNote>{note}</FormNote> : null}
          {!askPassword ? (
            <Button type="submit" size="lg" block="always" disabled={busy || !dirty}>
              {busy ? 'Saving…' : dirty ? 'Save changes' : 'No changes'}
            </Button>
          ) : null}
        </form>
      )}
    </Detail>
  );
}

/* ─── Password and security ───────────────────────────────────────── */

export function TutorSecurityV2() {
  const { profile, loading } = useTutorGuard();
  const [email, setEmail] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resetBusy, setResetBusy] = useState(false);
  const [del, setDel] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      setEmail(u?.email ?? null);
      const providers = (u?.app_metadata?.providers as string[] | undefined) ?? [];
      const identities = u?.identities?.map((i) => i.provider) ?? [];
      setHasPassword(providers.includes('email') || identities.includes('email'));
    })();
  }, []);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNote(null);
    if (!pw.current) return setError('Enter your current password.');
    if (pw.next.length < 8) return setError('New password must be at least 8 characters.');
    if (pw.next !== pw.confirm) return setError('The new passwords do not match.');
    if (pw.next === pw.current) return setError('Choose a password you are not using now.');
    if (!email) return setError('Could not read your account. Sign in again and retry.');
    setBusy(true);
    try {
      const { error: s } = await supabase.auth.signInWithPassword({ email, password: pw.current });
      if (s) return setError('Current password is incorrect.');
      const { error: u } = await supabase.auth.updateUser({ password: pw.next });
      if (u) return setError(u.message || 'Could not update your password. Try again.');
      setPw({ current: '', next: '', confirm: '' });
      setNote('Password updated.');
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (!email) return;
    setError(null);
    setNote(null);
    setResetBusy(true);
    const { error: r } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setResetBusy(false);
    if (r) setError(r.message);
    else setNote(`We sent a reset link to ${email}.`);
  };

  const username = profile?.username || '';
  const deleteAccount = async () => {
    if (!username || del !== username) return;
    setDeleting(true);
    setDelError(null);
    try {
      const res = await fetch('/api/delete-account', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDelError(data.error || 'Your account could not be deleted. Try again.');
        return;
      }
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* storage blocked */
      }
      window.location.href = '/login';
    } catch {
      setDelError('Something went wrong. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Detail title="Password and security">
      <SectionLabel>Password</SectionLabel>
      {hasPassword === null || loading ? (
        <div aria-busy className="h-48 animate-pulse rounded-ds-card bg-surface-sunken" />
      ) : !hasPassword ? (
        <Card title="You sign in with Google" body="Your account has no iTutor password to change. Manage your password in your Google account." />
      ) : (
        <form onSubmit={change} className="flex flex-col gap-ds-3">
          <FloatField label="Current password" type="password" value={pw.current} onChange={(v) => setPw((p) => ({ ...p, current: v }))} autoComplete="current-password" />
          <FloatField label="New password" type="password" value={pw.next} onChange={(v) => setPw((p) => ({ ...p, next: v }))} placeholder="At least 8 characters" autoComplete="new-password" />
          <FloatField label="Confirm new password" type="password" value={pw.confirm} onChange={(v) => setPw((p) => ({ ...p, confirm: v }))} placeholder="Re-enter new password" autoComplete="new-password" />
          {error ? <FormError>{error}</FormError> : null}
          {note ? <FormNote>{note}</FormNote> : null}
          <div className="flex flex-col gap-ds-2 sm:flex-row">
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
            <Button type="button" variant="outline" size="lg" disabled={resetBusy} onClick={sendReset}>
              {resetBusy ? 'Sending…' : 'Email me a reset link'}
            </Button>
          </div>
        </form>
      )}

      <SectionLabel>Two-step sign-in</SectionLabel>
      <Card className="flex-row items-center justify-between gap-ds-3">
        <span className="text-[14px] text-ink-muted">An extra check when you sign in.</span>
        <Tag tone="outline">Coming soon</Tag>
      </Card>

      <SectionLabel>Delete account</SectionLabel>
      <Card tone="alert" className="gap-ds-3">
        <p className="m-0 text-[14px] leading-5 text-ink">
          This permanently deletes your account, your classes and their history. It cannot be undone.
        </p>
        <FloatField label={`Type @${username} to confirm`} value={del} onChange={setDel} placeholder={username} />
        {delError ? <FormError>{delError}</FormError> : null}
        <Button variant="danger" size="lg" block="always" disabled={deleting || !username || del !== username} onClick={deleteAccount}>
          {deleting ? 'Deleting…' : 'Delete my account'}
        </Button>
      </Card>
    </Detail>
  );
}

/* ─── Video setup ─────────────────────────────────────────────────── */

type Provider = 'google_meet' | 'zoom';
type Connection = { provider: Provider; created_at: string; provider_account_email: string | null };
const PROVIDER_NAME: Record<Provider, string> = { google_meet: 'Google Meet', zoom: 'Zoom' };

const OAUTH_ERRORS: Record<string, string> = {
  auth_failed: "Connecting didn't finish. Try again.",
  connection_failed: "We couldn't save the connection. Try again.",
  server_config: 'Video connections are not set up on this server. Contact support.',
};

export function TutorVideoSetupV2() {
  const { profile, loading } = useTutorGuard();
  const [conn, setConn] = useState<Connection | null>(null);
  const [expired, setExpired] = useState<Provider | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = async (tutorId: string) => {
    const { data } = await supabase.from('tutor_video_provider_connections').select('*').eq('tutor_id', tutorId).maybeSingle();
    if (data) {
      const exp = data.token_expires_at ? new Date(data.token_expires_at) : null;
      const isExpired = !!exp && !Number.isNaN(exp.getTime()) && exp <= new Date();
      const usable = Boolean(data.is_active) && data.connection_status === 'connected' && !isExpired;
      setConn(usable ? (data as Connection) : null);
      setExpired(!usable ? (data.provider as Provider) : null);
    } else {
      setConn(null);
      setExpired(null);
    }
    setReady(true);
  };

  useEffect(() => {
    if (!profile?.id) return;
    // OAuth return: ?success / ?error, then tidy the address bar.
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      const moved = Number(params.get('migrated') || 0);
      setBanner({
        tone: 'ok',
        text:
          moved > 0
            ? `Connected. ${moved} upcoming session${moved === 1 ? ' was' : 's were'} moved to the new link.`
            : params.get('migration_warning') === 'true'
              ? 'Connected. Some upcoming sessions may still have the old link: check Sessions.'
              : 'Connected.',
      });
    } else if (params.get('error')) {
      setBanner({ tone: 'error', text: OAUTH_ERRORS[params.get('error')!] ?? 'Something went wrong. Try again.' });
    }
    if (params.toString()) window.history.replaceState({}, '', '/tutor/video-setup');
    load(profile.id);
  }, [profile?.id]);

  const connect = (p: Provider) => {
    if (conn && !window.confirm(`Replace your ${PROVIDER_NAME[conn.provider]} connection with ${PROVIDER_NAME[p]}?`)) return;
    setBusy(true);
    window.location.href = p === 'google_meet' ? '/api/auth/google/connect' : '/api/auth/zoom/connect';
  };

  const disconnect = async () => {
    if (!conn || !profile) return;
    if (
      !window.confirm(
        `Disconnect ${PROVIDER_NAME[conn.provider]}?\n\nUntil you connect again you won't show in tutor search, can't accept bookings and can't send lesson offers.`
      )
    )
      return;
    setBusy(true);
    const { error } = await supabase.from('tutor_video_provider_connections').delete().eq('tutor_id', profile.id);
    setBusy(false);
    if (error) {
      setBanner({ tone: 'error', text: "Couldn't disconnect. Try again." });
      return;
    }
    setBanner(null);
    load(profile.id);
  };

  return (
    <Detail title="Video setup" intro="Lessons and classes run on your own video account. iTutor creates the meeting links for you.">
      {banner ? banner.tone === 'ok' ? <FormNote>{banner.text}</FormNote> : <FormError>{banner.text}</FormError> : null}

      {!ready || loading ? (
        <div aria-busy className="h-40 animate-pulse rounded-ds-card bg-surface-sunken" />
      ) : (
        <>
          {/* Status */}
          {conn ? (
            <Card tone="feature" className="gap-ds-1">
              <Tag tone="brand">Video-ready</Tag>
              <p className="m-0 text-[15px] font-bold text-ink">
                {PROVIDER_NAME[conn.provider]} is connected{conn.provider_account_email ? ` as ${conn.provider_account_email}` : ''}.
              </p>
              <p className="m-0 text-[13px] text-ink-muted">
                Connected {new Date(conn.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
              </p>
            </Card>
          ) : (
            <Card tone="alert" className="gap-ds-1">
              <Tag tone="danger">Not connected</Tag>
              <p className="m-0 text-[15px] font-bold text-ink">
                {expired
                  ? `Your ${PROVIDER_NAME[expired]} sign-in expired. Connect it again below.`
                  : 'Connect a video account to teach.'}
              </p>
              <p className="m-0 text-[13px] text-ink-muted">
                Until you do, you won&apos;t show in tutor search and can&apos;t accept bookings or send lesson offers.
              </p>
            </Card>
          )}

          {/* Providers */}
          <div className="grid gap-ds-3 sm:grid-cols-2">
            <ProviderCard
              name="Google Meet"
              detail="Free calls with a Google account"
              state={conn?.provider === 'google_meet' ? 'connected' : 'available'}
              busy={busy}
              onConnect={() => connect('google_meet')}
              onDisconnect={disconnect}
            />
            <ProviderCard name="Zoom" detail="Zoom meetings for your lessons" state="soon" busy={busy} />
          </div>
        </>
      )}
    </Detail>
  );
}

function ProviderCard({
  name,
  detail,
  state,
  busy,
  onConnect,
  onDisconnect,
}: {
  name: string;
  detail: string;
  state: 'connected' | 'available' | 'soon';
  busy: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  return (
    <Card className={cn('gap-ds-3', state === 'soon' && 'opacity-60')}>
      <div className="flex items-start gap-ds-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-ds-sm bg-ink text-on-ink">
          <VideoCamera size={22} weight="bold" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-ds-2">
            <span className="text-[16px] font-extrabold text-ink">{name}</span>
            {state === 'connected' ? <Tag tone="brand">Connected</Tag> : state === 'soon' ? <Tag tone="outline">Coming soon</Tag> : null}
          </span>
          <span className="block text-[13px] text-ink-muted">{detail}</span>
        </span>
      </div>
      {state === 'connected' ? (
        <Button variant="outline" size="md" block="always" disabled={busy} onClick={onDisconnect}>
          {busy ? 'Working…' : 'Disconnect'}
        </Button>
      ) : state === 'available' ? (
        <Button variant="dark" size="md" block="always" disabled={busy} onClick={onConnect}>
          {busy ? 'Opening…' : `Connect ${name}`}
        </Button>
      ) : (
        <Button variant="outline" size="md" block="always" disabled>
          Coming soon
        </Button>
      )}
    </Card>
  );
}
