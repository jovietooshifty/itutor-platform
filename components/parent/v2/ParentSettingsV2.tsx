'use client';

/**
 * ParentSettingsV2 — frame `160:7984`, read from Figma rather than inferred.
 *
 * Two things the frame settles that the build had wrong:
 *
 * NO BOTTOM NAV, AND A BACK LINK TO HOME. Settings is a detail screen reached
 * from the account sheet, not a tab destination. The Profile TAB goes to the
 * Profile screen (`160:8114`), which does carry the nav with Profile active.
 * SCREEN_MAP calls the account menu the "Profile tab root"; the frames
 * disagree with it, and the frames win.
 *
 * THE LIST IS SIX ROWS, not the five-section switcher this route used to be:
 * Profile, Payment methods, Notifications, Security, Billing, Help and
 * support — each with a one-line description. Above it sit two cards: the
 * parent's own account, and one per linked child.
 *
 * ONE DELIBERATE ADDITION, flagged rather than hidden. Calendar, Feedback and
 * Rewards are real routes with no frame in this file — SCREEN_MAP sources
 * them from Alejandro's file with node ids still pending. The old sidebar
 * carried them; the five-tab bar does not. Matching the frame exactly would
 * leave three live screens reachable only by typing a URL, so they are in a
 * second group, visually separate, until a frame says otherwise.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { useProfile } from '@/lib/hooks/useProfile';
import { DsIcon, type IconName } from '@/components/ui/icons';
import { rewardsVisible, useCredits } from '@/lib/credits/useCredits';
import '@/components/ui/ds-tokens.css';

type Child = { id: string; name: string };

const ROWS: Array<{ href: string; icon: IconName; label: string; detail: string }> = [
  { href: '/parent/profile', icon: 'profile', label: 'Profile', detail: 'Name, username, email' },
  { href: '/parent/settings?section=billing', icon: 'billing', label: 'Payment methods', detail: 'Cards on file' },
  { href: '/parent/settings?section=notifications', icon: 'bell', label: 'Notifications', detail: 'Classes and payments' },
  { href: '/parent/settings?section=security', icon: 'lock', label: 'Security', detail: 'Password' },
  { href: '/parent/billing', icon: 'billing', label: 'Billing', detail: 'Receipts' },
  { href: '/parent/help', icon: 'help', label: 'Help and support', detail: 'Contact the iTutor team' },
];

// See the header note: real routes with no frame in this file.
const UNFRAMED: Array<{ href: string; icon: IconName; label: string; detail: string }> = [
  { href: '/parent/calendar', icon: 'classes', label: 'Calendar', detail: 'Every session in one place' },
  { href: '/parent/feedback', icon: 'chat', label: 'Feedback', detail: 'Reports from your tutors' },
];

function Row({
  icon,
  label,
  detail,
  onClick,
  first,
}: {
  icon: IconName;
  label: string;
  detail: string;
  onClick: () => void;
  first: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-ds-3 px-ds-card py-ds-3 text-left',
        'border-0 bg-transparent cursor-pointer',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
        !first && 'bw-t-hair border-line-soft'
      )}
    >
      <span className="shrink-0 text-ink">
        <DsIcon name={icon} size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{label}</span>
        <span className="truncate font-body text-[13px] text-ink-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-ink-muted">
        <DsIcon name="chevron" size={18} />
      </span>
    </button>
  );
}

function AccountCard({
  initials,
  tone,
  title,
  detail,
  onClick,
}: {
  initials: string;
  tone: 'ink' | 'brand';
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-left',
        'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
      )}
    >
      <span
        className={cn(
          'flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-ds-sm',
          'font-display text-[15px] font-extrabold',
          tone === 'ink' ? 'bg-ink text-brand' : 'bg-brand text-ink'
        )}
      >
        {initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{title}</span>
        <span className="truncate font-body text-[13px] text-ink-muted">{detail}</span>
      </span>
      <span className="shrink-0 text-ink-muted">
        <DsIcon name="chevron" size={18} />
      </span>
    </button>
  );
}

export function ParentSettingsV2() {
  const router = useRouter();
  const { profile } = useProfile();
  const credits = useCredits('lite');
  const [children, setChildren] = useState<Child[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id);
      if (cancelled) return;
      const rows = (data ?? []).map((r: { child: unknown }) => {
        const c = (Array.isArray(r.child) ? r.child[0] : r.child) as
          | { id?: string; full_name?: string; display_name?: string }
          | null;
        return { id: c?.id ?? '', name: c?.display_name || c?.full_name || 'Child' };
      });
      setChildren(rows.filter((r) => r.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const name = profile?.display_name || profile?.full_name || 'Your account';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0] ?? '')
    .join('')
    .toUpperCase();

  const rows = rewardsVisible(credits.data)
    ? [...UNFRAMED, { href: '/parent/rewards', icon: 'billing' as IconName, label: 'Rewards', detail: 'Your iTutor credits' }]
    : UNFRAMED;

  return (
    <div className="flex flex-col gap-ds-4">
      <button
        type="button"
        onClick={() => router.push('/parent/dashboard')}
        className={cn(
          'flex items-center gap-ds-2 self-start border-0 bg-transparent p-0',
          'font-display text-[16px] font-extrabold text-ink cursor-pointer',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
        )}
      >
        <span className="rotate-180">
          <DsIcon name="chevron" size={20} />
        </span>
        Home
      </button>

      <h1 className="ds-page-title">Settings</h1>

      <AccountCard
        initials={initials || 'A'}
        tone="ink"
        title={name}
        detail={profile?.email ?? ''}
        onClick={() => router.push('/parent/profile')}
      />

      {children.map((c) => (
        <AccountCard
          key={c.id}
          initials={(c.name[0] ?? 'C').toUpperCase()}
          tone="brand"
          title={c.name}
          detail="Linked student account"
          onClick={() => router.push(`/parent/children/${c.id}`)}
        />
      ))}

      <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card">
        {ROWS.map((r, i) => (
          <Row
            key={r.href + r.label}
            icon={r.icon}
            label={r.label}
            detail={r.detail}
            first={i === 0}
            onClick={() => router.push(r.href)}
          />
        ))}
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card">
          {rows.map((r, i) => (
            <Row
              key={r.href}
              icon={r.icon}
              label={r.label}
              detail={r.detail}
              first={i === 0}
              onClick={() => router.push(r.href)}
            />
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={async () => {
          await supabase.auth.signOut();
          router.push('/login');
        }}
        className={cn(
          'flex w-full items-center justify-center gap-ds-2 rounded-ds-btn bw-bold border-ink bg-surface-card py-ds-3',
          'font-body text-[15px] font-extrabold text-danger cursor-pointer',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
        )}
      >
        Log out
      </button>
    </div>
  );
}

export default ParentSettingsV2;
