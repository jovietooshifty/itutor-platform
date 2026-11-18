'use client';

/**
 * Who's joining iTutor? — Figma RO01 (64:6858).
 *
 * Every "Get started" without a role lands here. The card decides the
 * account type and each role keeps its colour from here on (student green,
 * parent navy, teacher gold). Rule: one account type per sign-up.
 *
 * The frames send a student and a parent into question screens (OB05, PO01)
 * before the account form. Those questions already exist as the Finder
 * (/find), which runs AFTER sign-up here, so the cards go straight to the
 * account form; the Finder picks the visitor up once the account exists.
 *
 * The parent card is only offered while parent accounts are switched on.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AuthFrame, AuthMain, AuthTitle, AuthTopBar, ROLE_PANEL, ROLE_TAG, ULink, type AuthRole } from './AuthKit';

const CARDS: { role: AuthRole; tag: string; title: string; detail: string; photo: string; crop: string }[] = [
  {
    role: 'student',
    tag: 'STUDENT',
    title: "I'm a student",
    detail: 'Classes and 1:1 lessons with Caribbean teachers',
    photo: '/brand/auth/role-student.jpg',
    crop: 'object-[38%_50%]',
  },
  {
    role: 'parent',
    tag: 'PARENT',
    title: "I'm a parent",
    detail: "Find and pay for your child's lessons",
    photo: '/brand/auth/role-parent.jpg',
    crop: 'object-[45%_50%]',
  },
  {
    role: 'tutor',
    tag: 'TEACHER',
    title: "I'm a teacher",
    detail: 'Teach classes and 1:1, get paid in TTD',
    photo: '/brand/auth/role-teacher.jpg',
    crop: 'object-[45%_50%]',
  },
];

export default function RolePickerV2({
  parentAccounts,
  redirect,
}: {
  parentAccounts: boolean;
  redirect: string | null;
}) {
  const carry = redirect ? `&redirect=${encodeURIComponent(redirect)}` : '';
  return (
    <AuthFrame tone="brand">
      <AuthTopBar backHref="/" />
      <AuthMain>
        <AuthTitle size={34}>
          Who&apos;s joining
          <br />
          iTutor?
        </AuthTitle>

        {CARDS.filter((c) => c.role !== 'parent' || parentAccounts).map((c) => (
          <Link
            key={c.role}
            href={`/signup?role=${c.role}${carry}`}
            className={cn(
              'group flex min-h-[112px] overflow-hidden rounded-[10px] bw-bold border-ink bg-surface-card text-left',
              'shadow-[0_4px_0_rgb(var(--ds-ink))] transition-[transform,box-shadow] duration-[90ms] ease-[cubic-bezier(.23,1,.32,1)]',
              'active:translate-y-[2px] active:shadow-[0_2px_0_rgb(var(--ds-ink))]',
              'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink'
            )}
          >
            <span className={cn('relative w-[106px] shrink-0 border-r-2 border-solid border-ink', ROLE_PANEL[c.role])}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.photo} alt="" className={cn('absolute inset-0 h-full w-full object-cover', c.crop)} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col justify-center gap-[5px] py-[14px] pl-[14px] pr-2">
              <span
                className={cn(
                  'self-start rounded-[4px] bw-hair border-ink px-2 py-[3px] text-[12px] font-extrabold tracking-[0.72px]',
                  ROLE_TAG[c.role]
                )}
              >
                {c.tag}
              </span>
              <span className="font-display text-[20px] font-extrabold leading-[22px] tracking-[-0.2px] text-ink">
                {c.title}
              </span>
              <span className="text-[14px] leading-[18.9px] text-ink-muted">{c.detail}</span>
            </span>
            <span className="flex items-center pr-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/auth/chevron.svg" alt="" width={18} height={18} className="block h-[18px] w-[18px]" />
            </span>
          </Link>
        ))}

        <div className="flex-1" />
        <p className="text-center text-[14px] font-extrabold text-ink">
          You can&apos;t change account type later, so pick the one that fits.
        </p>
        <div className="flex justify-center">
          <ULink href={redirect ? `/login?redirect=${encodeURIComponent(redirect)}` : '/login'}>
            I already have an account
          </ULink>
        </div>
      </AuthMain>
    </AuthFrame>
  );
}
