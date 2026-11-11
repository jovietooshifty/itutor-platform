'use client';

/**
 * ClassCover — a class's picture, the same on its Explore card and its page,
 * so opening a card reads as that card growing rather than a new screen.
 *
 * The parent screens no longer pass `image`: the frames draw every class as
 * its colour block (QA 10 Nov: one class with an upload broke the Explore
 * grid). The prop stays for any caller that wants the upload.
 *
 * The tutor's uploaded cover when there is one. Otherwise a panel in the
 * class's subject colour with its two-letter code: the same colour and code
 * as its SubjectTile everywhere else in the app. This replaced the
 * marketplace's subject gradients, where "math" matched Mathematics,
 * Spanish, History, Economics and Accounting alike and nearly every card was
 * the same coral-to-peach.
 *
 * PROVISIONAL VISUALS: no frame draws a cover-less class.
 */

import { cn } from '@/lib/utils';
import type { SubjectColor } from '@/components/ui';
import { subjectCode, subjectColor } from './subjectTile';

const FILL: Record<SubjectColor, string> = {
  green: 'bg-brand',
  yellow: 'bg-accent-yellow',
  orange: 'bg-accent-orange',
  sage: 'bg-on-ink-muted',
};

export interface ClassCoverProps {
  image?: string | null;
  /** Subject, or the class name when there is no subject. */
  subject: string | null | undefined;
  className?: string;
}

export function ClassCover({ image, subject, className }: ClassCoverProps) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- class covers are user
    // uploads on the allow-listed Supabase domain; next/image buys nothing here.
    return <img src={image} alt="" className={cn('block w-full object-cover', className)} />;
  }
  const color = subjectColor(subject);
  return (
    <div
      aria-hidden
      className={cn('relative flex w-full items-end overflow-hidden', FILL[color], className)}
    >
      <span className="pointer-events-none absolute -right-[4%] -top-[18%] select-none font-display text-[clamp(96px,14vw,180px)] font-extrabold leading-none text-ink/10">
        {subjectCode(subject)}
      </span>
      <span className="relative m-ds-3 rounded-ds-xs bg-ink px-ds-2 py-[3px] font-display text-[12px] font-extrabold uppercase tracking-[0.06em] text-on-ink">
        {subjectCode(subject)}
      </span>
    </div>
  );
}

export default ClassCover;
