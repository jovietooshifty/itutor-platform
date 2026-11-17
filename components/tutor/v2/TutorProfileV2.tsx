'use client';

/**
 * Tutor Profile, new UI — /tutor/profile. Canvas m25 (phone) and d11 (desktop).
 *
 * REAL DATA, all read-only here:
 * - profiles via useProfile (photo, name, bio, country, username)
 * - tutor_subjects -> the first subject under the name
 * - auth user -> "Email confirmed"
 * - GET /api/verification/request -> badge status (./verificationSteps)
 * - GET /api/tutor/payout-account -> payout account row
 * - useTutorCompletion -> photo, bio, 1:1 times and rate
 * - groups (status PUBLISHED) -> the "Group class" step
 * - ratings -> the Reviews row (Reviews lost its sidebar item in the new nav)
 *
 * Left out, per the 2026-11-14 decisions: "Coupons & scholarships" and
 * "Invite a teacher" (Grow is Insights only). The d11 step table's "You can
 * publish offers" is not real (offers have no backend); that row says what a
 * photo and bio actually unlock.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bank,
  Camera,
  CaretRight,
  PencilSimple,
  Check,
  GearSix,
  Lifebuoy,
  SealCheck,
  SignOut,
  Star,
} from '@phosphor-icons/react';
import { Button, Card, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { notifyCompletionUpdated, useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { supabase } from '@/lib/supabase/client';
import { parentInitials } from '@/components/parent/v2/initials';
import type { Area } from '@/lib/utils/imageCrop';
import AvatarUploadSheetV2 from './AvatarUploadSheetV2';
import TutorV2Shell from './TutorV2Shell';
import { StepList } from './TutorVerificationV2';
import { fetchVerification, verifyChip, verifyStep, verifyTone, type VerificationState } from './verificationSteps';

type Account = { bank_name: string | null; payout_account_identifier: string | null } | null;

/** Same advisory-to-enforced limit as Edit profile's counter (BIO_WORDS there). */
const BIO_WORDS = 60;

