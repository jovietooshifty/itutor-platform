'use client';

/**
 * "What brings you to iTutor?" in the new UI — the Finder's fork, drawn as the
 * auth set's role cards (RO01) so /start and /signup read as one product.
 *
 * Same contract as components/finder/RolePicker.tsx: the student and parent
 * cards go to /find?role=… carrying whatever params the visitor arrived with
 * (minus ?step=), the parent card only shows while parent accounts are on, and
 * the tutor card skips the questionnaire for /signup?role=tutor (NOT
 * /signup/tutor, which drops the query string).
 */

import Link from 'next/link';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ROLE_TAG, type AuthRole } from '@/components/auth/v2/AuthKit';

const CARDS: { role: AuthRole; tag: string; title: string; detail: string }[] = [
  {
    role: 'student',
    tag: 'STUDENT',
    title: 'Find a class for me',
    detail: "I'm the student",
  },
  {
    role: 'parent',
    tag: 'PARENT',
    title: 'Find a class for my child',
    detail: "I'm a parent or guardian",
  },
  {
    role: 'tutor',
    tag: 'TEACHER',
    title: 'Teach on iTutor',
    detail: 'I want students',
  },
];

export default function FinderRolePickerV2({
  searchParams,
  parentAccountsEnabled = true,
  showTutor = true,
}: {
  searchParams?: ReadonlyURLSearchParams;
  parentAccountsEnabled?: boolean;
  /** Inline on /find a tutor has taken a wrong turn: a text link, not a card. */
  showTutor?: boolean;
}) {
  const findHref = (role: 'student' | 'parent') => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('role', role);
    params.delete('step');
    return `/find?${params.toString()}`;
  };

  const cards = CARDS.filter(
    (c) => (c.role !== 'parent' || parentAccountsEnabled) && (c.role !== 'tutor' || showTutor)
  );

  return (
    <div className="flex flex-col gap-[14px]">
      {cards.map((c) => (
        <Link
          key={c.role}
          href={c.role === 'tutor' ? '/signup?role=tutor' : findHref(c.role)}
          className={cn(
            'group flex min-h-[104px] overflow-hidden rounded-[10px] bw-bold border-ink bg-surface-card text-left',
            'shadow-[0_4px_0_rgb(var(--ds-ink))] transition-[transform,box-shadow] duration-[90ms] ease-[cubic-bezier(.23,1,.32,1)]',
            'active:translate-y-[2px] active:shadow-[0_2px_0_rgb(var(--ds-ink))]',
            'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink'
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-[5px] py-[12px] pl-[16px] pr-2">
            <span
              className={cn(
                'self-start rounded-[4px] bw-hair border-ink px-2 py-[3px] text-[12px] font-extrabold tracking-[0.72px]',
                ROLE_TAG[c.role]
              )}
            >
              {c.tag}
            </span>
            <span className="font-display text-[19px] font-extrabold leading-[22px] tracking-[-0.2px] text-ink">
              {c.title}
            </span>
            <span className="text-[14px] leading-[18px] text-ink-muted">{c.detail}</span>
          </span>
          <span className="flex items-center pr-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/auth/chevron.svg" alt="" width={18} height={18} className="block h-[18px] w-[18px]" />
          </span>
        </Link>
      ))}
      {!showTutor ? (
        <p className="text-[14px] text-ink-muted">
          Here to teach?{' '}
          <Link href="/signup?role=tutor" className="font-extrabold text-ink underline underline-offset-2">
            Sign up as a tutor
          </Link>
        </p>
      ) : null}
    </div>
  );
}
