'use client';

/**
 * Student Settings, new UI — Figma `2:2219` (states H1–H7), file
 * rwytRx6xmRHf4AMzpxAznd. One scrolling page, replacing the old five-tab
 * switcher. Reached from the header avatar.
 *
 * WHAT IS REAL AND WHAT IS NOT, row by row:
 * - Profile hero, Customise profile, Learning rows → /student/settings/profile.
 * - Notifications. The old page's four switches wrote
 *   `profiles.notification_preferences`, which does not exist, so none of them
 *   ever saved. Only "Tips & offers" has a backend (profiles.marketing_consent,
 *   /api/account/marketing-consent). "Lesson reminders" is now real too
 *   (/api/account/lesson-reminders, migration 270; the reminder crons skip a
 *   student who turned it off). Earlier note, kept for history: the
 *   row says so instead of offering a switch that would do nothing. Homework
 *   reminders and SMS alerts are not drawn: nothing sends either.
 * - Email / Password open sheets with the old page's exact flows (Supabase
 *   updateUser; the password change re-checks the current one first).
 * - Billing: Plan / Upgrade has no backend and is hidden; Payment history goes
 *   is gone (owner, 14 Nov: repetitive); Payment methods stays "SOON".
 * - Delete account: the old page's username-confirm flow, in a sheet.
 *
 * "More" (no frame, PROVISIONAL): the old sidebar's pages that the four tabs
 * dropped — Messages, Ratings, Study tools, Curriculum — so they stay
 * reachable, as ParentSettingsV2 does for its unframed routes.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Books,
  Camera,
  CaretRight,
  ChatCircle,
  ClockCounterClockwise,
  EnvelopeSimple,
  GraduationCap,
  Lock,
  PencilSimple,
  Plus,
  SignOut,
  Star,
  Student,
  Toolbox,
} from '@phosphor-icons/react';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import { Sheet } from '@/components/parent/v2/Sheet';
import { parentInitials } from '@/components/parent/v2/initials';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { supabase } from '@/lib/supabase/client';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';
import type { Area } from '@/lib/utils/imageCrop';

export const levelLabel = (v: string | null | undefined) => {
  if (!v) return null;
  if (/^Form [45]$/.test(v)) return `${v} · CSEC`;
  if (/^(Lower|Upper) 6$/.test(v)) return `${v} · CAPE`;
  return v;
};

function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-ds-3">
      <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">{children}</h2>
      {aside}
    </div>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-line-soft rounded-ds-card bw-hair border-border bg-surface-card px-[15px]">{children}</div>;
}

const rowCls = 'flex min-h-[60px] w-full items-center gap-ds-3 py-ds-3 text-left';

function RowBody({
  icon,
  tone = 'ink',
  label,
  sub,
  value,
  chevron = true,
  right,
}: {
  icon: ReactNode;
  tone?: 'ink' | 'yellow' | 'dashed';
  label: string;
  sub?: string | null;
  value?: string | null;
  chevron?: boolean;
  right?: ReactNode;
}) {
  return (
    <>
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-ds-sm',
          tone === 'yellow' && 'bg-accent-yellow text-ink',
          tone === 'ink' && 'bg-ink text-brand',
          tone === 'dashed' && 'bw-bold bw-dashed border-border-strong text-ink-muted'
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block font-body text-[16px] font-extrabold', tone === 'dashed' ? 'text-ink-muted' : 'text-ink')}>{label}</span>
        {sub ? <span className="block truncate font-body text-[14px] text-ink-muted">{sub}</span> : null}
      </span>
      {value ? <span className="max-w-[45%] shrink-0 truncate font-body text-[15px] text-ink-muted">{value}</span> : null}
      {right}
      {chevron ? <CaretRight size={18} weight="bold" className="shrink-0 text-ink" aria-hidden /> : null}
    </>
  );
}

function LinkRow(props: Parameters<typeof RowBody>[0] & { href: string }) {
  const { href, ...rest } = props;
  return (
    <Link href={href} className={cn(rowCls, 'ds-press no-underline')}>
      <RowBody {...rest} />
    </Link>
  );
}

function ButtonRow(props: Parameters<typeof RowBody>[0] & { onClick: () => void }) {
  const { onClick, ...rest } = props;
  return (
    <button type="button" onClick={onClick} className={cn(rowCls, 'ds-press border-0 bg-transparent px-0 cursor-pointer')}>
      <RowBody {...rest} />
    </button>
  );
}

function Switch({ on, busy, onToggle, label }: { on: boolean; busy: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        'flex h-8 w-14 shrink-0 items-center rounded-ds-sm border-0 p-1 cursor-pointer transition-colors disabled:opacity-60',
        on ? 'justify-end bg-brand' : 'justify-start bg-border'
      )}
    >
      <span className={cn('size-6 rounded-[5px]', on ? 'bg-ink' : 'bg-white')} />
    </button>
  );
}

const fieldCls =
  'h-[52px] w-full rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] font-body text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-brand';

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="font-body text-[15px] font-extrabold text-ink">{label}</span>
      {children}
      {hint ? <span className="font-body text-[13px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

const primaryBtn =
  'h-[50px] w-full rounded-ds-sm border-0 bg-[#13804a] transition-[background-color,transform,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent] enabled:hover:bg-[#0f6e3f] enabled:active:translate-y-[2px] enabled:active:shadow-[0_2px_0_#0d4f2d] font-body text-[16px] font-extrabold text-white shadow-[0_4px_0_#0d4f2d] cursor-pointer disabled:opacity-60';

export default function StudentSettingsV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const { uploadAvatar, deleteAvatar, uploading } = useAvatarUpload(profile?.id ?? '');
  const [marketing, setMarketing] = useState<boolean | null>(null);
  // Lesson reminders (migration 270). null while loading; remindersFixed
  // when the server cannot store the choice, so the switch shows on and locked.
  const [reminders, setReminders] = useState<boolean | null>(null);
  const [remindersFixed, setRemindersFixed] = useState(false);
  const [savingReminders, setSavingReminders] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [sheet, setSheet] = useState<null | 'email' | 'password' | 'delete'>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // sheet state
  const [newEmail, setNewEmail] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [deleteInput, setDeleteInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'student') router.push(nonStudentRedirect(profile));
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    fetch('/api/account/lesson-reminders', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { enabled: true, available: false }))
      .then((j) => {
        if (cancelled) return;
        setReminders(j.enabled !== false);
        setRemindersFixed(j.available === false);
      })
      .catch(() => {
        if (!cancelled) {
          setReminders(true);
          setRemindersFixed(true);
        }
      });
    fetch('/api/account/marketing-consent', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { marketing: null }))
      .then((j) => {
        if (!cancelled) setMarketing(typeof j.marketing === 'boolean' ? j.marketing : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const flash = useCallback((ok: boolean, text: string) => {
    setNotice({ ok, text });
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const openSheet = (s: 'email' | 'password' | 'delete') => {
    setSheetError(null);
    setNewEmail('');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setDeleteInput('');
    setSheet(s);
  };

  const toggleReminders = async () => {
    if (reminders === null || remindersFixed) return;
    const next = !reminders;
    setSavingReminders(true);
    setReminders(next);
    const res = await fetch('/api/account/lesson-reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: next }),
    }).catch(() => null);
    setSavingReminders(false);
    if (!res?.ok) {
      setReminders(!next);
      flash(false, 'Could not save that. Try again.');
    }
  };

  const toggleMarketing = async () => {
    if (marketing === null) return;
    const next = !marketing;
    setSavingMarketing(true);
    setMarketing(next);
    const res = await fetch('/api/account/marketing-consent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketing: next }),
    }).catch(() => null);
    setSavingMarketing(false);
    if (!res?.ok) {
      setMarketing(!next);
      flash(false, 'Could not save that. Try again.');
    }
  };

  const updateEmail = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || trimmed === profile?.email) return setSheetError('Enter a different email address.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return setSheetError('That email address is not valid.');
    setBusy(true);
    setSheetError(null);
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setBusy(false);
    if (error) return setSheetError(error.message);
    setSheet(null);
    flash(true, `Confirmation sent to ${trimmed}. Check your inbox to confirm the change.`);
  };

  const changePassword = async () => {
    if (newPw.length < 8) return setSheetError('New password must be at least 8 characters.');
    if (newPw !== confirmPw) return setSheetError('Passwords do not match.');
    setBusy(true);
    setSheetError(null);
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: profile?.email ?? '', password: currentPw });
    if (signInErr) {
      setBusy(false);
      return setSheetError('Current password is incorrect.');
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) return setSheetError(error.message);
    setSheet(null);
    flash(true, 'Password changed.');
  };

  const deleteAccount = async () => {
    if (!profile || deleteInput !== (profile.username || '')) return;
    setBusy(true);
    setSheetError(null);
    try {
      const res = await fetch('/api/delete-account', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSheetError(data.error || 'Failed to delete account.');
        return;
      }
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/login';
    } catch {
      setSheetError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    localStorage.clear();
    sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  const onAvatarUpload = async (imageSrc: string, area: Area) => {
    const r = await uploadAvatar(imageSrc, area);
    if (r.success) {
      setAvatarOpen(false);
      window.location.reload();
    } else flash(false, r.error || 'Failed to upload photo.');
  };
  const onAvatarRemove = async () => {
    const r = await deleteAvatar();
    if (r.success) {
      setAvatarOpen(false);
      window.location.reload();
    } else flash(false, 'Failed to remove photo.');
  };

  const title = <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Settings</h1>;

  if (loading || !profile) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        {title}
        <div className="h-[170px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[200px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  const name = profile.display_name || profile.full_name || profile.username || 'Student';
  const subjects = (profile.subjects_of_study ?? []) as string[];
  const notifOn = (reminders !== false ? 1 : 0) + (marketing ? 1 : 0);
  const notifTotal = marketing === null ? 1 : 2;

  return (
    <div className="flex flex-col gap-[22px]">
      {title}

      {notice ? (
        <p
          role={notice.ok ? 'status' : 'alert'}
          className={cn(
            'm-0 rounded-ds-card bw-hair p-ds-3 font-body text-[15px] font-bold text-ink',
            notice.ok ? 'border-brand bg-surface-card' : 'border-danger bg-danger-soft'
          )}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-[22px] lg:grid-cols-2">
        <div className="flex flex-col gap-[22px]">
          {/* Profile hero — 2:2256 */}
          <section className="flex flex-col gap-ds-4 rounded-ds-card bg-ink p-[18px]" aria-label="Your profile">
            <div className="flex items-center gap-[14px]">
              <button
                type="button"
                onClick={() => setAvatarOpen(true)}
                aria-label={profile.avatar_url ? 'Change photo' : 'Add photo'}
                className="relative shrink-0 border-0 bg-transparent p-0 cursor-pointer"
              >
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="size-[68px] rounded-[12px] object-cover" />
                ) : (
                  <span className="flex size-[68px] items-center justify-center rounded-[12px] bg-brand font-display text-[24px] font-black text-ink">
                    {parentInitials(profile)}
                  </span>
                )}
                <span className="absolute -bottom-1.5 -right-1.5 flex size-8 items-center justify-center rounded-ds-sm bw-bold border-ink bg-accent-yellow text-ink">
                  <Camera size={14} weight="bold" aria-hidden />
                </span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className="truncate font-display text-[20px] font-extrabold leading-[22px] text-white">{name}</span>
                {profile.username ? <span className="truncate font-body text-[15px] text-[#c3d3c8]">@{profile.username}</span> : null}
                {profile.bio ? <span className="truncate font-body text-[14px] text-[#c3d3c8]">&ldquo;{profile.bio}&rdquo;</span> : null}
              </div>
            </div>
            <Link
              href="/student/settings/profile"
              className="ds-press flex h-12 w-full items-center justify-center gap-ds-2 rounded-ds-sm bg-brand font-body text-[16px] font-extrabold text-ink no-underline shadow-[0_4px_0_#199356]"
            >
              <PencilSimple size={18} weight="bold" aria-hidden /> Customise profile
            </Link>
          </section>

          {/* Learning — 2:2279 */}
          <section className="flex flex-col gap-[10px]">
            <SectionTitle>Learning</SectionTitle>
            <Group>
              <LinkRow href="/student/settings/profile" tone="yellow" icon={<GraduationCap size={18} weight="bold" aria-hidden />} label="Level" value={levelLabel(profile.form_level) ?? 'Add'} />
              <LinkRow href="/student/settings/profile" tone="yellow" icon={<Student size={18} weight="bold" aria-hidden />} label="School" value={profile.school || 'Add'} />
              <LinkRow
                href="/student/settings/profile"
                tone="yellow"
                icon={<BookOpen size={18} weight="bold" aria-hidden />}
                label="Subjects"
                value={subjects.length ? subjects.join(', ') : 'Add'}
              />
            </Group>
          </section>

          {/* Notifications — 2:2321 */}
          <section className="flex flex-col gap-[10px]">
            <SectionTitle aside={<span className="font-body text-[14px] font-bold text-ink-muted">{`${notifOn} of ${notifTotal} on`}</span>}>
              Notifications
            </SectionTitle>
            <Group>
              <div className={cn(rowCls, 'min-h-[68px]')}>
                <span className="min-w-0 flex-1">
                  <span className="block font-body text-[16px] font-extrabold text-ink">Lesson reminders</span>
                  <span className="block font-body text-[14px] text-ink-muted">
                    {reminders === false ? 'Off. You won’t get emails before your classes' : 'Emails before each class'}
                  </span>
                </span>
                <Switch
                  on={reminders !== false}
                  busy={reminders === null || savingReminders || remindersFixed}
                  label="Lesson reminders"
                  onToggle={() => void toggleReminders()}
                />
              </div>
              {marketing !== null ? (
                <div className={cn(rowCls, 'min-h-[68px]')}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-body text-[16px] font-extrabold text-ink">Tips &amp; offers</span>
                    <span className="block font-body text-[14px] text-ink-muted">Study tips, new tutors</span>
                  </span>
                  <Switch on={marketing} busy={savingMarketing} label="Tips and offers" onToggle={() => void toggleMarketing()} />
                </div>
              ) : null}
            </Group>
            <Link href="/student/notifications" className="ds-link self-start font-body text-[14px] font-extrabold text-brand-edge">
              See your notifications
            </Link>
          </section>
        </div>

        <div className="flex flex-col gap-[22px]">
          {/* Account & security — 2:2359 */}
          <section className="flex flex-col gap-[10px]">
            <SectionTitle>Account &amp; security</SectionTitle>
            <Group>
              <ButtonRow onClick={() => openSheet('email')} icon={<EnvelopeSimple size={18} weight="bold" aria-hidden />} label="Email" sub={profile.email} />
              <ButtonRow onClick={() => openSheet('password')} icon={<Lock size={18} weight="bold" aria-hidden />} label="Password" value="Change" />
            </Group>
          </section>

          {/* Billing — 2:2388. Plan / Upgrade omitted: no backend. */}
          <section className="flex flex-col gap-[10px]">
            <SectionTitle>Billing</SectionTitle>
            <Group>
              <div className={rowCls}>
                <RowBody
                  tone="dashed"
                  chevron={false}
                  icon={<Plus size={18} weight="bold" aria-hidden />}
                  label="Payment methods"
                  right={
                    <span className="shrink-0 rounded-[4px] bw-hair border-border-strong px-[9px] py-1 font-body text-[12px] font-extrabold tracking-[0.72px] text-ink-muted">
                      SOON
                    </span>
                  }
                />
              </div>
            </Group>
          </section>

          {/* More — no frame, PROVISIONAL */}
          <section className="flex flex-col gap-[10px]">
            <SectionTitle>More</SectionTitle>
            <Group>
              <LinkRow href="/student/messages" icon={<ChatCircle size={18} weight="bold" aria-hidden />} label="Messages" />
              <LinkRow href="/student/ratings" icon={<Star size={18} weight="bold" aria-hidden />} label="Rate your lessons" />
            </Group>
          </section>

          <div className="flex flex-col gap-[10px] pt-ds-1">
            <button
              type="button"
              onClick={() => void logout()}
              className="ds-press flex h-[50px] w-full items-center justify-center gap-ds-2 rounded-ds-sm bw-bold border-danger bg-surface-card font-body text-[16px] font-extrabold text-danger cursor-pointer"
            >
              <SignOut size={18} weight="bold" aria-hidden /> Log out
            </button>
            <div className="flex items-center justify-between gap-ds-3">
              <button
                type="button"
                onClick={() => openSheet('delete')}
                className="min-h-[44px] border-0 bg-transparent p-0 font-body text-[14px] font-extrabold text-danger cursor-pointer"
              >
                Delete account
              </button>
              <span className="flex gap-[14px]">
                <Link href="/terms" className="flex min-h-[44px] items-center font-body text-[14px] font-bold text-ink-muted underline">
                  Terms
                </Link>
                <Link href="/privacy" className="flex min-h-[44px] items-center font-body text-[14px] font-bold text-ink-muted underline">
                  Privacy
                </Link>
              </span>
            </div>
          </div>
        </div>
      </div>

      <Sheet
        open={sheet === 'email'}
        onClose={() => setSheet(null)}
        title="Change email"
        footer={
          <button type="button" onClick={() => void updateEmail()} disabled={busy} className={primaryBtn}>
            {busy ? 'Sending…' : 'Send confirmation'}
          </button>
        }
      >
        <div className="flex flex-col gap-ds-3">
          <p className="m-0 font-body text-[15px] text-ink-muted">
            Now <strong className="text-ink">{profile.email}</strong>. We send a link to the new address; the change happens when you open it.
          </p>
          <Field label="New email">
            <input type="email" autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={fieldCls} />
          </Field>
          {sheetError ? <p role="alert" className="m-0 font-body text-[14px] font-bold text-danger">{sheetError}</p> : null}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'password'}
        onClose={() => setSheet(null)}
        title="Change password"
        footer={
          <button type="button" onClick={() => void changePassword()} disabled={busy} className={primaryBtn}>
            {busy ? 'Saving…' : 'Update password'}
          </button>
        }
      >
        <div className="flex flex-col gap-ds-3">
          <Field label="Current password">
            <input type="password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={fieldCls} />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <input type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={fieldCls} />
          </Field>
          <Field label="Confirm new password">
            <input type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={fieldCls} />
          </Field>
          {sheetError ? <p role="alert" className="m-0 font-body text-[14px] font-bold text-danger">{sheetError}</p> : null}
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'delete'}
        onClose={() => setSheet(null)}
        title="Delete your account?"
        footer={
          <button
            type="button"
            onClick={() => void deleteAccount()}
            disabled={busy || deleteInput !== (profile.username || '')}
            className="ds-press h-[50px] w-full rounded-ds-sm border-0 bg-danger font-body text-[16px] font-extrabold text-white cursor-pointer disabled:opacity-40"
          >
            {busy ? 'Deleting…' : 'Permanently delete my account'}
          </button>
        }
      >
        <div className="flex flex-col gap-ds-3">
          <p className="m-0 font-body text-[15px] text-ink-muted">
            This permanently deletes your account and everything in it. It cannot be undone.
          </p>
          <Field label={`Type @${profile.username ?? ''} to confirm`}>
            <input value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder={profile.username ?? ''} className={fieldCls} />
          </Field>
          {sheetError ? <p role="alert" className="m-0 font-body text-[14px] font-bold text-danger">{sheetError}</p> : null}
        </div>
      </Sheet>

      <AvatarUploadModal
        isOpen={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        onUpload={onAvatarUpload}
        uploading={uploading}
        hasAvatar={Boolean(profile.avatar_url)}
        onRemovePhoto={onAvatarRemove}
      />
    </div>
  );
}
