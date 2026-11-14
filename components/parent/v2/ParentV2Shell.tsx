'use client';

/**
 * ParentV2Shell — the new parent app's chrome.
 *
 * Wraps `NewUiShell` with the five tabs SCREEN_MAP's logic row 2 approved
 * (Home · Explore · Classes · Billing · Account, down from eight) and wires
 * them to routes. It does not touch `ParentShell`, which still renders the old
 * dark app for everyone the flag is off for.
 *
 * TABS ARE ROUTES, NOT STATE. Each tab pushes a URL, so the back button, a
 * refresh and a shared link all behave. `active` is derived from the pathname
 * rather than held in state, which means a deep link into /parent/billing
 * highlights Billing without the page having to say so.
 *
 * THE BILLING DOT. SCREEN_MAP logic row 5 makes the bottom-nav badge one of the
 * two entry points into Fix failed payment, so it is driven by the real
 * `/api/parent/attention` feed rather than a prop a page might forget to pass.
 * It is fetched once here instead of in every screen.
 *
 * Header and tab bar are shown here because every screen in the Main tabs flow
 * is a main page. Detail pages and flows pass `nav={false}` per the Figma
 * files.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { NewUiShell, type NavItem } from '@/components/ui';
import ParentAccountSheet from '@/components/parent/v2/ParentAccountSheet';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { NotificationsPopover, prefersNotificationsPopover } from '@/components/ui/NotificationsPopover';

// Loaded on first open only.
const ParentNotificationsV2 = dynamic(() => import('./ParentNotificationsV2'), { ssr: false });

const TABS: Array<NavItem & { href: string }> = [
  { id: 'home', label: 'Home', icon: 'home', href: '/parent/dashboard' },
  { id: 'explore', label: 'Explore', icon: 'explore', href: '/parent/classes' },
  // The merged Upcoming/Past Classes tab (SCREEN_MAP logic row 1). The old
  // /parent/subscriptions and /parent/approvals both redirect to it.
  { id: 'classes', label: 'Classes', icon: 'classes', href: '/parent/my-classes' },
  { id: 'billing', label: 'Billing', icon: 'billing', href: '/parent/billing' },
  // QA handoff §1: the fifth tab is ACCOUNT and it lands on Settings, which
  // is now a tab root (nav shown, no back link). Profile is one row inside
  // it. The person icon is the Figma tab bar's.
  { id: 'account', label: 'Account', icon: 'profile', href: '/parent/settings' },
];

/**
 * Everything the Settings screen leads to belongs to the Account tab, so it
 * stays highlighted on the way down: Profile, the settings sub-screens, Help,
 * the household pages and the three unframed extras Settings links to.
 */
const ACCOUNT_PREFIXES = [
  '/parent/settings',
  '/parent/profile',
  '/parent/help',
  '/parent/children',
  '/parent/calendar',
  '/parent/feedback',
  '/parent/rewards',
  '/parent/messages',
];

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

function activeFromPath(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  if (ACCOUNT_PREFIXES.some((p) => under(pathname, p))) return 'account';
  // A tutor is opened from Explore (class page or the 1:1 tutors list).
  if (under(pathname, '/parent/tutors')) return 'explore';
  // Longest href first, so /parent/classes does not shadow a future
  // /parent/classes/[groupId] belonging to another tab.
  const match = [...TABS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => under(pathname, t.href));
  return match?.id;
}

export interface ParentV2ShellProps {
  children: ReactNode;
  /** Initials for the account chip. */
  initials?: string;
  nav?: boolean;
  header?: boolean;
  /** Content width from 768px up: 'wide' only for screens with a wide layout. */
  width?: 'reading' | 'wide';
  /** Header title once scrolled, from md up. Defaults to the current tab's name. */
  title?: string;
}

export default function ParentV2Shell({
  children,
  initials,
  nav = true,
  header = true,
  width = 'reading',
  title,
}: ParentV2ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [needsPayment, setNeedsPayment] = useState(false);
  const [unread, setUnread] = useState(false);
  // The header chip had no handler at all, so it looked interactive and
  // did nothing. It now opens the account sheet, which is also where the
  // five sidebar sections the tab bar displaced now live.
  const [accountOpen, setAccountOpen] = useState(false);
  // Large screens: the bell opens a popup instead of the page.
  const [notifOpen, setNotifOpen] = useState(false);
  const closeNotif = useCallback(() => setNotifOpen(false), []);
  const { profile } = useProfile();
  const profileName = profile?.display_name || profile?.full_name || undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/parent/attention', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const items: Array<{ kind: string }> = json.items ?? [];
        setNeedsPayment(items.some((i) => i.kind === 'payment'));
        setUnread(items.length > 0);
      } catch {
        // A chrome badge is not worth an error state. Leaving it off is the
        // honest failure: it under-reports rather than inventing a red dot.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const items: NavItem[] = TABS.map((t) =>
    t.id === 'billing' ? { ...t, badge: needsPayment } : { ...t }
  );

  const active = activeFromPath(pathname);

  return (
    <>
    <NewUiShell
      active={active}
      title={title ?? TABS.find((t) => t.id === active)?.label}
      items={items}
      nav={nav}
      header={header}
      width={width}
      unread={unread}
      initials={initials}
      onHeaderAction={(action) => {
        if (action !== 'bell') return;
        if (prefersNotificationsPopover() && pathname !== '/parent/notifications') setNotifOpen((o) => !o);
        else router.push('/parent/notifications');
      }}
      onAccount={() => setAccountOpen(true)}
      onSelect={(id) => {
        const tab = TABS.find((t) => t.id === id);
        if (tab) router.push(tab.href);
      }}
      logo={
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src="/brand/itutor-logo.svg"
          alt="iTutor"
          width={97}
          height={24}
          className="block h-6 w-auto"
        />
      }
      sideLogo={
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src="/brand/itutor-logo-on-dark.png" alt="iTutor" width={108} height={36} className="block h-9 w-auto" />
      }
      sideMark={
        /* The rail is 88px: the logo's mark only, cropped from the same image. */
        <span className="block h-9 w-[36px] overflow-hidden" aria-label="iTutor" role="img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/itutor-logo-on-dark.png" alt="" width={108} height={36} className="block h-9 w-auto max-w-none" />
        </span>
      }
    >
      {children}
    </NewUiShell>

    <NotificationsPopover open={notifOpen} onClose={closeNotif}>
      {notifOpen ? <ParentNotificationsV2 variant="panel" /> : null}
    </NotificationsPopover>

    <ParentAccountSheet
      open={accountOpen}
      onClose={() => setAccountOpen(false)}
      name={profileName}
      onLogout={async () => {
        await supabase.auth.signOut();
        router.push('/login');
      }}
    />
    </>
  );
}
