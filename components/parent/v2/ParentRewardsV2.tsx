'use client';

/**
 * Rewards (iTutor credits), new UI. Reached from Settings › Rewards.
 *
 * PROVISIONAL VISUALS: no Figma frame. The balance is the screen's one
 * feature (ink) card, which is the system's rule for "the thing this screen is
 * about"; the old green gradient card is gone. The referral steps use
 * StepList and the progress uses QuestProgress.
 *
 * Same data (useCredits('full')) and the same rules as the shared
 * RewardsPage, which the student app still uses: the invite card hides while
 * referrals are off or the account is suspended; codes only show when
 * campaign codes are on; friends are first name and initial only.
 *
 * ShareCard and RedeemCodeBox are reused as they are. They carry the copy,
 * share-sheet, QR and redeem logic, and still use the older styling inside
 * the new card; restyling them would change the student app too.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, QuestProgress, StepList, SummaryRow, Tag } from '@/components/ui';
import { fmtCredits, useCredits } from '@/lib/credits/useCredits';
import { formatTtd } from '@/components/credits/AnimatedNumber';
import ShareCard from '@/components/credits/ShareCard';
import RedeemCodeBox from '@/components/credits/RedeemCodeBox';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';

const FRIEND: Record<string, { label: string; tone: 'brand' | 'outline' | 'dark' }> = {
  signed_up: { label: 'Signed up', tone: 'outline' },
  paid: { label: 'Paid for a class', tone: 'brand' },
  rewarded: { label: 'Rewarded', tone: 'dark' },
  not_eligible: { label: 'Not eligible', tone: 'outline' },
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-ds-2 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="flex items-baseline justify-between gap-ds-3">
        <h2 className="font-display text-[18px] font-extrabold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default function ParentRewardsV2() {
  const router = useRouter();
  const { data, loading } = useCredits('full');
  const [allHistory, setAllHistory] = useState(false);

  if (loading && !data) {
    return (
      <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Rewards">
        <DetailSkeleton rows={3} />
      </DetailScreen>
    );
  }

  if (!data?.available) {
    return (
      <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Rewards">
        <EmptyCard title="Rewards are not available yet" body="Check back soon." />
      </DetailScreen>
    );
  }

  const programme = data.programme!;
  const wallet = data.wallet ?? { available: 0, pending: 0, reserved: 0 };
  const history = data.history ?? [];
  const friends = data.friends ?? [];
  const inviting = programme.referrals_enabled && Boolean(data.referral) && !data.suspended;
  const reward = formatTtd(programme.credit_value_ttd, { compact: true });
  const required = Math.max(1, programme.referrals_required);
  const done = Math.min(data.progress?.toward_next ?? 0, required);
  const left = required - done;
  const shownHistory = allHistory ? history : history.slice(0, 6);

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Rewards">
      {data.suspended ? (
        <Card tone="alert" title="Credits are paused" body="This account is suspended, so credits cannot be earned or spent right now." />
      ) : null}

      <Card tone="feature" eyebrow="Your credits">
        <p className="font-display text-[44px] font-extrabold leading-[48px] text-on-ink">
          {fmtCredits(wallet.available)}
        </p>
        {wallet.pending > 0 || wallet.reserved > 0 ? (
          <div className="flex flex-col pt-ds-2">
            {wallet.pending > 0 ? <SummaryRow tone="ink" label="On the way" value={fmtCredits(wallet.pending)} /> : null}
            {wallet.reserved > 0 ? <SummaryRow tone="ink" label="Held for a payment" value={fmtCredits(wallet.reserved)} /> : null}
          </div>
        ) : null}
        {wallet.pending > 0 && programme.hold_days > 0 ? (
          <p className="pt-ds-1 font-body text-[13px] text-on-ink-muted">
            New rewards become spendable {plural(programme.hold_days, 'day')} after your friend pays.
          </p>
        ) : null}
        {!data.suspended && wallet.available > 0 ? (
          <div className="pt-ds-3">
            <Button block onClick={() => router.push('/parent/classes')}>
              Use them on a class
            </Button>
          </div>
        ) : null}
      </Card>

      {inviting ? (
        <Section title={`Invite friends, earn ${reward}`}>
          <StepList
            steps={[
              { title: 'Share your link', detail: 'On WhatsApp, Instagram, or show your QR code.' },
              {
                title: 'A friend joins a class',
                detail: `They sign up with your link and pay at least ${formatTtd(programme.min_qualifying_cash_ttd, { compact: true })} by card.`,
              },
              {
                title: `You get ${reward}`,
                detail: required === 1 ? 'For every friend who joins.' : `For every ${required} friends who join.`,
              },
            ]}
          />
          {data.progress ? (
            <div className="flex flex-col gap-ds-2 bw-t-hair border-line-soft pt-ds-3">
              <div className="flex items-baseline justify-between gap-ds-3">
                <span className="font-display text-[15px] font-extrabold text-ink">
                  {required === 1
                    ? `Your next friend earns you ${reward}`
                    : left === 0
                      ? 'Your next reward is on its way'
                      : `${plural(left, 'more friend')} to your next ${reward}`}
                </span>
                {required > 1 ? <span className="font-body text-[13px] text-ink-muted">{done} of {required}</span> : null}
              </div>
              {required > 1 ? (
                <QuestProgress total={required} done={done} label={`${done} of ${required} friends toward your next reward`} />
              ) : null}
            </div>
          ) : null}
          <div className="pt-ds-2">
            <ShareCard link={data.referral!.link} />
          </div>
        </Section>
      ) : null}

      {programme.campaign_codes_enabled && !data.suspended ? (
        <Section title="Have a code?">
          <RedeemCodeBox />
        </Section>
      ) : null}

      {friends.length > 0 ? (
        <Section title="Your friends" aside={<span className="font-body text-[13px] text-ink-muted">{friends.length}</span>}>
          <ul className="flex flex-col">
            {friends.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-ds-3 bw-b-hair border-line-soft py-ds-2 last:border-b-0">
                <span className="min-w-0">
                  <span className="block truncate font-display text-[15px] font-extrabold text-ink">{f.name}</span>
                  <span className="block font-body text-[13px] text-ink-muted">Joined {fmtDate(f.at)}</span>
                </span>
                <Tag tone={FRIEND[f.status]?.tone ?? 'outline'}>{FRIEND[f.status]?.label ?? f.status}</Tag>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="History">
        {history.length === 0 ? (
          <p className="font-body text-[14px] text-ink-muted">
            No credits yet.{inviting ? ' Share your link and you earn credits when friends join a class.' : ''}
          </p>
        ) : (
          <>
            <ul className="flex flex-col">
              {shownHistory.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-ds-3 bw-b-hair border-line-soft py-ds-2">
                  <span className="min-w-0">
                    <span className="block font-display text-[15px] font-extrabold text-ink">{h.label}</span>
                    <span className="block font-body text-[13px] text-ink-muted">
                      {fmtDate(h.at)}
                      {h.detail ? ` · ${h.detail}` : ''}
                      {h.status !== 'done' ? ' · pending' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-[15px] font-extrabold text-ink">
                    {h.amount > 0 ? '+' : h.amount < 0 ? '−' : ''}
                    {fmtCredits(Math.abs(h.amount))}
                  </span>
                </li>
              ))}
            </ul>
            {history.length > 6 ? (
              <button
                type="button"
                onClick={() => setAllHistory((v) => !v)}
                className="self-start border-0 bg-transparent p-0 font-display text-[14px] font-extrabold text-ink underline underline-offset-4 cursor-pointer"
              >
                {allHistory ? 'Show less' : `Show all ${history.length}`}
              </button>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Good to know">
        <ul className="flex flex-col gap-ds-2 font-body text-[14px] text-ink-muted">
          <li>
            Credits pay for a whole payment: one month of a class, or your next monthly payment on a subscription.
            They cannot pay part of a payment, and they cannot start a new subscription.
          </li>
          <li>Your tutor is still paid in full when you pay with credits.</li>
          <li>
            Credits have no cash value, cannot be transferred, and can be taken back if a payment is refunded or for
            misuse.
          </li>
        </ul>
      </Section>
    </DetailScreen>
  );
}
