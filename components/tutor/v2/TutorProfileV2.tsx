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
  CaretRight,
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
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import { parentInitials } from '@/components/parent/v2/initials';
import TutorV2Shell from './TutorV2Shell';
import { StepList } from './TutorVerificationV2';
import { fetchVerification, verifyChip, verifyStep, verifyTone, type VerificationState } from './verificationSteps';

type Account = { bank_name: string | null; payout_account_identifier: string | null } | null;

export default function TutorProfileV2() {
  return (
    <TutorV2Shell title="Profile" width="wide">
      <ProfileBody />
    </TutorV2Shell>
  );
}

function ProfileBody() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const completion = useTutorCompletion(profile);
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
        <span className="flex size-[64px] shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-brand font-display text-[22px] font-extrabold text-ink">
          {profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            parentInitials(profile)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="m-0 break-words font-display text-[20px] font-extrabold leading-[24px] text-ink">{name}</h2>
          <p className="m-0 mt-[2px] text-[14px] text-ink-muted">
            {[subject, profile.country].filter(Boolean).join(' · ') || 'Add your subjects and country'}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-ds-2">
        {emailConfirmed === null ? null : emailConfirmed ? (
          <Tag tone="brand">Email confirmed</Tag>
        ) : (
          <Tag tone="warning">Email not confirmed</Tag>
        )}
        {step ? <Tag tone={step === 'Not applied' ? 'outline' : verifyTone(step)}>{verifyChip(step)}</Tag> : null}
      </div>
      <div className="flex flex-wrap gap-ds-2">
        <Button variant="outline" size="sm" onClick={() => router.push('/tutor/profile/edit')}>
          Edit profile
        </Button>
        <Button variant="outline" size="sm" onClick={() => router.push(publicHref)}>
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
      <div className="grid gap-ds-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="flex flex-col gap-ds-4">
          {header}
          <Card
            eyebrow="Bio"
            body={profile.bio?.trim() ? <span className="whitespace-pre-line">{profile.bio}</span> : 'No bio yet. Families read this before they book.'}
          />
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
                      <td className="px-ds-4 py-ds-3 text-right">
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

