'use client';

/**
 * ParentV2Shell — the new parent app's chrome.
 *
 * Wraps `NewUiShell` with the five tabs SCREEN_MAP's logic row 2 approved
 * (Home · Explore · Classes · Billing · Profile, down from eight) and wires
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

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { NewUiShell, type NavItem } from '@/components/ui';

const TABS: Array<NavItem & { href: string }> = [
  { id: 'home', label: 'Home', icon: 'home', href: '/parent/dashboard' },
  { id: 'explore', label: 'Explore', icon: 'explore', href: '/parent/classes' },
  // The merged Upcoming/Past Classes tab (SCREEN_MAP logic row 1). The old
  // /parent/subscriptions and /parent/approvals both redirect to it.
  { id: 'classes', label: 'Classes', icon: 'classes', href: '/parent/my-classes' },
  { id: 'billing', label: 'Billing', icon: 'billing', href: '/parent/billing' },
  { id: 'profile', label: 'Profile', icon: 'profile', href: '/parent/settings' },
];

function activeFromPath(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  // Longest href first, so /parent/classes does not shadow a future
  // /parent/classes/[groupId] belonging to another tab.
  const match = [...TABS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return match?.id;
}

export interface ParentV2ShellProps {
  children: ReactNode;
  /** Initials for the account chip. */
  initials?: string;
  nav?: boolean;
  header?: boolean;
}

export default function ParentV2Shell({
  children,
  initials,
  nav = true,
  header = true,
}: ParentV2ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [needsPayment, setNeedsPayment] = useState(false);
  const [unread, setUnread] = useState(false);

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

  return (
    <NewUiShell
      active={activeFromPath(pathname)}
      items={items}
      nav={nav}
      header={header}
      unread={unread}
      initials={initials}
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
    >
      {children}
    </NewUiShell>
  );
}
