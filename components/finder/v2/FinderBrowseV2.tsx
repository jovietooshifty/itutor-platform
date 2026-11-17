/**
 * /find/browse in the new UI: every open class, for a visitor who skipped the
 * questions. Same rules as the old page: never "no matches" when nothing was
 * asked, the shortlist offer sits ABOVE the list, and each unset chip opens
 * the one question it names.
 */

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { SupplyRow } from '@/lib/finder/supply';
import { classHref } from '@/lib/finder/links';
import { STEP } from '@/lib/finder/wizard';
import { FinderButton, FinderMatchCard, FinderNote } from './FinderKit';
import { toFinderCard } from './MatchResultsV2';

const FOCUS =
  'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export default function FinderBrowseV2({
  role,
  query,
  shown,
}: {
  role: 'student' | 'parent';
  query: string;
  shown: SupplyRow[];
}) {
  const tone = role === 'parent' ? 'parent' : 'student';
  const count = shown.length === 1 ? '1 class' : `${shown.length} classes`;
  return (
    <div className="flex w-full flex-col gap-ds-5">
      <header className="flex flex-col gap-ds-2">
        <h1 className="font-display text-[30px] font-extrabold leading-[1.08] tracking-[-0.3px] text-ink md:text-[34px]">
          {query ? `Classes matching “${query}”` : 'Every class on iTutor right now'}
        </h1>
        <p className="text-[15px] leading-[1.4] text-ink-muted">
          {query ? (
            <>
              {count} matched.{' '}
              <Link href={`/find/browse?role=${role}`} className="font-extrabold text-ink underline underline-offset-2">
                Clear the search
              </Link>
            </>
          ) : (
            <>
              You skipped the questions, so nothing is filtered out. {shown.length === 1 ? '1 class is' : `${count} are`}{' '}
              open.
            </>
          )}
        </p>
      </header>

      <form action="/find/browse" method="get" role="search" className="flex gap-ds-2 md:max-w-[560px]">
        <input type="hidden" name="role" value={role} />
        <label htmlFor="browse-q" className="sr-only">
          Search classes
        </label>
        <input
          id="browse-q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Subject, class or teacher"
          className="min-w-0 flex-1 rounded-[10px] bw-bold border-ink bg-surface-card px-[14px] py-[11px] font-body text-[16px] text-ink placeholder:text-ink-muted focus:[outline-style:solid] focus:outline-2 focus:outline-offset-2 focus:outline-ink"
        />
        <button
          type="submit"
          className={`shrink-0 rounded-[10px] bw-bold border-ink bg-ink px-ds-4 font-body text-[15px] font-extrabold text-on-ink ${FOCUS}`}
        >
          Search
        </button>
      </form>

      <section className="flex flex-col gap-ds-3 rounded-[10px] bw-bold border-ink bg-[#e6f7ec] p-[18px] md:max-w-[560px]">
        <div className="flex items-start gap-ds-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[8px] bw-hair border-ink bg-brand text-ink">
            <Sparkles className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[19px] font-extrabold leading-tight text-ink">Want a shortlist instead?</h2>
            <p className="mt-ds-1 text-[14px] leading-[1.45] text-ink-muted">
              A few quick questions and we&rsquo;ll narrow this to the classes that fit your level, your timetable and
              your budget.
            </p>
          </div>
        </div>
        <FinderButton tone={tone} href={`/find?role=${role}`}>
          Answer the questions
        </FinderButton>
        <div className="flex flex-wrap gap-ds-2">
          {[
            { label: 'Any level', step: STEP.LEVEL },
            { label: 'Any time', step: STEP.AVAILABILITY },
            { label: 'Online or in person', step: STEP.DELIVERY },
            { label: 'Any budget', step: STEP.BUDGET },
          ].map((chip) => (
            <Link
              key={chip.label}
              href={`/find?role=${role}&step=${chip.step}`}
              className={`inline-flex items-center rounded-ds-full bw-hair border-ink bg-surface-card px-3 py-[6px] text-[13px] font-extrabold text-ink hover:bg-surface-sunken ${FOCUS}`}
            >
              {chip.label}
            </Link>
          ))}
        </div>
      </section>

      {shown.length === 0 ? (
        <FinderNote>
          {query
            ? 'Nothing matched that search. Try a subject, a class name or a teacher’s name, or clear it to see everything.'
            : 'No classes are open at the moment. Answer the questions above and we’ll tell you the moment one opens that fits.'}
        </FinderNote>
      ) : (
        <section
          aria-label="All classes"
          className="grid gap-x-ds-4 gap-y-ds-5 pt-ds-2 [grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr))]"
        >
          {shown.map((row) => (
            <FinderMatchCard
              key={row.groupId}
              tone={tone}
              card={toFinderCard(row)}
              href={classHref(row.groupId, role, true)}
            />
          ))}
        </section>
      )}
    </div>
  );
}
