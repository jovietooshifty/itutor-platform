'use client';

/**
 * Find Your iTutor, new UI — the pieces every Finder screen is built from.
 *
 * Drawn from the Figma onboarding set (student file rwytRx6xmRHf4AMzpxAznd):
 * OB05 "Pick a subject", OB07 "Pick lesson times", OB08 "Finding tutors",
 * PO01/PO03 (the parent path's questions) and PO05 (matches). The frames are
 * 390px; from md up the same column is centred, like the auth screens.
 *
 * ROLE COLOURS follow the auth set: a student's selections and buttons are
 * brand green, a parent's are navy (#0f2e47). Navy is not a DS token yet, so
 * it lives here and in AuthKit as a literal.
 *
 * Every Finder screen sits outside the app shells (nobody need be signed in),
 * so FinderFrame supplies `.ds-root` itself.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react';
import '@/components/ui/ds-tokens.css';
import { DS_ROOT_CLASS } from '@/components/ui';
import { cn } from '@/lib/utils';

export type FinderTone = 'student' | 'parent';

const NAVY = '#0f2e47';

/** Selected option fill + the ink lip under it (OB07 / PO01). */
const SELECTED: Record<FinderTone, string> = {
  student: 'bg-brand text-ink border-ink shadow-[0_4px_0_rgb(var(--ds-ink))]',
  parent: 'bg-[#0f2e47] text-on-ink border-ink shadow-[0_4px_0_#05111c]',
};
/** The icon tile inside a selected option flips to the opposite fill. */
const SELECTED_TILE: Record<FinderTone, string> = {
  student: 'bg-ink text-brand border-ink',
  parent: 'bg-surface-card text-[#0f2e47] border-surface-card',
};
const FILL: Record<FinderTone, string> = { student: 'bg-brand', parent: 'bg-[#0f2e47]' };
const BUTTON: Record<FinderTone, string> = {
  student: 'bg-brand text-ink shadow-[0_4px_0_rgb(var(--ds-ink))] active:shadow-[0_2px_0_rgb(var(--ds-ink))]',
  parent: 'bg-[#0f2e47] text-on-ink shadow-[0_4px_0_#05111c] active:shadow-[0_2px_0_#05111c]',
};

const FOCUS =
  'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink';

