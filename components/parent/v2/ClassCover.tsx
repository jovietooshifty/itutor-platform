'use client';

/**
 * ClassCover — a class's picture, the same on its Explore card and its page,
 * so opening a card reads as that card growing rather than a new screen.
 *
 * BANNERS ARE SHOWN (14 Nov). Tutors make class banners in the Banner
 * Builder, and every one on production is 4:1 (1600x400 / 1280x320), so the
 * cover is drawn at aspect 4:1 by its callers and the banner is never cropped.
 * The colour block uses the same 4:1 box, so a grid mixing both keeps one
 * rhythm (the 10 Nov QA problem was a non-banner photo at a fixed height).
 * Built-in default thumbnails stored in cover_image are not banners and fall
 * back to the colour block, as does an image that fails to load.
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

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isDefaultThumbnail } from '@/lib/defaultThumbnails';
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
  const [failed, setFailed] = useState(false);
  if (image && !failed && !isDefaultThumbnail(image)) {
    // eslint-disable-next-line @next/next/no-img-element -- class covers are user
    // uploads on the allow-listed Supabase domain; next/image buys nothing here.
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('block w-full bg-surface-sunken object-cover', className)}
      />
    );
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
