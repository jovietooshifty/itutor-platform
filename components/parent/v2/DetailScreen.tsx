'use client';

/**
 * DetailScreen — the frame for every parent screen that is not a main tab.
 *
 * The design system hides the tab bar on detail pages and flows and puts a
 * back link at the top instead (Settings, 160:7984). Every screen below the
 * five tabs uses this so they all read as one app: same back link, same title
 * size (the system's page-title, 28px), no subtitle under the title.
 *
 * The back link goes to wherever the parent came from when there is history,
 * and to `fallbackHref` otherwise — a deep link from a notification or an
 * email has no previous page, and router.back() would leave the app.
 */

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import ParentV2Shell from '@/components/parent/v2/ParentV2Shell';
import { parentInitials } from '@/components/parent/v2/initials';
import { DsIcon } from '@/components/ui/icons';

export interface DetailScreenProps {
  /** Shown beside the back arrow: where it goes, e.g. "Settings". */
  backLabel: string;
  /** Used when there is no in-app history to go back to. */
  fallbackHref: string;
  title?: ReactNode;
  /** Sits on the title's line, right-aligned (e.g. "Mark all read"). */
  action?: ReactNode;
  children: ReactNode;
}

export function DetailScreen({ backLabel, fallbackHref, title, action, children }: DetailScreenProps) {
  const router = useRouter();
  const { profile } = useProfile();

  const back = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push(fallbackHref);
  };

  return (
    <ParentV2Shell initials={parentInitials(profile)} nav={false}>
      <div className="flex flex-col gap-ds-4">
        <button
          type="button"
          onClick={back}
          className="flex items-center gap-ds-2 self-start border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
        >
          <span className="rotate-180">
            <DsIcon name="chevron" size={20} />
          </span>
          {backLabel}
        </button>
        {title || action ? (
          <div className="flex items-end justify-between gap-ds-3">
            {title ? (
              <h1 className="min-w-0 font-display text-[28px] font-extrabold leading-[32px] text-ink">{title}</h1>
            ) : (
              <span />
            )}
            {action}
          </div>
        ) : null}
        {children}
      </div>
    </ParentV2Shell>
  );
}

/** Skeleton for a DetailScreen body while it loads. */
export function DetailSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-ds-3" aria-busy>
      <div className="h-[120px] animate-pulse rounded-ds-card bg-surface-sunken" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" />
      ))}
    </div>
  );
}

/** One-line "nothing here" card with an optional way forward. */
export function EmptyCard({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <p className="font-display text-[16px] font-extrabold text-ink">{title}</p>
      {body ? <p className="font-body text-[13px] text-ink-muted">{body}</p> : null}
      {action}
    </div>
  );
}

export default DetailScreen;
