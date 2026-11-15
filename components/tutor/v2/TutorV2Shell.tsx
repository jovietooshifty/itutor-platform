'use client';

/**
 * TutorV2Shell — the new tutor app's chrome, from the Design canvas
 * "iTutor Teacher UI" (m06 phone tab bar, d01 desktop sidebar).
 *
 * Phone: five tabs, Home · Classes · Messages · Wallet · Profile.
 * Desktop sidebar: the same four main items, then "Grow" (Insights) and
 * "Account" (Profile, Settings), with the "me" card at the foot. The canvas
 * also draws "Coupons & scholarships" and "Invite a teacher" under Grow; the
 * owner hid both (2026-11-14) because neither has a backend yet.
 *
 * TABS ARE ROUTES: `active` comes from the pathname. Sessions belongs to the
 * Classes tab (the canvas puts it in a Classes segment).
 *
 * TutorShell is mounted per page, not in a layout, so a page opts in by
 * rendering this instead. What TutorShell did beyond chrome is kept here:
 * - the tutor-only role gate, with the same admin "Enter as Tutor" exception
 *   for /tutor/classes/<id>;
 * - the suspension check.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NewUiShell, type NavItem } from '@/components/ui';
import { useProfile } from '@/lib/hooks/useProfile';
import { useSuspensionCheck } from '@/lib/hooks/useSuspensionCheck';
import { supabase } from '@/lib/supabase/client';
import { parentInitials } from '@/components/parent/v2/initials';

type Tab = NavItem & { href: string; also?: string[] };

const TABS: Tab[] = [
  { id: 'home', label: 'Home', icon: 'home', href: '/tutor/dashboard' },
  { id: 'classes', label: 'Classes', icon: 'teach', href: '/tutor/classes', also: ['/tutor/sessions'] },
  { id: 'messages', label: 'Messages', icon: 'messages', href: '/tutor/messages' },
  { id: 'wallet', label: 'Wallet', icon: 'wallet', href: '/tutor/wallet' },
  { id: 'insights', label: 'Insights', icon: 'insights', href: '/tutor/analytics', group: 'Grow', sideOnly: true },
  { id: 'profile', label: 'Profile', icon: 'profile', href: '/tutor/profile', group: 'Account' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '/tutor/settings', sideOnly: true },
];

function activeFromPath(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  let best: { id: string; len: number } | undefined;
  for (const t of TABS) {
    for (const base of [t.href, ...(t.also ?? [])]) {
      if ((pathname === base || pathname.startsWith(`${base}/`)) && (!best || base.length > best.len)) {
        best = { id: t.id, len: base.length };
      }
    }
  }
  return best?.id;
}

export interface TutorV2ShellProps {
  children: ReactNode;
  nav?: boolean;
  header?: boolean;
  width?: 'reading' | 'wide';
  /** Header title once scrolled, from md up. Defaults to the current tab's name. */
  title?: string;
  bottomBar?: ReactNode;
}

export default function TutorV2Shell({
  children,
  nav = true,
  header = true,
  width = 'reading',
  title,
  bottomBar,
}: TutorV2ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading } = useProfile();
  useSuspensionCheck();
  const [unreadNotifs, setUnreadNotifs] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  // Same gate as TutorShell, same exception for an admin entering a class.
  const isClassDetailPage = /^\/tutor\/classes\/[^/]+$/.test(pathname ?? '');
  useEffect(() => {
    if (!loading && profile && profile.role !== 'tutor' && !isClassDetailPage) {
      router.replace('/login');
    }
  }, [loading, profile, router, isClassDetailPage]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      // Chrome counts are not worth an error state: on failure they stay off.
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('is_read', false); // `is_read`, not `read`
      if (!cancelled) setUnreadNotifs((count ?? 0) > 0);

      const { data: convs } = await supabase
        .from('conversations')
        .select('id')
        .or(`participant_1_id.eq.${profile.id},participant_2_id.eq.${profile.id}`)
        .limit(200);
      const ids = (convs ?? []).map((c: { id: string }) => c.id);
      if (!ids.length) {
        if (!cancelled) setUnreadMessages(0);
        return;
      }
      const { count: msgCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', ids)
        .neq('sender_id', profile.id)
        .eq('is_read', false);
      if (!cancelled) setUnreadMessages(msgCount ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, pathname]);

  const active = activeFromPath(pathname);
  const items: NavItem[] = TABS.map((t) =>
    t.id === 'messages' ? { ...t, count: unreadMessages } : t
  );
  const initials = parentInitials(profile);
  const name = profile?.display_name || profile?.full_name || 'Teacher';

  return (
    <NewUiShell
      active={active}
      title={title ?? TABS.find((t) => t.id === active)?.label}
      items={items}
      nav={nav}
      header={header}
      width={width}
      bottomBar={bottomBar}
      unread={unreadNotifs}
      initials={initials}
      headerActions={['bell']}
      onHeaderAction={(action) => {
        if (action === 'bell') router.push('/tutor/notifications');
      }}
      onAccount={() => router.push('/tutor/profile')}
      onSelect={(id) => {
        const tab = TABS.find((t) => t.id === id);
        if (tab) router.push(tab.href);
      }}
      logo={
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src="/brand/itutor-mark.svg" alt="iTutor" width={30} height={26} className="block h-[26px] w-[30px]" />
      }
      sideLogo={
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src="/brand/itutor-logo-on-dark.png" alt="iTutor" width={108} height={36} className="block h-9 w-auto" />
      }
      sideMark={
        <span className="block h-9 w-[36px] overflow-hidden" aria-label="iTutor" role="img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/itutor-logo-on-dark.png" alt="" width={108} height={36} className="block h-9 w-auto max-w-none" />
        </span>
      }
      sideFooter={
        <button
          type="button"
          onClick={() => router.push('/tutor/profile')}
          className="flex w-full items-center gap-ds-3 rounded-ds-sm border-0 bg-transparent p-ds-2 text-left font-body cursor-pointer [@media(hover:hover)_and_(pointer:fine)]:hover:bg-ink-raised"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand font-display text-[13px] font-extrabold text-ink">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold text-on-ink">{name}</span>
            <span className="block text-[12px] text-on-ink-muted">Teacher</span>
          </span>
        </button>
      }
    >
      {children}
    </NewUiShell>
  );
}