/** Page frame. `wide` is for the result grids; questions stay a 440 column. */
export function FinderFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn(DS_ROOT_CLASS, 'min-h-[100dvh] bg-surface-page font-body text-ink')}>
      <div
        className={cn(
          'mx-auto flex min-h-[100dvh] w-full flex-col md:pt-6',
          wide ? 'max-w-[1040px]' : 'max-w-[440px]'
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Back button + segmented progress + "n/N" (OB05 header). */
export function FinderTopBar({
  onBack,
  backHref,
  progress,
  tone,
  right,
}: {
  onBack?: () => void;
  backHref?: string;
  /** `index` is zero-based. Omit on screens that are not a question. */
  progress?: { index: number; total: number };
  tone: FinderTone;
  right?: ReactNode;
}) {
  const cls = cn('grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink', FOCUS);
  const back = onBack ? (
    <button type="button" onClick={onBack} aria-label="Back" className={cls}>
      <ArrowLeft className="size-[22px]" strokeWidth={2.25} />
    </button>
  ) : backHref ? (
    <Link href={backHref} aria-label="Back" className={cls}>
      <ArrowLeft className="size-[22px]" strokeWidth={2.25} />
    </Link>
  ) : (
    <span className="h-11 w-11 shrink-0" aria-hidden />
  );
  return (
    <div className="flex h-[60px] shrink-0 items-center gap-ds-3 pl-1 pr-4">
      {back}
      {progress ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={progress.total}
            aria-valuenow={progress.index + 1}
            aria-label={`Question ${progress.index + 1} of ${progress.total}`}
            className="h-[14px] min-w-0 flex-1 overflow-hidden rounded-ds-full bw-bold border-ink bg-surface-card"
          >
            <div
              className={cn('h-full rounded-ds-full transition-[width] duration-300 ease-out', FILL[tone])}
              style={{ width: `${((progress.index + 1) / progress.total) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-ink">
            {progress.index + 1}/{progress.total}
          </span>
        </>
      ) : (
        <span className="flex-1" />
      )}
      {right}
    </div>
  );
}

export function FinderTitle({
  children,
  headingRef,
}: {
  children: ReactNode;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.3px] text-ink outline-none"
    >
      {children}
    </h1>
  );
}

export function FinderLead({ children }: { children: ReactNode }) {
  return <p className="-mt-1 text-[15px] leading-[1.4] text-ink-muted">{children}</p>;
}

/** One answer (OB07 / PO01): icon tile, label, optional detail. */
export function OptionCard({
  label,
  detail,
  badge,
  icon,
  selected,
  multi = false,
  tone,
  onSelect,
}: {
  label: string;
  detail?: string;
  badge?: string;
  icon?: ReactNode;
  selected: boolean;
  multi?: boolean;
  tone: FinderTone;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-ds-3 rounded-[10px] px-[14px] py-[12px] text-left',
        'transition-[transform,box-shadow,background-color] duration-[90ms] ease-[cubic-bezier(.23,1,.32,1)] active:translate-y-[2px]',
        '[-webkit-tap-highlight-color:transparent]',
        FOCUS,
        selected ? cn('bw-bold', SELECTED[tone]) : 'bw-hair border-border bg-surface-card text-ink hover:border-ink'
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-[8px] bw-hair',
            selected ? SELECTED_TILE[tone] : 'border-ink bg-surface-card text-ink'
          )}
        >
          {icon}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'grid size-6 shrink-0 place-items-center bw-bold',
            multi ? 'rounded-[6px]' : 'rounded-full',
            selected ? 'border-current bg-surface-card text-ink' : 'border-border bg-surface-card text-transparent'
          )}
        >
          <Check className="size-[14px]" strokeWidth={3} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-ds-2">
          <span className="text-[16px] font-extrabold leading-[1.25]">{label}</span>
          {badge ? (
            <span className="rounded-[4px] bw-hair border-ink bg-accent-yellow px-[6px] py-[1px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink">
              {badge}
            </span>
          ) : null}
        </span>
        {detail ? (
          <span className={cn('mt-[2px] block text-[13px] leading-[1.35]', selected && tone === 'parent' ? 'text-on-ink-muted' : 'text-ink-muted')}>
            {detail}
          </span>
        ) : null}
      </span>
      {icon && multi ? (
        <Check aria-hidden className={cn('size-5 shrink-0', selected ? 'opacity-100' : 'opacity-0')} strokeWidth={3} />
      ) : null}
    </button>
  );
}

/** The subject list (OB05): one bordered card, a row per subject. */
export function SubjectList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] bw-bold border-ink bg-surface-card px-[14px]">{children}</div>
  );
}

export function SubjectRow({
  subject,
  badge,
  selected,
  tone,
  onSelect,
}: {
  subject: string;
  badge?: string;
  selected: boolean;
  tone: FinderTone;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-ds-3 bw-b-hair border-line-soft py-[10px] text-left last:border-b-0',
        '[-webkit-tap-highlight-color:transparent]',
        FOCUS
      )}
    >
      <span className="min-w-0 flex-1 py-[6px]">
        <span className="block text-[16px] font-extrabold leading-[1.25] text-ink [overflow-wrap:anywhere]">{subject}</span>
        {badge ? <span className="text-[12px] font-extrabold text-brand-edge">{badge}</span> : null}
      </span>
      {/* A tick box, not a chevron: the list is multi-select. */}
      <span
        aria-hidden
        className={cn(
          'grid size-6 shrink-0 place-items-center rounded-[6px] bw-bold',
          selected
            ? tone === 'parent'
              ? 'border-[#0f2e47] bg-[#0f2e47] text-on-ink'
              : 'border-ink bg-brand text-ink'
            : 'border-border-strong bg-surface-card text-transparent'
        )}
      >
        <Check className="size-[14px]" strokeWidth={3} />
      </span>
    </button>
  );
}

/** The 56px stamped button in the role's colour. Link when given href. */
export function FinderButton({
  tone,
  href,
  onClick,
  disabled,
  children,
  arrow = true,
  type = 'button',
}: {
  tone: FinderTone | 'outline';
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  arrow?: boolean;
  type?: 'button' | 'submit';
}) {
  const cls = cn(
    'inline-flex h-14 w-full items-center justify-center gap-[10px] rounded-[10px] bw-bold border-ink px-5 mb-1',
    'font-body text-[17px] font-extrabold leading-none',
    'transition-[transform,box-shadow] duration-[90ms] ease-[cubic-bezier(.23,1,.32,1)] active:translate-y-[2px]',
    '[-webkit-tap-highlight-color:transparent] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0',
    FOCUS,
    tone === 'outline'
      ? 'bg-surface-card text-ink shadow-[0_4px_0_rgb(var(--ds-ink))] active:shadow-[0_2px_0_rgb(var(--ds-ink))]'
      : BUTTON[tone]
  );
  const body = (
    <>
      {children}
      {arrow ? <ArrowRight aria-hidden className="size-5" strokeWidth={2.5} /> : null}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls}>
      {body}
    </button>
  );
}

/** Underlined bold text link, 44px tall for the thumb. */
export function FinderLink({
  href,
  onClick,
  children,
  className,
  ariaLabel,
}: {
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const cls = cn(
    'inline-flex min-h-[44px] items-center text-[15px] font-extrabold text-ink underline underline-offset-2',
    FOCUS,
    className
  );
  return href ? (
    <Link href={href} className={cls} aria-label={ariaLabel}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

/**
 * OB08 "Finding tutors". Shown ONLY while the submit is genuinely in flight —
 * the Finder never pads a fast response to look busy — so the bar is
 * indeterminate rather than a fake percentage.
 */
export function FindingScreen({ subject, who }: { subject: string | null; who: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      // The background is inline on purpose: .ds-root paints the page surface
      // and beat the bg-[#10301d] utility, leaving white text on a light page.
      className={cn(DS_ROOT_CLASS, 'fixed inset-0 z-50 flex flex-col font-body text-on-ink')}
      style={{ background: '#10301d', color: '#fff' }}
    >
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10">
        <div className="flex flex-1 items-center">
          <p className="font-display text-[36px] font-extrabold leading-[1.1] tracking-[-0.36px] text-white">
            Finding {subject ? `${subject} classes` : 'classes'} that fit{' '}
            <span className="rounded-[6px] bg-[#f5a524] px-2 text-ink [box-decoration-break:clone]">{who}</span>
          </p>
        </div>
        <div className="h-[10px] overflow-hidden rounded-ds-full bg-white/15">
          <div className="finder-indeterminate h-full w-2/5 rounded-ds-full bg-brand" />
        </div>
        <p className="mt-ds-3 text-[14px] font-extrabold text-on-ink-muted">Checking times that suit you</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/auth/wordmark.png" alt="" aria-hidden className="mt-ds-5 h-[29px] w-[120px] object-contain object-left brightness-0 invert" />
      </div>
      <style>{`
        @keyframes finder-indeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
        .finder-indeterminate { animation: finder-indeterminate 1.1s cubic-bezier(.65,0,.35,1) infinite; }
        @media (prefers-reduced-motion: reduce) { .finder-indeterminate { animation: none; width: 60%; } }
      `}</style>
    </div>
  );
}

function ttd(n: number): string {
  return `TT$${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export interface FinderMatchCardData {
  id: string;
  title: string;
  tutor: string;
  tutorAvatar: string | null;
  subject: string;
  level: string;
  schedule: string;
  format: 'online' | 'physical' | 'hybrid';
  venueArea: string | null;
  monthlyPrice: number;
  verified: boolean;
  seatsLeft: number | null;
}

/** A match (PO05): avatar, class, tutor, verified, schedule strip, price. */
export function FinderMatchCard({
  card,
  href,
  bestFit = false,
  tone,
  note,
}: {
  card: FinderMatchCardData;
  href: string;
  bestFit?: boolean;
  tone: FinderTone;
  note?: ReactNode;
}) {
  const formatLabel =
    card.format === 'physical'
      ? `In person${card.venueArea ? ` · ${card.venueArea}` : ''}`
      : card.format === 'hybrid'
        ? 'Online or in person'
        : 'Online';
  return (
    <Link
      href={href}
      className={cn(
        'relative flex flex-col gap-ds-3 rounded-[10px] bw-bold border-ink bg-surface-card p-[14px] text-left',
        bestFit
          ? tone === 'parent'
            ? 'shadow-[0_5px_0_#0f2e47]'
            : 'shadow-[0_5px_0_#0f6e3f]'
          : 'shadow-[0_4px_0_rgb(var(--ds-ink))]',
        'transition-[transform,box-shadow] duration-[90ms] ease-[cubic-bezier(.23,1,.32,1)] active:translate-y-[2px]',
        FOCUS
      )}
    >
      {bestFit ? (
        <span className="absolute -top-[12px] right-[10px] rotate-[4deg] rounded-[5px] bw-bold border-ink bg-[#f5a524] px-2 py-[3px] text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink">
          Best fit
        </span>
      ) : null}
      <div className="flex items-start gap-ds-3">
        {card.tutorAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.tutorAvatar} alt="" className="size-14 shrink-0 rounded-full bw-bold border-ink object-cover" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bw-bold border-ink bg-surface-sunken font-display text-[20px] font-extrabold text-ink">
            {card.tutor.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[18px] font-extrabold leading-[1.15] text-ink [overflow-wrap:anywhere]">
            {card.title}
          </h3>
          <p className="mt-[2px] truncate text-[13px] text-ink-muted">
            {card.tutor}
            {card.level || card.subject ? ` · ${[card.level, card.subject].filter(Boolean).join(' ')}` : ''}
          </p>
          {card.verified ? (
            <span className="mt-ds-1 inline-flex items-center gap-[4px] rounded-ds-full bw-hair border-brand-edge bg-[#e6f7ec] px-2 py-[2px] text-[12px] font-extrabold text-ink">
              <ShieldCheck aria-hidden className="size-[14px] text-brand-edge" strokeWidth={2.5} />
              iTutor Verified
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex items-end justify-between gap-ds-3 bw-t-hair border-line-soft pt-ds-2">
        <p className="min-w-0 text-[13px] font-extrabold leading-[1.3] text-ink">
          {[formatLabel, card.schedule].filter(Boolean).join(' · ')}
          {card.seatsLeft !== null && card.seatsLeft <= 3 ? (
            <span className="block font-normal text-ink-muted">
              {card.seatsLeft === 0 ? 'Full' : `${card.seatsLeft} ${card.seatsLeft === 1 ? 'seat' : 'seats'} left`}
            </span>
          ) : null}
        </p>
        <p className="shrink-0 whitespace-nowrap font-display text-[19px] font-extrabold text-ink">
          {card.monthlyPrice > 0 ? (
            <>
              {ttd(card.monthlyPrice)}
              <span className="text-[13px] font-extrabold">/mo</span>
            </>
          ) : (
            'Free'
          )}
        </p>
      </div>
      {note ? <p className="-mt-1 text-[13px] text-ink-muted">{note}</p> : null}
    </Link>
  );
}

/** An answer on the results screen, linking back to the question that set it. */
export function AnswerChip({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-[6px] rounded-ds-full bw-hair border-ink bg-surface-card px-3 py-[7px] text-[13px] font-extrabold text-ink hover:bg-surface-sunken',
        FOCUS
      )}
    >
      {label}
      <span aria-hidden className="text-ink-muted">✎</span>
    </Link>
  );
}

/** Soft info strip (PO05's "You'll see attendance…" box). */
export function FinderNote({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-ds-2 rounded-[8px] bg-surface-sunken px-[14px] py-[12px] text-[14px] leading-[1.4] text-ink">
      {icon ? <span className="mt-[1px] shrink-0">{icon}</span> : null}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export { NAVY as FINDER_NAVY };
