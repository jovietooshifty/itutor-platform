'use client';

/**
 * StudentV2Shell — the new student app's chrome (Figma `rwytRx6xmRHf4AMzpxAznd`,
 * 25 Oct core screens, section 2:2705).
 *
 * Four tabs, as every core frame draws them: Home · Explore · Classes ·
 * Billing. The old StudentShell had six (My Bookings, Subscriptions and
 * Rewards on top); the approved student SCREEN_MAP folds My Bookings into
 * Classes, makes Subscriptions the Billing tab, and moves Rewards to the
 * credits pill in the header.
 *
 * TABS ARE ROUTES, as in ParentV2Shell: `active` comes from the pathname, so a
 * deep link highlights the right tab without the page saying so.
 *
 * Header: search (→ Explore), bell (→ Notifications, red dot when anything is
 * unread), and the avatar (→ Settings, the frames have no account sheet for
 * students). The credits pill shows only when `rewardsVisible` — the same rule
 * the old sidebar used for its Rewards item, so nothing changes for a student
 * with no credits and no programme switched on.
 *
 * This shell does NOT replace StudentShell for every page. app/student/layout
 * only steps aside for routes that have a new screen (see StudentLayoutSwitch);
 * every other student page keeps the old shell until its flow is built.
 */

import { useEffect, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import { Gift } from '@phosphor-icons/react';
import { NewUiShell, type NavItem } from '@/components/ui';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { fmtCredits, rewardsVisible, useCredits } from '@/lib/credits/useCredits';
import { parentInitials } from '@/components/parent/v2/initials';

// The old shell registered the push token; the new one has to as well, or a
// student on the new UI silently stops getting class reminders.
const PushTokenRegistrar = dynamic(() => import('@/components/push/PushTokenRegistrar'), {
  ssr: false,
});

const TABS: Array<NavItem & { href: string }> = [
  { id: 'home', label: 'Home', icon: 'home', href: '/student/dashboard' },
  { id: 'explore', label: 'Explore', icon: 'explore', href: '/student/find-tutors' },
  { id: 'classes', label: 'Classes', icon: 'classes', href: '/student/classes' },
  { id: 'billing', label: 'Billing', icon: 'billing', href: '/student/subscriptions' },
];

function activeFromPath(pathname: string | null): string | undefined {
  if (!pathname) return undefined;
  // Class pages for a class not yet joined live under /student/explore.
  if (pathname.startsWith('/student/explore/')) return 'explore';
  const match = [...TABS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`));
  return match?.id;
}

/** "TT$100" for whole amounts, as the frames draw it; cents only when there are some. */
function pillAmount(n: number): string {
  return fmtCredits(n).replace(/\.00$/, '');
}

export interface StudentV2ShellProps {
  children: ReactNode;
  nav?: boolean;
  header?: boolean;
  width?: 'reading' | 'wide';
  /** Header title once scrolled, from md up. Defaults to the current tab's name. */
  title?: string;
  /** See NewUiShell's bottomBar. */
  bottomBar?: ReactNode;
}

export default function StudentV2Shell({
  children,
  nav = true,
  header = true,
  width = 'reading',
  title,
  bottomBar,
}: StudentV2ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useProfile();
  const credits = useCredits('lite', Boolean(profile?.id));
  const [unread, setUnread] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      // Own rows only (RLS). A chrome dot is not worth an error state: on any
      // failure it stays off rather than inventing a notification.
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        // `is_read`, not `read`: the column the table actually has.
        .eq('is_read', false);
      if (!cancelled) setUnread((count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, pathname]);

  const active = activeFromPath(pathname);
  const showCredits = rewardsVisible(credits.data);
  const balance = credits.data?.wallet?.available ?? 0;

  return (
    <>
      {profile?.id ? <PushTokenRegistrar /> : null}
      <NewUiShell
        active={active}
        title={title ?? TABS.find((t) => t.id === active)?.label}
        items={TABS}
        nav={nav}
        header={header}
        width={width}
        bottomBar={bottomBar}
        unread={unread}
        initials={parentInitials(profile)}
        headerActions={['search', 'bell']}
        headerExtra={
          showCredits ? (
            <button
              type="button"
              onClick={() => router.push('/student/rewards')}
              aria-label={`Credits: ${pillAmount(balance)}`}
              className="ds-press mr-ds-1 inline-flex h-[34px] items-center gap-ds-1h rounded-ds-sm border-0 bg-ink px-ds-3 font-display text-[13px] font-extrabold tabular-nums text-accent-yellow cursor-pointer"
            >
              <Gift size={16} weight="bold" aria-hidden />
              {pillAmount(balance)}
            </button>
          ) : null
        }
        onHeaderAction={(action) => {
          if (action === 'bell') router.push('/student/notifications');
          if (action === 'search') router.push('/student/find-tutors');
        }}
        onAccount={() => router.push('/student/settings')}
        onSelect={(id) => {
          const tab = TABS.find((t) => t.id === id);
          if (tab) router.push(tab.href);
        }}
        logo={
          /* eslint-disable-next-line @next/next/no-img-element */
          // The student frames draw the mark alone (2:456, 30x26), not the
          // wordmark the parent header uses. Exported from the frame.
          <img
            src="/brand/itutor-mark.svg"
            alt="iTutor"
            width={30}
            height={26}
            className="block h-[26px] w-[30px]"
          />
        }
        sideLogo={
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src="/brand/itutor-logo-on-dark.png"
            alt="iTutor"
            width={108}
            height={36}
            className="block h-9 w-auto"
          />
        }
        sideMark={
          <span className="block h-9 w-[36px] overflow-hidden" aria-label="iTutor" role="img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/itutor-logo-on-dark.png"
              alt=""
              width={108}
              height={36}
              className="block h-9 w-auto max-w-none"
            />
          </span>
        }
      >
        {children}
      </NewUiShell>
    </>
  );
}
