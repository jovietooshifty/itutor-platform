/**
 * "My best matches" in the new UI (Figma PO05).
 *
 * PRESENTATION ONLY: MatchResults still loads the live supply, joins it to the
 * stored snapshot and works out the heading, then hands the result here when
 * the new UI is on. Every rule in its comments still holds: the snapshot says
 * WHICH classes and in what order, the card is read live, an unlisted class
 * drops out, anonymous notify-me asks for an account instead of recording a
 * promise nobody can keep, and the answer chips link back to their question.
 *
 * Renders content only. The page around it supplies the frame: the public
 * Finder frame for /find/results, the student or parent V2 shell for
 * /student/matches and /parent/matches.
 */

import Link from 'next/link';
import { Eye, Info } from 'lucide-react';
import type { SupplyRow } from '@/lib/finder/supply';
import { supplyRowToCard } from '@/lib/finder/cardData';
import { classHref, signupThen } from '@/lib/finder/links';
import {
  AnswerChip,
  FinderButton,
  FinderLink,
  FinderMatchCard,
  FinderNote,
  type FinderMatchCardData,
  type FinderTone,
} from './FinderKit';

export function toFinderCard(row: SupplyRow): FinderMatchCardData {
  const c = supplyRowToCard(row);
  return {
    id: row.groupId,
    title: row.name,
    tutor: row.tutorName ?? 'an iTutor',
    tutorAvatar: row.tutorAvatarUrl,
    subject: row.subject ?? '',
    level: c.level,
    schedule: c.day,
    format: c.classFormat ?? 'online',
    venueArea: row.regionName,
    monthlyPrice: row.monthlyPrice ?? 0,
    verified: row.tutorVerified,
    seatsLeft: row.seatsRemaining,
  };
}

export interface MatchResultsV2Props {
  role: 'student' | 'parent';
  isAnonymous: boolean;
  learner: string | null;
  matchClass: 'exact' | 'near' | 'fallback' | 'none' | null;
  heading: string | null;
  chips: { label: string; href: string }[];
  cards: { groupId: string; row: SupplyRow }[];
  /** "You asked for …" under each card on an availability near miss. */
  missNote: string | null;
  nearMiss: { href: string; label: string } | null;
  lessonType: string | null;
  notify?: string;
  requestId: string;
}

export default function MatchResultsV2(p: MatchResultsV2Props) {
  const tone: FinderTone = p.role === 'parent' ? 'parent' : 'student';
  const browseHref = p.isAnonymous ? `/find/browse?role=${p.role}` : '/student/find-tutors';

  return (
    <div className="flex w-full flex-col gap-ds-5">
      <header className="flex flex-col gap-ds-2">
        <h1 className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.3px] text-ink md:text-[34px]">
          {p.learner ? `${p.learner}'s best matches` : p.isAnonymous ? 'Your best matches' : 'My best matches'}
        </h1>
        <p className="text-[15px] leading-[1.4] text-ink-muted">
          {p.matchClass === 'none' ? 'We have recorded what you are looking for.' : p.heading}
        </p>
      </header>

      <section aria-label="Your search" className="flex flex-col gap-ds-2">
        <div className="flex flex-wrap gap-ds-2">
          {p.chips.map((c) => (
            <AnswerChip key={c.label} label={c.label} href={c.href} />
          ))}
        </div>
        <p className="text-[13px] text-ink-muted">
          Tap anything above to change it, or{' '}
          <Link href={p.isAnonymous ? '/start' : '/find'} className="font-extrabold text-ink underline underline-offset-2">
            start a new search
          </Link>
          .
        </p>
      </section>

      {p.matchClass === 'none' ? (
        <section className="flex flex-col gap-ds-3 rounded-[10px] bw-bold border-ink bg-surface-card p-[18px] shadow-[0_4px_0_rgb(var(--ds-ink))] md:max-w-[560px]">
          <h2 className="font-display text-[20px] font-extrabold leading-tight text-ink">
            {p.lessonType === 'one_on_one' ? 'One-to-one matching is not open yet.' : 'No class in this subject yet.'}
          </h2>
          <p className="text-[15px] leading-[1.45] text-ink-muted">
            {p.lessonType === 'one_on_one'
              ? 'We have recorded what you are looking for. The Finder matches group classes for now. Browse those, or we will tell you when one-to-one opens.'
              : 'The moment a teacher opens a class that fits, we can tell you.'}
          </p>
          {p.notify === 'ok' ? (
            <FinderNote>We will email you as soon as a class opens that fits.</FinderNote>
          ) : p.isAnonymous ? (
            <FinderButton tone={tone} href={`${signupThen(p.role, '/find/results')}&intent=notify`}>
              Create a free account and we&rsquo;ll email you
            </FinderButton>
          ) : (
            <form action="/api/finder/notify-me" method="post">
              <input type="hidden" name="request_id" value={p.requestId} />
              <FinderButton tone={tone} type="submit">
                Tell me when a class opens
              </FinderButton>
            </form>
          )}
          {p.notify === 'failed' ? (
            <p role="alert" className="text-[14px] font-extrabold text-danger">
              That did not save. Please try again.
            </p>
          ) : null}
          <FinderLink href={browseHref} className="self-start">
            Browse everything available now
          </FinderLink>
        </section>
      ) : (
        <>
          {p.matchClass === 'fallback' ? (
            <FinderNote icon={<Info className="size-[18px]" />}>
              These are in the subject you picked but may not match your times, level, budget or how you wanted to
              learn. Widening one of the answers above usually helps.
            </FinderNote>
          ) : null}

          <section
            aria-label="Recommended classes"
            className="grid gap-x-ds-4 gap-y-ds-5 pt-ds-2 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]"
          >
            {p.cards.map(({ groupId, row }, i) => (
              <FinderMatchCard
                key={groupId}
                tone={tone}
                card={toFinderCard(row)}
                href={classHref(groupId, p.role, p.isAnonymous)}
                bestFit={i === 0 && p.matchClass === 'exact' && p.cards.length > 1}
                note={p.missNote ? <>You asked for {p.missNote}</> : null}
              />
            ))}
          </section>

          {p.nearMiss ? (
            <div className="md:max-w-[360px]">
              <FinderButton tone="outline" href={p.nearMiss.href} arrow={false}>
                {p.nearMiss.label}
              </FinderButton>
            </div>
          ) : null}

          {p.isAnonymous ? (
            <div className="flex flex-col gap-ds-2 md:max-w-[420px]">
              <FinderNote icon={<Eye className="size-[18px]" />}>
                These are yours. A free account saves them and lets you join a class.
              </FinderNote>
              <FinderButton tone={tone} href={signupThen(p.role, '/find/results')}>
                {p.role === 'parent' ? 'Create a parent account' : 'Create a free account'}
              </FinderButton>
              <FinderLink href={browseHref} className="self-center">
                See every class on iTutor
              </FinderLink>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