function words(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

export default function TutorProfileV2() {
  return (
    <TutorV2Shell title="Profile" width="wide">
      <ProfileBody />
    </TutorV2Shell>
  );
}

function ProfileBody() {
  const router = useRouter();
  const { profile, loading, refresh } = useProfile();
  const completion = useTutorCompletion(profile);
  const { uploadAvatar, deleteAvatar, uploading } = useAvatarUpload(profile?.id ?? '');
  const [avatarOpen, setAvatarOpen] = useState(false);
  // Local overrides so a change shows at once; useProfile caches the row.
  const [avatarOverride, setAvatarOverride] = useState<string | null | undefined>(undefined);
  const [bioOverride, setBioOverride] = useState<string | null | undefined>(undefined);
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [emailConfirmed, setEmailConfirmed] = useState<boolean | null>(null);
  const [verification, setVerification] = useState<VerificationState | null | undefined>(undefined);
  const [account, setAccount] = useState<Account | undefined>(undefined);
  const [published, setPublished] = useState<number | null>(null);
  const [reviews, setReviews] = useState<{ count: number; avg: number } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.id || profile.role !== 'tutor') return;
    let cancelled = false;
    const id = profile.id;
    (async () => {
      const [subs, user, groups, ratings, v, acct] = await Promise.all([
        supabase.from('tutor_subjects').select('subjects(name, label)').eq('tutor_id', id).limit(1),
        supabase.auth.getUser(),
        supabase.from('groups').select('id', { count: 'exact', head: true }).eq('tutor_id', id).eq('status', 'PUBLISHED'),
        supabase.from('ratings').select('stars').eq('tutor_id', id),
        fetchVerification(),
        fetch('/api/tutor/payout-account', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      if (cancelled) return;
      const s: any = subs.data?.[0]?.subjects;
      const one = Array.isArray(s) ? s[0] : s;
      setSubject(one?.label || one?.name || null);
      setEmailConfirmed(Boolean(user.data.user?.email_confirmed_at));
      setPublished(groups.count ?? 0);
      const stars = ((ratings.data ?? []) as { stars: number }[]).map((r) => r.stars);
      setReviews({ count: stars.length, avg: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : 0 });
      setVerification(v);
      setAccount(acct ? (acct.account ?? null) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.role]);

  if (loading || !profile) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        <div className="h-[36px] w-[160px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[180px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[260px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  const name = profile.display_name || profile.full_name || 'Teacher';
  const step = verification === undefined ? null : verifyStep(verification);
  const last4 = (account?.payout_account_identifier ?? '').replace(/\D/g, '').slice(-4);
  const accountLine = account === undefined ? '…' : account ? `${account.bank_name ?? 'Bank'}${last4 ? ` ····${last4}` : ''}` : 'Not set up yet';
  const publicHref = `/tutors/${profile.username || profile.id}`;
  const avatarUrl = avatarOverride === undefined ? profile.avatar_url : avatarOverride;
  const bioText = (bioOverride === undefined ? profile.bio : bioOverride) ?? '';
  const draftWords = words(bioDraft);
  const overLimit = draftWords > BIO_WORDS;

  // Throwing hands the message to the sheet, which shows it inline and stays open.
  const onAvatarUpload = async (imageSrc: string, area: Area) => {
    const r = await uploadAvatar(imageSrc, area);
    if (!r.success) throw new Error(r.error || 'Failed to upload photo.');
    setAvatarOverride(r.avatarUrl ?? null);
    notifyCompletionUpdated();
    void refresh?.();
  };
  const onAvatarRemove = async () => {
    const r = await deleteAvatar();
    if (!r.success) throw new Error('Failed to remove photo.');
    setAvatarOverride(null);
    notifyCompletionUpdated();
    void refresh?.();
  };

  const startBio = () => {
    setBioDraft(bioText);
    setBioError(null);
    setBioEditing(true);
  };
  const cancelBio = () => {
    setBioEditing(false);
    setBioDraft('');
    setBioError(null);
  };
  // Same write as Edit profile: profiles.bio on the tutor's own row, trimmed, empty -> null.
  const saveBio = async () => {
    if (overLimit) return setBioError(`Keep it to ${BIO_WORDS} words.`);
    setBioSaving(true);
    setBioError(null);
    const next = bioDraft.trim() || null;
    const { error: err } = await supabase.from('profiles').update({ bio: next }).eq('id', profile.id);
    setBioSaving(false);
    if (err) return setBioError(err.message);
    setBioOverride(next);
    setBioEditing(false);
    notifyCompletionUpdated();
  };

  const logout = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* storage can be blocked; signing out still works */
    }
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  const header = (
    <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="flex items-center gap-ds-3">
        <button
          type="button"
          onClick={() => setAvatarOpen(true)}
          aria-label={avatarUrl ? 'Change photo' : 'Add photo'}
          className="group relative flex size-[64px] shrink-0 cursor-pointer items-center justify-center rounded-ds-full border-0 bg-brand p-0 font-display text-[22px] font-extrabold text-ink focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink"
        >
          <span className="flex size-full items-center justify-center overflow-hidden rounded-ds-full">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="size-full object-cover" />
            ) : (
              parentInitials(profile)
            )}
          </span>
          {/* Hover / keyboard focus: full scrim with the action. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-[1px] rounded-ds-full bg-ink/55 text-on-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <Camera size={18} weight="bold" />
            <span className="font-body text-[9px] font-extrabold leading-[11px]">{avatarUrl ? 'Change photo' : 'Add photo'}</span>
          </span>
          {/* Touch has no hover: a small camera badge stays in the corner. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-[2px] -right-[2px] flex size-[24px] items-center justify-center rounded-ds-full bw-hair border-surface-card bg-ink text-on-ink [@media(hover:hover)]:hidden"
          >
            <Camera size={13} weight="bold" />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 break-words font-display text-[20px] font-extrabold leading-[24px] text-ink">{name}</h2>
          <p className="m-0 mt-[2px] text-[14px] text-ink-muted">
            {[subject, profile.country].filter(Boolean).join(' · ') || 'Add your subjects and country'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-ds-2">
        {/* Owner, 2026-11-16: no "Email confirmed" badge. The warning stays: an
            unconfirmed email is something the tutor has to act on. */}
        {emailConfirmed === false ? <Tag tone="warning">Email not confirmed</Tag> : null}
        {step ? <Tag tone={step === 'Not applied' ? 'outline' : verifyTone(step)}>{verifyChip(step)}</Tag> : null}
      </div>
      <div className="flex flex-wrap gap-ds-2">
        <Button variant="outline" size="sm" onClick={() => router.push('/tutor/profile/edit')}>
          Edit profile
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push('/tutor/profile/preview')}>
          View as a family
        </Button>
      </div>
    </section>
  );

  const steps: { step: string; provide: string; result: string; done: boolean | null; href: string }[] = [
    { step: 'Account', provide: 'Name and email', result: 'Account with confirmed contact', done: emailConfirmed, href: '/tutor/settings?section=profile' },
    { step: 'Public profile', provide: 'Photo and bio', result: 'Families see who is teaching', done: completion.avatar && completion.bio, href: '/tutor/profile/edit' },
    { step: 'Group class', provide: 'Details and schedule', result: 'Class goes live', done: published === null ? null : published > 0, href: '/tutor/classes' },
    { step: 'One-on-one', provide: 'Times and price', result: 'Families book a valid slot', done: completion.loading ? null : completion.availability && completion.rate, href: '/tutor/availability' },
    { step: 'Verification', provide: 'One qualification document', result: 'Optional badge', done: step === null ? null : step === 'Approved', href: '/tutor/verification' },
    { step: 'Payouts', provide: 'Bank details', result: 'You get paid out', done: account === undefined ? null : Boolean(account), href: '/tutor/wallet?payout=1' },
  ];

  // Desktop shows the badge and payout account as cards above the list, so
  // the list there starts at Reviews.
  const rows = (desktop: boolean) => (
    <nav
      className={cn(
        'flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card',
        desktop ? 'hidden lg:flex' : 'flex lg:hidden'
      )}
      aria-label="Profile"
    >
      {desktop ? null : (
        <>
          <Row first href="/tutor/verification" icon={<SealCheck size={20} weight="bold" />} title="iTutor Verified" detail={step ? `Optional · ${step.toLowerCase()}` : 'Optional'} />
          <Row href="/tutor/wallet?payout=1" icon={<Bank size={20} weight="bold" />} title="Payout account" detail={accountLine} />
        </>
      )}
      <Row
        first={desktop}
        href="/tutor/reviews"
        icon={<Star size={20} weight="bold" />}
        title="Reviews"
        detail={reviews ? (reviews.count ? `${reviews.avg.toFixed(1)} from ${reviews.count} review${reviews.count === 1 ? '' : 's'}` : 'No reviews yet') : '…'}
      />
      <Row href="/tutor/settings" icon={<GearSix size={20} weight="bold" />} title="Settings" detail="Notifications, account and password" />
      <Row href="/help" icon={<Lifebuoy size={20} weight="bold" />} title="Help and support" />
      <button
        type="button"
        onClick={() => void logout()}
        className="ds-press flex min-h-[56px] w-full items-center gap-ds-3 bw-t-hair border-line-soft bg-transparent px-ds-card text-left cursor-pointer"
      >
        <span className="text-danger" aria-hidden>
          <SignOut size={20} weight="bold" />
        </span>
        <span className="flex-1 text-[15px] font-extrabold text-danger">Log out</span>
      </button>
    </nav>
  );

  return (
    <div className="flex flex-col gap-ds-4">
      <h1 className="ds-page-title m-0">Profile</h1>
      <div className="grid gap-ds-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
        <div className="flex flex-col gap-ds-4">
          {header}
          <Card eyebrow="Bio">
            {bioEditing ? (
              <div className="flex flex-col gap-ds-2 pt-ds-2">
                <label htmlFor="tutor-bio-inline" className="sr-only">
                  Bio
                </label>
                <textarea
                  id="tutor-bio-inline"
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={5}
                  autoFocus
                  disabled={bioSaving}
                  placeholder="What you teach, how you teach it, and who it suits."
                  className="w-full resize-y rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] py-[12px] font-body text-[16px] leading-[22px] text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60"
                />
                <span className={cn('text-[13px] font-bold', overLimit ? 'text-danger' : 'text-ink-muted')} aria-live="polite">
                  {draftWords} / {BIO_WORDS} words
                </span>
                {bioError ? (
                  <p role="alert" className="m-0 text-[14px] font-bold text-danger">
                    {bioError}
                  </p>
                ) : null}
                <div className="flex gap-ds-2">
                  <Button size="sm" disabled={bioSaving || overLimit} onClick={() => void saveBio()}>
                    {bioSaving ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" disabled={bioSaving} onClick={cancelBio}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-ds-2 pt-[2px]">
                <button
                  type="button"
                  onClick={startBio}
                  className="m-0 cursor-pointer border-0 bg-transparent p-0 text-left font-body text-[14px] leading-5 text-ink focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink"
                >
                  {bioText.trim() ? (
                    <span className="whitespace-pre-line">{bioText}</span>
                  ) : (
                    <span className="text-ink-muted">No bio yet. Families read this before they book.</span>
                  )}
                </button>
                <div>
                  <Button variant="outline" size="sm" onClick={startBio}>
                    <PencilSimple size={16} weight="bold" aria-hidden />
                    {bioText.trim() ? 'Edit' : 'Add bio'}
                  </Button>
                </div>
              </div>
            )}
          </Card>
          <section className="hidden flex-col gap-ds-3 lg:flex">
            <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">What each step unlocks</h2>
            <div className="overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card">
              <table className="w-full border-collapse text-left text-[14px]">
                <thead>
                  <tr className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">
                    <th className="px-ds-4 py-ds-3 font-extrabold">Step</th>
                    <th className="px-ds-4 py-ds-3 font-extrabold">You provide</th>
                    <th className="px-ds-4 py-ds-3 font-extrabold">Result</th>
                    <th className="px-ds-4 py-ds-3 font-extrabold">
                      <span className="sr-only">Status</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s) => (
                    <tr key={s.step} className="bw-t-hair border-line-soft">
                      <td className="px-ds-4 py-ds-3 font-extrabold text-ink">
                        <Link href={s.href} className="ds-link text-ink">
                          {s.step}
                        </Link>
                      </td>
                      <td className="px-ds-4 py-ds-3 text-ink-muted">{s.provide}</td>
                      <td className="px-ds-4 py-ds-3 text-ink-muted">{s.result}</td>
                      <td className="whitespace-nowrap px-ds-4 py-ds-3 text-right">
                        {s.done === null ? null : s.done ? (
                          <span className="inline-flex items-center gap-[4px] text-[13px] font-extrabold text-ink">
                            <Check size={14} weight="bold" aria-hidden /> Done
                          </span>
                        ) : (
                          <span className="text-[13px] font-bold text-ink-muted">Not yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-ds-4">
          <section className="hidden flex-col rounded-ds-card bw-hair border-border bg-surface-card p-ds-card lg:flex">
            <div className="flex items-center gap-ds-2">
              <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">iTutor Verified</h2>
              <Tag tone="outline">Optional</Tag>
            </div>
            <p className="m-0 mt-ds-1 text-[14px] text-ink-muted">
              Only an approved review shows the badge. Documents are seen only by the review team. Separate from payouts.
            </p>
            {step ? <StepList current={step} /> : <div className="mt-ds-3 h-[150px] animate-pulse rounded-ds-card bg-surface-sunken" />}
            {step === 'Not applied' || step === 'Changes requested' ? (
              <div className="mt-ds-4">
                <Button onClick={() => router.push('/tutor/verification')}>Apply for the badge</Button>
              </div>
            ) : null}
          </section>
          <section className="hidden flex-col gap-ds-1 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card lg:flex">
            <span className="text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">Payout account</span>
            <span className="font-display text-[17px] font-extrabold text-ink">{account ? account.bank_name ?? 'Bank account' : accountLine}</span>
            {last4 ? <span className="text-[14px] text-ink-muted">Ending {last4}</span> : null}
            <div className="mt-ds-3">
              <Button variant="outline" size="sm" onClick={() => router.push('/tutor/wallet?payout=1')}>
                {account ? 'Edit bank account' : 'Add bank account'}
              </Button>
            </div>
          </section>
          {rows(false)}
          {rows(true)}
        </div>
      </div>

      <AvatarUploadSheetV2
        isOpen={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        onUpload={onAvatarUpload}
        uploading={uploading}
        hasAvatar={Boolean(avatarUrl)}
        onRemovePhoto={onAvatarRemove}
      />
    </div>
  );
}

function Row({ href, icon, title, detail, first }: { href: string; icon: ReactNode; title: string; detail?: string; first?: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        'ds-press flex min-h-[56px] items-center gap-ds-3 px-ds-card py-ds-3 text-ink no-underline',
        !first && 'bw-t-hair border-line-soft'
      )}
    >
      <span className="text-ink" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">{title}</span>
        {detail ? <span className="block break-words text-[13px] text-ink-muted">{detail}</span> : null}
      </span>
      <CaretRight size={16} weight="bold" className="shrink-0" aria-hidden />
    </Link>
  );
}

