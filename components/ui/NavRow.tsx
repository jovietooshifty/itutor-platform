'use client';

/**
 * NavRow — a card that is a link onward: optional leading tile, a bold title,
 * optional meta beneath it, and a chevron on the right.
 *
 * NOT IN THE DESIGN SYSTEM's ten components. Added here because the Billing
 * frames (`160:4095`, `160:4257`) are built from it four times over: twice with
 * a SubjectTile and a status Tag in the meta line, twice as a plain row
 * ("Payment history and receipts", "Billing help").
 *
 * It is deliberately not a variant of `ClassRow`. ClassRow's right-hand slot is
 * a price, and its meta is a single string of tutor · days · time; these rows
 * put a Tag inline in the meta and a chevron where the price would go. Bending
 * ClassRow to cover both would have made its props mean two different things.
 *
 * Renders as a link when `href` is set, a button when `onClick` is, and a plain
 * div otherwise — so a row that goes nowhere is not announced as interactive.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { DsIcon } from './icons';

export interface NavRowProps {
  /** Usually a SubjectTile. Omitted for plain rows. */
  tile?: ReactNode;
  title: ReactNode;
  /** Sits under the title. May contain a Tag. */
  meta?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Hide the chevron on a row that is not a link. */
  chevron?: boolean;
  className?: string;
}

export function NavRow({
  tile,
  title,
  meta,
  href,
  onClick,
  chevron = true,
  className,
}: NavRowProps) {
  const shell = cn(
    'flex w-full items-center gap-ds-3 rounded-ds-card bw-hair border-border',
    'bg-surface-card p-ds-card text-left font-body text-ink',
    (href || onClick) && 'ds-press cursor-pointer',
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink focus-visible:outline-offset-2',
    className
  );

  const inner = (
    <>
      {tile}
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="font-extrabold text-[15px] leading-[18px]">{title}</span>
        {meta ? (
          <span className="flex flex-wrap items-center gap-ds-2 text-[13px] leading-[18px] text-ink-muted">
            {meta}
          </span>
        ) : null}
      </span>
      {chevron ? (
        <DsIcon name="chevron" size={20} className="flex-none text-ink" />
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {inner}
      </button>
    );
  }
  return <div className={shell}>{inner}</div>;
}

export default NavRow;
