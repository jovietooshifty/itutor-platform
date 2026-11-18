'use client';

/**
 * /payments/subscription-success on the new UI — after a monthly class
 * subscription or a secured spot. PRESENTATION ONLY: the page still polls the
 * status route and owns every state; this draws them.
 *
 * Secure spot vs subscription: the status route answers `enrollmentStatus`,
 * and a secured spot settles as SECURED (lib/services/secureSpotService). The
 * old page told a secured student "This is a recurring monthly payment",
 * which is the one thing a secure spot is not.
 *
 * Student: StudentV2Shell. Parent: ParentV2Shell, with "my class" and Billing
 * pointing at /parent/* (the old page sent parents to /student/*, which
 * bounced them).
 *
 * PROVISIONAL: modelled on the parent "enrolled" confirmation (Figma 160:6530)
 * without reading it in this pass; no student frame exists.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Hourglass, Warning } from '@phosphor-icons/react';
import { Button, SubjectTile, SummaryRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import StudentV2Shell from '@/components/student/v2/StudentV2Shell';
import ParentV2Shell from '@/components/parent/v2/ParentV2Shell';
import { parentInitials } from '@/components/parent/v2/initials';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';
import { scheduleLine } from '@/components/parent/v2/ParentClassDetailV2';
import { secureSpotDates } from '@/components/classes/SecureSpotTermsV2';
import { preorderFor, type GroupData } from '@/components/classes/ClassDetailView';
import { useProfile } from '@/lib/hooks/useProfile';

export interface SubscriptionSuccessV2Props {
  role: 'student' | 'parent';
  state: 'waiting' | 'done' | 'timeout' | 'error';
  slow: boolean;
  error: string;
  confirmed: { paymentId: string; groupId: string | null; enrollmentStatus: string | null } | null;
  group: GroupData | null;
}

function Frame({ role, children }: { role: 'student' | 'parent'; children: ReactNode }) {
  const { profile } = useProfile();
  const body = <div className="mx-auto flex w-full max-w-[720px] flex-col gap-ds-4">{children}</div>;
  return role === 'parent' ? (
    <ParentV2Shell initials={parentInitials(profile)} width="wide">
      {body}
    </ParentV2Shell>
  ) : (
    <StudentV2Shell width="wide">{body}</StudentV2Shell>
  );
}

function Hero({ tone, icon, title, body }: { tone: 'brand' | 'yellow' | 'danger'; icon: ReactNode; title: string; body: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-ds-3">
      <span
        aria-hidden
        className={cn(
          'flex size-[52px] items-center justify-center rounded-ds-card',
          tone === 'brand' ? 'bg-brand text-ink' : tone === 'yellow' ? 'bg-accent-yellow text-ink' : 'bg-danger text-on-ink'
        )}
      >
        {icon}
      </span>
      <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">{title}</h1>
      <p className="m-0 max-w-[60ch] text-[15px] leading-[22px] text-ink-muted">{body}</p>
    </div>
  );
}

export function SubscriptionSuccessV2({ role, state, slow, error, confirmed, group }: SubscriptionSuccessV2Props) {
  const router = useRouter();
  const parent = role === 'parent';
  const classesHref = parent ? '/parent/classes' : '/student/classes';
  const classHref = confirmed?.groupId
    ? parent
      ? `/parent/classes/${confirmed.groupId}`
      : `/student/classes/${confirmed.groupId}`
    : classesHref;
  const billingHref = parent ? '/parent/billing' : '/student/subscriptions';

  if (state === 'waiting') {
    return (
      <Frame role={role}>
        <div className="flex flex-col items-start gap-ds-3" aria-busy>
          <span className="size-[52px] animate-pulse rounded-ds-card bg-surface-sunken" aria-hidden />
          <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Confirming your payment…</h1>
          <p className="m-0 text-[15px] text-ink-muted">Please don&apos;t close this page.</p>
          {slow ? (
            <p className="m-0 text-[14px] text-ink-muted">
              This is taking longer than usual. Your payment is safe — we&apos;re just waiting on confirmation.
            </p>
          ) : null}
        </div>
      </Frame>
    );
  }

  if (state === 'error' || state === 'timeout') {
    // A timeout is NOT a failure — the webhook may still land. Never imply
    // they need to pay again.
    const isTimeout = state === 'timeout';
    return (
      <Frame role={role}>
        <Hero
          tone={isTimeout ? 'yellow' : 'danger'}
          icon={isTimeout ? <Hourglass size={26} weight="bold" /> : <Warning size={26} weight="bold" />}
          title={isTimeout ? 'Still confirming' : 'Payment not completed'}
          body={
            isTimeout
              ? `Your payment went through but is still being confirmed. You do not need to pay again — check ${parent ? 'Classes' : 'My Classes'} in a few moments.`
              : error
          }
        />
        <div>
          <Button size="lg" onClick={() => router.push(classesHref)}>
            {parent ? 'Go to Classes' : 'Go to My Classes'}
          </Button>
        </div>
      </Frame>
    );
  }

  const secured = confirmed?.enrollmentStatus === 'SECURED';
  const preorder = secured && group ? preorderFor(group) : null;
  const dates = preorder ? secureSpotDates(preorder) : null;
  const receiptHref = confirmed ? `/api/payments/stripe/subscription/${confirmed.paymentId}/receipt?print=1` : '#';
  const subject = group?.subject || group?.name || '';

  return (
    <Frame role={role}>
      <Hero
        tone="brand"
        icon={<Check size={26} weight="bold" />}
        title={secured ? 'Your spot is secured' : "You're enrolled"}
        body={
          secured
            ? 'Your payment went through and the place is held. A receipt has been emailed.'
            : 'Your payment went through and the place in the class is confirmed. A receipt has been emailed.'
        }
      />

      {group ? (
        <div className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
          <SubjectTile code={subjectCode(subject)} color={subjectColor(subject)} size={52} />
          <div className="flex min-w-0 flex-col gap-[2px]">
            <p className="m-0 text-[15px] font-extrabold leading-[18px] text-ink">{group.name}</p>
            <p className="m-0 text-[13px] text-ink-muted">
              {[group.tutor?.display_name || group.tutor?.full_name, scheduleLine(group)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-[9px]">
        {secured ? (
          <>
            <SummaryRow label="Billing" value="One-time · nothing renews" />
            {dates ? <SummaryRow label="Classes start" value={dates.start} /> : null}
            {dates && preorder ? (
              <SummaryRow label={preorder.shortClass ? 'Class ends' : 'First month runs until'} value={dates.until} />
            ) : null}
            <SummaryRow
              label="Next payment"
              value={preorder?.shortClass ? 'None · this covers the whole class' : 'None until you choose to continue'}
            />
            <SummaryRow label="If the tutor cancels first" value="Refunded automatically" />
          </>
        ) : (
          <>
            <SummaryRow label="Billing" value="Monthly" />
            <SummaryRow label="Cancel" value="Any time, from Billing" />
          </>
        )}
      </div>

      <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
        {secured
          ? preorder?.shortClass
            ? 'iTutor holds the payment until the class has been taught. There is nothing further to pay.'
            : 'iTutor holds the payment until the first month has been taught. Before it ends you choose whether to continue monthly — nothing is charged automatically.'
          : 'This is a recurring monthly payment. Cancel any time and keep the month you have already paid for.'}
      </p>

      <div className="flex flex-col gap-ds-2 md:flex-row">
        <Button size="lg" block onClick={() => router.push(classHref)}>
          Go to {parent ? 'the class' : 'my class'}
        </Button>
        <a
          href={receiptHref}
          target="_blank"
          rel="noopener noreferrer"
          className="ds-press inline-flex h-12 items-center justify-center rounded-ds-btn bw-bold border-ink bg-surface-card px-ds-4 text-[15px] font-extrabold text-ink"
        >
          Download receipt
        </a>
      </div>

      {!secured ? (
        <p className="m-0 text-[13px] text-ink-muted">
          Manage or cancel from{' '}
          <Link href={billingHref} className="underline underline-offset-2">
            Billing
          </Link>
          .
        </p>
      ) : null}
    </Frame>
  );
}

export default SubscriptionSuccessV2;
