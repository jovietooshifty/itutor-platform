'use client';

/**
 * The class beside the Classes list, from lg up. Read-only: every class in
 * that list is one a child is already in (or was), so there is nothing to
 * join here. Enrolment changes stay on the class's own page, which the link
 * at the bottom opens.
 *
 * Same loader as the class page (fetchClassDetail), so the two cannot
 * disagree about what the class is. `countAsView` stays off: selecting a row
 * in your own list is not browsing the marketplace.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GroupData } from '@/components/classes/ClassDetailView';
import { fetchClassDetail } from '@/lib/classes/fetchClassDetail';
import { ParentClassDetailV2, type ChildEnrolment } from './ParentClassDetailV2';
import { EmptyCard } from './DetailScreen';

export function ClassPreviewPane({ groupId, enrolments }: { groupId: string; enrolments: ChildEnrolment[] }) {
  const [group, setGroup] = useState<GroupData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetchClassDetail(groupId, { countAsView: false })
      .then((g) => {
        if (cancelled) return;
        setGroup(g);
        setState(g ? 'ready' : 'missing');
      })
      .catch(() => !cancelled && setState('missing'));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (state === 'loading') {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        <div className="h-[140px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[34px] w-2/3 animate-pulse rounded-ds-sm bg-surface-sunken" />
        <div className="h-[120px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }
  if (state === 'missing' || !group) {
    return <EmptyCard title="This class is not available" body="It may have ended, or the tutor took it off the marketplace." />;
  }

  return (
    <div className="ds-rise flex flex-col gap-ds-4">
      <ParentClassDetailV2
        layout="pane"
        group={group}
        enrolments={enrolments}
        hasChildren
        canAddChild={false}
        isPaid={false}
        isPreorder={false}
        onJoin={() => undefined}
      />
      <Link
        href={`/parent/classes/${groupId}`}
        className="ds-link self-start font-display text-[15px] font-extrabold text-ink underline underline-offset-4"
      >
        Open class page
      </Link>
    </div>
  );
}

export default ClassPreviewPane;
