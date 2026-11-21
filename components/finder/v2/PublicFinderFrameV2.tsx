'use client';

/**
 * The frame around the Finder's logged-out result screens in the new UI
 * (/find/results, /find/browse): the wordmark, then Log in and Sign up, both
 * returning to the page the visitor is on via /find/claim (lib/finder/links)
 * so the answers they just saw are adopted onto the new account.
 *
 * The old UI borrows StudentShell's anonymous mode here; that shell is the old
 * design, so the new UI gets this lighter frame instead, wide enough for a
 * three-up card grid.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { loginThen, signupThen, type FinderRole } from '@/lib/finder/links';
import { FinderFrame } from './FinderKit';

const FOCUS =
  'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink';

export default function PublicFinderFrameV2({
  children,
  role,
  returnTo,
}: {
  children: ReactNode;
  role: FinderRole;
  returnTo: string;
}) {
  return (
    <FinderFrame wide>
      <header className="flex h-[64px] shrink-0 items-center justify-between gap-ds-3 px-5">
        <Link href="/" aria-label="iTutor home" className={`rounded-[4px] ${FOCUS}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/auth/wordmark.png" alt="iTutor" width={120} height={29} className="block h-[29px] w-[120px]" />
        </Link>
        <nav className="flex items-center gap-ds-2">
          <Link
            href={loginThen(returnTo)}
            className={`inline-flex min-h-[44px] items-center px-2 text-[15px] font-extrabold text-ink underline underline-offset-2 ${FOCUS}`}
          >
            Log in
          </Link>
          <Link
            href={signupThen(role, returnTo)}
            className={`inline-flex h-10 items-center rounded-[8px] bw-bold border-ink px-ds-3 text-[15px] font-extrabold shadow-[0_3px_0_rgb(var(--ds-ink))] active:translate-y-[2px] active:shadow-[0_1px_0_rgb(var(--ds-ink))] ${
              role === 'parent' ? 'bg-[#0f2e47] text-on-ink' : 'bg-brand text-ink'
            } ${FOCUS}`}
          >
            Sign up
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col px-5 pb-10 pt-ds-2">{children}</main>
    </FinderFrame>
  );
}
