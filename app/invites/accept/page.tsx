'use client';

// Student-facing accept/decline page for a parent connection invite.
// Requires the invited student to be logged in (redirects to /login?redirect=…
// otherwise). Token is read from window.location.search to avoid the
// useSearchParams() Suspense-boundary requirement.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ShieldCheck, Check, X } from 'lucide-react';
import { useProfile } from '@/lib/hooks/useProfile';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import { AuthAlert, AuthButton, AuthFrame, AuthLead, AuthMain, AuthTitle, AuthTopBar, Spinner, Wordmark } from '@/components/auth/v2/AuthKit';

type Invite = { status: string; parentName: string; parentAvatar: string | null; childEmail: string; expiresAt: string };

function initials(s: string) {
  return (s || '?').replace(/[^a-zA-Z0-9@ ]/g, '').split(/[\s@]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export default function AcceptInvitePage() {
  const { user, loading: authLoading } = useProfile();
  const [token, setToken] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState<'accept' | 'decline' | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token');
    setToken(t);
    if (!t) { setError('This invite link is missing its token.'); setLoading(false); }
  }, []);

  useEffect(() => {
    if (authLoading || !token) return;
    if (!user) {
      window.location.href = `/login?redirect=${encodeURIComponent(`/invites/accept?token=${token}`)}`;
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Could not load this invite.'); return; }
        setInvite(data);
      } catch {
        setError('Could not load this invite.');
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, token]);

  async function respond(action: 'accept' | 'decline') {
    if (!token || responding) return;
    setResponding(true);
    setError('');
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}/respond`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Something went wrong.'); return; }
      setDone(action);
    } catch {
      setError('Something went wrong.');
    } finally {
      setResponding(false);
    }
  }

  if (isNewUiEnabled()) {
    return (
      <InviteV2
        busy={(authLoading || loading) && !error && !done}
        done={done}
        error={error}
        invite={invite}
        responding={responding}
        respond={respond}
      />
    );
  }

  return (
    <main className="min-h-screen bg-background grid place-items-center p-4">
      <div className="w-full max-w-lg">
        {(authLoading || loading) && !error && !done ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : done ? (
          <Card>
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <div className={`size-14 rounded-2xl grid place-items-center ${done === 'accept' ? 'bg-brand/10 text-brand-deep' : 'bg-muted text-muted-foreground'}`}>
                {done === 'accept' ? <Check className="size-7" /> : <X className="size-7" />}
              </div>
              <h1 className="text-xl font-bold text-ink">{done === 'accept' ? 'Connected' : 'Invite declined'}</h1>
              <p className="text-sm text-muted-foreground max-w-sm">
                {done === 'accept'
                  ? `${invite?.parentName ?? 'Your parent/guardian'} can now see your classes, bookings and billing. You can manage this from settings anytime.`
                  : 'No connection was made and nothing was shared. You can close this page.'}
              </p>
              <Link href="/student/dashboard" className="mt-2 inline-flex px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep">
                Go to my dashboard
              </Link>
            </div>
          </Card>
        ) : error ? (
          <Card>
            <div className="text-center py-4">
              <h1 className="text-lg font-bold text-ink">This invite can’t be opened</h1>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <Link href="/student/dashboard" className="mt-4 inline-flex text-sm font-semibold text-brand-deep hover:underline">Back to dashboard</Link>
            </div>
          </Card>
        ) : invite && invite.status === 'pending' ? (
          <Card>
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-brand-deep" /> Parent invite
            </div>
            <h1 className="mt-2 text-xl font-bold text-ink leading-snug">
              {invite.parentName} wants to connect as your parent or guardian
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If you accept, they’ll see your classes, bookings and billing — nothing else. You’ll keep paying for your own classes unless they change that. Declining is fine and shares nothing.
            </p>

            <div className="mt-5 rounded-2xl bg-muted/50 border border-border p-4 flex items-center justify-between gap-3">
              <Node label={invite.parentName} avatar={invite.parentAvatar} text={initials(invite.parentName)} />
              <div className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Waiting</span>
                <div className="w-full border-t border-dashed border-border" />
              </div>
              <Node label={invite.childEmail} text={initials(invite.childEmail)} />
            </div>

            <div className="mt-5 flex gap-2">
              <button onClick={() => respond('accept')} disabled={responding}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
                {responding ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Accept
              </button>
              <button onClick={() => respond('decline')} disabled={responding}
                className="px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-ink hover:bg-muted disabled:opacity-50">
                Decline
              </button>
            </div>
          </Card>
        ) : (
          <Card>
            <div className="text-center py-4">
              <h1 className="text-lg font-bold text-ink">This invite is no longer active</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                It looks like this invite was already {invite?.status ?? 'handled'}. Ask your parent/guardian to send a new one if needed.
              </p>
              <Link href="/student/dashboard" className="mt-4 inline-flex text-sm font-semibold text-brand-deep hover:underline">Back to dashboard</Link>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-3xl bg-card border border-border shadow-sm p-6 sm:p-7">{children}</div>;
}

function Node({ label, text, avatar }: { label: string; text: string; avatar?: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5 max-w-[40%]">
      <div className="size-12 rounded-full bg-brand/10 text-brand-deep grid place-items-center text-sm font-bold overflow-hidden">
        {avatar ? <img src={avatar} alt="" className="size-12 object-cover" /> : text}
      </div>
      <span className="text-xs text-muted-foreground truncate max-w-full">{label}</span>
    </div>
  );
}

/* ─── New UI ──────────────────────────────────────────────────────────
 * The same page in the design system, built from the auth screens' kit
 * (AuthFrame supplies .ds-root): this screen is reached from an email, often
 * on a phone, before the student is inside any app shell. Owner, 2026-11-16.
 * The old card ran off a 390px screen: the student's email sat under their
 * avatar with nothing letting it shrink. Here every label can wrap.
 * PROVISIONAL: no frame for this screen. */

function InviteV2({
  busy,
  done,
  error,
  invite,
  responding,
  respond,
}: {
  busy: boolean;
  done: 'accept' | 'decline' | null;
  error: string;
  invite: Invite | null;
  responding: boolean;
  respond: (a: 'accept' | 'decline') => void;
}) {
  const parent = invite?.parentName || 'Your parent or guardian';
  return (
    <AuthFrame>
      <AuthTopBar noBack right={<span className="mx-auto pr-11"><Wordmark /></span>} />
      <AuthMain className="justify-center">
        {busy ? (
          <div className="flex items-center justify-center gap-ds-2 py-20 text-[15px] font-bold text-ink-muted">
            <Spinner /> Loading your invite…
          </div>
        ) : done ? (
          <>
            <span
              className={`grid size-16 place-items-center rounded-ds-card bw-bold border-ink font-display text-[30px] font-extrabold ${done === 'accept' ? 'bg-brand text-ink' : 'bg-surface-card text-ink-muted'}`}
              aria-hidden
            >
              {done === 'accept' ? '✓' : '×'}
            </span>
            <AuthTitle>{done === 'accept' ? "You're connected" : 'Invite declined'}</AuthTitle>
            <AuthLead>
              {done === 'accept'
                ? `${parent} can now see your classes, bookings and billing. You can change this in Settings any time.`
                : 'No connection was made and nothing was shared.'}
            </AuthLead>
            <AuthButton tone="student" href="/student/dashboard" className="mt-ds-2">
              Go to my home
            </AuthButton>
          </>
        ) : error ? (
          <>
            <AuthTitle>This invite can&apos;t be opened</AuthTitle>
            <AuthAlert>{error}</AuthAlert>
            <AuthButton tone="outline" href="/student/dashboard">
              Go to my home
            </AuthButton>
          </>
        ) : invite && invite.status === 'pending' ? (
          <>
            <span className="self-start rounded-ds-full bg-[#0f2e47] px-ds-3 py-[5px] text-[12px] font-extrabold uppercase tracking-[0.08em] text-on-ink">
              Parent invite
            </span>
            <AuthTitle>{parent} wants to connect as your parent or guardian</AuthTitle>
            <AuthLead>Declining is fine. Nothing is shared unless you accept.</AuthLead>

            {/* Who is connecting to whom. Each side can wrap; nothing overflows. */}
            <div className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-ink bg-surface-card p-ds-card">
              <InvitePerson name={invite.parentName} avatar={invite.parentAvatar} role="Parent" />
              <span className="shrink-0 text-[20px] font-extrabold text-ink-muted" aria-hidden>
                →
              </span>
              <InvitePerson name={invite.childEmail} role="You" />
            </div>

            <div className="rounded-ds-card bg-surface-sunken p-ds-card">
              <p className="m-0 text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">If you accept, they can see</p>
              <ul className="m-0 mt-ds-1 flex list-none flex-col gap-[2px] p-0 text-[15px] font-bold text-ink">
                <li>• Your classes</li>
                <li>• Your bookings</li>
                <li>• Your billing</li>
              </ul>
              <p className="m-0 mt-ds-2 text-[14px] leading-5 text-ink-muted">
                Nothing else. You keep paying for your own classes unless they change that.
              </p>
            </div>

            <div className="mt-ds-1 flex flex-col gap-ds-2">
              <AuthButton tone="student" onClick={() => respond('accept')} busy={responding}>
                Accept
              </AuthButton>
              <AuthButton tone="outline" onClick={() => respond('decline')} disabled={responding}>
                Decline
              </AuthButton>
            </div>
          </>
        ) : (
          <>
            <AuthTitle>This invite is no longer active</AuthTitle>
            <AuthLead>
              It was already {invite?.status ?? 'handled'}. Ask your parent or guardian to send a new one if you need it.
            </AuthLead>
            <AuthButton tone="outline" href="/student/dashboard">
              Go to my home
            </AuthButton>
          </>
        )}
      </AuthMain>
    </AuthFrame>
  );
}

function InvitePerson({ name, avatar, role }: { name: string; avatar?: string | null; role: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-ds-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="size-11 shrink-0 rounded-full bw-hair border-ink object-cover" />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bw-hair border-ink bg-brand font-display text-[14px] font-extrabold text-ink">
          {initials(name)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">{role}</span>
        <span className="block text-[14px] font-extrabold leading-5 text-ink [overflow-wrap:anywhere]">{name}</span>
      </span>
    </div>
  );
}
