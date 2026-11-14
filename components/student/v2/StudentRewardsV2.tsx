'use client';

/**
 * Student Credits, new UI — Figma `2:1995` (states F1–F8), file
 * rwytRx6xmRHf4AMzpxAznd. Reached from the header credits pill.
 *
 * Same data and rules as ParentRewardsV2 and the shared RewardsPage:
 * useCredits('full'); the invite card hides while referrals are off or the
 * account is suspended; "Got a code?" only when campaign codes are on;
 * friends are first name and initial only.
 *
 * The frame draws the share buttons and the redeem box in the new system, so
 * they are drawn here rather than reusing ShareCard / RedeemCodeBox (which
 * keep the old styling for the old page). The behaviour is the same: copy,
 * WhatsApp link, the phone's share sheet for Instagram and "More", the
 * branded QR, and POST /api/credits/redeem on the button only.
 *
 * Wide screens (no frame, PROVISIONAL): balance and invite on the left,
 * code, history and the rules on the right.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChatCircle,
  Gift,
  InstagramLogo,
  Plus,
  QrCode,
  ShareNetwork,
  UserPlus,
} from '@phosphor-icons/react';
import { Card, SummaryRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { fmtCredits, invalidateCredits, useCredits } from '@/lib/credits/useCredits';
import { formatTtd } from '@/components/credits/AnimatedNumber';
import { downloadFile, renderBrandedQr } from '@/lib/qr/brandedQr';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';

const MESSAGE = 'Join me on iTutor — great classes with real tutors. Sign up with my link:';
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const whole = (n: number) => fmtCredits(n).replace(/\.00$/, '');

const FRIEND: Record<string, string> = {
  signed_up: 'Signed up',
  paid: 'Paid for a class',
  rewarded: 'Rewarded',
  not_eligible: 'Not eligible',
};

function Panel({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card', className)}>
      <div className="flex items-baseline justify-between gap-ds-3">
        <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const outlineBtn =
  'ds-press inline-flex h-12 items-center justify-center gap-ds-2 rounded-ds-sm bw-hair border-ink bg-surface-card px-ds-3 font-body text-[15px] font-extrabold text-ink no-underline cursor-pointer';

function Share({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!showQr || qr) return;
    void renderBrandedQr(link).then(setQr);
  }, [showQr, qr, link]);

  const copy = async (then?: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setHint(then ?? null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      setHint('Copy the link above by hand.');
    }
  };
  const nativeShare = async () => {
    try {
      await navigator.share({ title: 'iTutor', text: MESSAGE, url: link });
    } catch {
      /* dismissed */
    }
  };
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${link}`)}`;

  return (
    <div className="flex flex-col gap-ds-2">
      <div className="flex h-[54px] items-center gap-ds-2 rounded-ds-sm bw-hair border-border bg-surface-page pl-[15px] pr-[5px]">
        <span className="min-w-0 flex-1 truncate font-body text-[15px] font-extrabold text-ink" title={link}>
          {link.replace(/^https?:\/\//, '')}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copied ? 'Link copied' : 'Copy link'}
          className="ds-press h-[42px] shrink-0 rounded-[6px] border-0 bg-ink px-ds-4 font-body text-[15px] font-extrabold text-white cursor-pointer"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className="sr-only" aria-live="polite">{copied ? 'Link copied' : ''}</span>
      <div className="grid grid-cols-2 gap-ds-2">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={outlineBtn}>
          <ChatCircle size={18} weight="bold" aria-hidden /> WhatsApp
        </a>
        <button
          type="button"
          onClick={() => (canShare ? void nativeShare() : void copy('Link copied. Paste it into your Instagram story, bio or a DM.'))}
          className={outlineBtn}
        >
          <InstagramLogo size={18} weight="bold" aria-hidden /> Instagram
        </button>
        <button type="button" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr} className={outlineBtn}>
          <QrCode size={18} weight="bold" aria-hidden /> {showQr ? 'Hide QR' : 'QR code'}
        </button>
        <button
          type="button"
          onClick={() => (canShare ? void nativeShare() : void copy('Link copied. Paste it anywhere you like.'))}
          className={outlineBtn}
        >
          <ShareNetwork size={18} weight="bold" aria-hidden /> More
        </button>
      </div>
      {hint ? <p className="m-0 font-body text-[13px] text-ink-muted">{hint}</p> : null}
      {showQr ? (
        <div className="flex flex-col items-center gap-ds-2 rounded-ds-sm bw-hair border-border bg-surface-card p-ds-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR code for your invite link" className="size-48" />
          ) : (
            <div className="grid size-48 place-items-center font-body text-[14px] text-ink-muted">Drawing…</div>
          )}
          <p className="m-0 font-body text-[13px] text-ink-muted">Let a friend scan this to open your link.</p>
          {qr ? (
            <button
              type="button"
              onClick={() => downloadFile('itutor-referral-qr.png', qr)}
              className="ds-link min-h-[44px] border-0 bg-transparent p-0 font-body text-[14px] font-extrabold text-brand-edge cursor-pointer"
            >
              Download
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Redeem() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const redeem = async () => {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ ok: false, text: json?.error ?? 'That code could not be redeemed.' });
        return;
      }
      setMessage({
        ok: true,
        text: `TT$${Number(json.amount_ttd ?? 0).toFixed(2)} added to your credits${json.campaign ? ` (${json.campaign})` : ''}.`,
      });
      setCode('');
      invalidateCredits();
    } catch {
      setMessage({ ok: false, text: 'Could not reach iTutor. Check your connection.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-ds-2">
      <div className="flex gap-ds-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void redeem();
          }}
          aria-label="Code"
          placeholder="Enter code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={32}
          className="h-[50px] min-w-0 flex-1 rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] font-display text-[15px] font-bold uppercase tracking-[1.2px] text-ink placeholder:text-[#757575]"
        />
        <button
          type="button"
          onClick={() => void redeem()}
          disabled={busy || !code.trim()}
          className="h-12 shrink-0 rounded-ds-sm border-0 bg-[#13804a] transition-[background-color,transform,box-shadow] duration-150 [-webkit-tap-highlight-color:transparent] enabled:hover:bg-[#0f6e3f] enabled:active:translate-y-[2px] enabled:active:shadow-[0_2px_0_#0d4f2d] px-[18px] font-body text-[15px] font-extrabold text-white shadow-[0_4px_0_#0d4f2d] cursor-pointer disabled:opacity-60"
        >
          {busy ? 'Redeeming…' : 'Redeem'}
        </button>
      </div>
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={cn('m-0 font-body text-[14px] font-bold', message.ok ? 'text-brand-edge' : 'text-danger')}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

export default function StudentRewardsV2() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const { data, loading } = useCredits('full', Boolean(profile?.id));
  const [allHistory, setAllHistory] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'student') router.push(nonStudentRedirect(profile));
  }, [profile, profileLoading, router]);

  const title = <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Credits</h1>;

  if ((loading || profileLoading) && !data) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        {title}
        <div className="h-[190px] animate-pulse rounded-ds-card bg-surface-sunken" />
        <div className="h-[320px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  if (!data?.available) {
    return (
      <div className="flex flex-col gap-ds-4">
        {title}
        <Card title="Credits are not available yet" body="Check back soon." />
      </div>
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
  const shownHistory = allHistory ? history : history.slice(0, 6);

  return (
    <div className="flex flex-col gap-ds-4">
      {title}

      {data.suspended ? (
        <Card tone="alert" title="Credits are paused" body="This account is suspended, so credits cannot be earned or spent right now." />
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-ds-4 lg:grid-cols-2">
        <div className="flex flex-col gap-ds-4">
          {/* Balance — frame 2:2030 */}
          <section className="flex flex-col gap-[14px] rounded-ds-card bg-ink p-[18px]" aria-label="Your credits">
            <div className="flex items-start justify-between gap-ds-3">
              <div className="flex min-w-0 flex-col gap-ds-1">
                <span className="font-body text-[12px] font-extrabold uppercase tracking-[1.2px] text-brand">Your credits</span>
                <span className="font-display text-[40px] font-black leading-[40px] tabular-nums text-accent-yellow">
                  {whole(wallet.available)}
                </span>
              </div>
              <span className="flex size-[52px] shrink-0 items-center justify-center rounded-ds-card bg-accent-yellow text-ink shadow-[0_4px_0_#b98500]">
                <Gift size={28} weight="bold" aria-hidden />
              </span>
            </div>
            {wallet.pending > 0 || wallet.reserved > 0 ? (
              <div className="flex flex-col">
                {wallet.pending > 0 ? <SummaryRow tone="ink" label="On the way" value={fmtCredits(wallet.pending)} /> : null}
                {wallet.reserved > 0 ? <SummaryRow tone="ink" label="Held for a payment" value={fmtCredits(wallet.reserved)} /> : null}
              </div>
            ) : null}
            <p className="m-0 font-body text-[15px] text-[#c3d3c8]">
              {wallet.available > 0
                ? 'Pays for one whole class payment.'
                : wallet.pending > 0 && programme.hold_days > 0
                  ? `New rewards become spendable ${plural(programme.hold_days, 'day')} after your friend pays.`
                  : 'Invite friends or redeem a code to earn credits.'}
            </p>
            {!data.suspended && wallet.available > 0 ? (
              <button
                type="button"
                onClick={() => router.push('/student/find-tutors')}
                className="ds-press h-12 w-full rounded-ds-sm border-0 bg-brand font-body text-[16px] font-extrabold text-ink shadow-[0_4px_0_#199356] cursor-pointer"
              >
                Use on a class
              </button>
            ) : null}
          </section>

          {/* Invite — frame 2:2049 */}
          {inviting ? (
            <section className="flex flex-col gap-[14px] rounded-ds-card bw-bold border-ink bg-surface-card p-[18px]">
              <div className="flex items-baseline justify-between gap-ds-3">
                <h2 className="m-0 font-display text-[20px] font-extrabold leading-[23px] text-ink">
                  {required === 1 ? `Invite a friend, earn ${reward}` : `Invite ${required}, earn ${reward}`}
                </h2>
                {required > 1 ? (
                  <span className="shrink-0 font-display text-[15px] font-extrabold tabular-nums text-ink">
                    {done} / {required}
                  </span>
                ) : null}
              </div>

              {required > 1 && required <= 6 ? (
                <div className="flex gap-ds-2" aria-label={`${done} of ${required} friends joined`} role="img">
                  {Array.from({ length: required }, (_, i) => {
                    const last = i === required - 1;
                    const filled = i < done;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex h-[68px] min-w-0 flex-1 flex-col items-center justify-center gap-ds-1 rounded-ds-sm p-[2px]',
                          filled ? 'bw-bold border-ink bg-brand text-ink' : 'bw-bold bw-dashed border-border-strong text-ink-faint'
                        )}
                      >
                        {last ? <Gift size={22} weight="bold" aria-hidden /> : <UserPlus size={22} weight="bold" aria-hidden />}
                        <span className={cn('font-body text-[12px] font-extrabold', filled ? 'text-ink' : 'text-[#879489]')}>
                          {last ? reward : `Friend ${i + 1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <ol className="m-0 flex list-none flex-col p-0">
                {[
                  { n: 1, title: 'Share your link', detail: 'WhatsApp, Instagram or QR code' },
                  {
                    n: 2,
                    title: 'A friend joins a class',
                    detail: `Pays ${formatTtd(programme.min_qualifying_cash_ttd, { compact: true })} or more by card`,
                  },
                  {
                    n: 3,
                    title: `You get ${reward}`,
                    detail: required === 1 ? 'For every friend who joins' : `For every ${required} friends who join`,
                  },
                ].map((s, i) => (
                  <li key={s.n} className={cn('flex min-h-[56px] items-center gap-ds-3 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-[6px] font-display text-[15px] font-black',
                        s.n === 3 ? 'bg-accent-yellow text-ink' : 'bg-ink text-brand'
                      )}
                    >
                      {s.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-body text-[16px] font-extrabold text-ink">{s.title}</span>
                      <span className="block font-body text-[14px] text-ink-muted">{s.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <Share link={data.referral!.link} />
            </section>
          ) : null}
        </div>

        <div className="flex flex-col gap-ds-4">
          {programme.campaign_codes_enabled && !data.suspended ? (
            <Panel title="Got a code?">
              <Redeem />
            </Panel>
          ) : null}

          {friends.length > 0 ? (
            <Panel title="Your friends" aside={<span className="font-body text-[14px] text-ink-muted">{friends.length}</span>}>
              <ul className="m-0 flex list-none flex-col p-0">
                {friends.map((f, i) => (
                  <li key={i} className={cn('flex items-center justify-between gap-ds-3 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
                    <span className="min-w-0">
                      <span className="block truncate font-body text-[16px] font-extrabold text-ink">{f.name}</span>
                      <span className="block font-body text-[14px] text-ink-muted">Joined {fmtDate(f.at)}</span>
                    </span>
                    <span className="shrink-0 font-body text-[14px] font-extrabold text-ink">{FRIEND[f.status] ?? f.status}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          <Panel title="History">
            {history.length === 0 ? (
              <p className="m-0 font-body text-[15px] text-ink-muted">
                No credits yet.{inviting ? ' Share your link and you earn credits when friends join a class.' : ''}
              </p>
            ) : (
              <>
                <ul className="m-0 flex list-none flex-col p-0">
                  {shownHistory.map((h, i) => (
                    <li key={h.id} className={cn('flex min-h-[64px] items-center gap-ds-3 py-ds-2', i > 0 && 'bw-t-hair border-line-soft')}>
                      <span
                        className={cn(
                          'flex size-10 shrink-0 items-center justify-center rounded-ds-sm',
                          h.amount >= 0 ? 'bg-accent-yellow text-ink' : 'bg-surface-sunken text-ink'
                        )}
                      >
                        <Plus size={20} weight="bold" aria-hidden className={h.amount < 0 ? 'rotate-45' : undefined} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-body text-[16px] font-extrabold text-ink">{h.label}</span>
                        <span className="block font-body text-[14px] text-ink-muted">
                          {fmtDate(h.at)}
                          {h.detail ? ` · ${h.detail}` : ''}
                          {h.status !== 'done' ? ' · pending' : ''}
                        </span>
                      </span>
                      <span className={cn('shrink-0 font-display text-[16px] font-extrabold tabular-nums', h.amount > 0 ? 'text-brand-edge' : 'text-ink')}>
                        {h.amount > 0 ? '+' : h.amount < 0 ? '−' : ''}
                        {whole(Math.abs(h.amount))}
                      </span>
                    </li>
                  ))}
                </ul>
                {history.length > 6 ? (
                  <button
                    type="button"
                    onClick={() => setAllHistory((v) => !v)}
                    className="ds-link min-h-[44px] self-start border-0 bg-transparent p-0 font-body text-[15px] font-extrabold text-brand-edge cursor-pointer"
                  >
                    {allHistory ? 'Show less' : `Show all ${history.length}`}
                  </button>
                ) : null}
              </>
            )}
          </Panel>

          {/* Good to know — frame 2:2161 */}
          <Panel title="How credits work">
            <dl className="m-0 flex flex-col">
              {[
                { k: 'Pays for', v: 'One whole payment', bad: false },
                { k: 'Part payments', v: 'Not allowed', bad: true },
                { k: 'New subscriptions', v: "Can't start one", bad: true },
                { k: 'Your tutor', v: 'Still paid in full', bad: false },
              ].map((r, i) => (
                <div key={r.k} className={cn('flex min-h-[52px] items-center justify-between gap-ds-3 py-ds-4', i > 0 && 'bw-t-hair border-line-soft')}>
                  <dt className="font-body text-[15px] text-ink-muted">{r.k}</dt>
                  <dd className={cn('m-0 text-right font-body text-[15px] font-extrabold', r.bad ? 'text-danger' : 'text-ink')}>{r.v}</dd>
                </div>
              ))}
            </dl>
            <p className="m-0 font-body text-[13px] text-ink-muted">
              Credits have no cash value, cannot be transferred, and can be taken back if a payment is refunded or for misuse.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
