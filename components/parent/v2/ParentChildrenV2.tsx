'use client';

/**
 * Your children, new UI. Reached from notification links and Profile.
 *
 * PROVISIONAL VISUALS: no Figma frame. Child rows match the child cards on
 * Profile (160:7984 family); the invite card is built from system parts.
 *
 * Removed from the old page: the parent-to-child connection diagram and the
 * three-step "Invite your child" walkthrough. What they explained now fits in
 * one sentence under the email field. Invite and resend behave exactly as
 * before (same endpoints), and both send a real email.
 */

import { useCallback, useEffect, useState } from 'react';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { Button, NavRow, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DetailScreen, DetailSkeleton } from './DetailScreen';

type ChildData = { id: string; name: string; activeClasses: number; pendingCount: number };
type PendingInvite = { id: string; child_email: string; created_at: string };

/** The square initial tile Profile uses for a child. */
export function ChildTile({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-ds-sm bg-brand font-display font-extrabold text-ink"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {(name.trim()[0] ?? 'C').toUpperCase()}
    </span>
  );
}

function sentAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  const days = Math.round(diff / 86_400_000);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function ParentChildrenV2() {
  const { profile } = useProfile();
  const [children, setChildren] = useState<ChildData[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async (parentId: string) => {
    const [summary, { data: inv }] = await Promise.all([
      fetch('/api/parent/children/summary', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { children: [] }))
        .catch(() => ({ children: [] })),
      supabase
        .from('parent_child_invites')
        .select('id, child_email, created_at')
        .eq('parent_id', parentId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);
    setChildren(
      (summary.children ?? []).map((c: any) => ({
        id: c.id,
        name: c.name,
        activeClasses: c.activeClasses ?? 0,
        pendingCount: c.pendingCount ?? 0,
      }))
    );
    setInvites((inv ?? []) as PendingInvite[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.id) load(profile.id);
  }, [profile?.id, load]);

  async function sendInvite() {
    const value = email.trim().toLowerCase();
    if (!value || sending) return;
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch('/api/parent/invite-child', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ kind: 'err', text: data.error || 'Could not send the invite.' });
        return;
      }
      setEmail('');
      setMsg({ kind: 'ok', text: `Invite sent to ${value}. We will tell you when they accept.` });
      if (profile?.id) await load(profile.id);
    } catch {
      setMsg({ kind: 'err', text: 'Could not send the invite. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  async function resend(id: string) {
    setResendingId(id);
    try {
      const res = await fetch(`/api/parent/invites/${id}/resend`, { method: 'POST' });
      setMsg(res.ok ? { kind: 'ok', text: 'Invite sent again.' } : { kind: 'err', text: 'Could not resend. Try again later.' });
    } finally {
      setResendingId(null);
    }
  }

  return (
    <DetailScreen backLabel="Back" fallbackHref="/parent/profile" title="Your children">
      {loading && profile?.id ? (
        <DetailSkeleton rows={2} />
      ) : (
        <>
          {children.length > 0 ? (
            <ul className="flex flex-col gap-ds-2">
              {children.map((c) => (
                <li key={c.id}>
                  <NavRow
                    href={`/parent/children/${c.id}`}
                    tile={<ChildTile name={c.name} />}
                    title={c.name}
                    meta={
                      <>
                        <span>{plural(c.activeClasses, 'class', 'classes')}</span>
                        {c.pendingCount > 0 ? (
                          <Tag tone="warning">{plural(c.pendingCount, 'request', 'requests')} waiting</Tag>
                        ) : null}
                      </>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : null}

          {invites.length > 0 ? (
            <section className="flex flex-col gap-ds-2">
              <h2 className="font-display text-[13px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">
                Waiting to accept
              </h2>
              {invites.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[15px] font-extrabold text-ink">{i.child_email}</p>
                    <p className="font-body text-[13px] text-ink-muted">Invited {sentAgo(i.created_at)}</p>
                  </div>
                  <Button variant="outline" size="sm" disabled={resendingId === i.id} onClick={() => resend(i.id)}>
                    {resendingId === i.id ? 'Sending…' : 'Resend'}
                  </Button>
                </div>
              ))}
            </section>
          ) : null}

          <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
            <div className="flex flex-col gap-ds-1">
              <h2 className="font-display text-[18px] font-extrabold text-ink">
                {children.length > 0 ? 'Link another child' : 'Link your child'}
              </h2>
              <p className="font-body text-[14px] text-ink-muted">
                Enter the email your child uses on iTutor. They get a link to accept, and once they do you
                can book and pay for their classes.
              </p>
            </div>
            <label
              className={cn(
                'flex flex-col gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2',
                'focus-within:border-ink'
              )}
            >
              <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
                Child&apos;s email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendInvite();
                }}
                placeholder="name@example.com"
                autoComplete="off"
                className="w-full border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink placeholder:font-body placeholder:font-normal placeholder:text-ink-muted focus:outline-none"
              />
            </label>
            {msg ? (
              <p
                role={msg.kind === 'err' ? 'alert' : 'status'}
                className={cn('font-body text-[13px] font-extrabold', msg.kind === 'err' ? 'text-danger' : 'text-brand-edge')}
              >
                {msg.text}
              </p>
            ) : null}
            <Button block size="lg" disabled={!email.trim() || sending} onClick={sendInvite}>
              {sending ? 'Sending…' : 'Send invite'}
            </Button>
          </section>
        </>
      )}
    </DetailScreen>
  );
}
