'use client';

/**
 * Student Notifications, new UI — Figma `2:2573` (states I1 none, I2 all
 * types), file rwytRx6xmRHf4AMzpxAznd.
 *
 * DATA: the student's own `notifications` rows, read and updated in the
 * browser under RLS, exactly as the parent notifications page does.
 *
 * THE COLUMN IS `is_read`. The old student page read and wrote `read`, which
 * does not exist: every notification looked unread and "Mark all read" failed
 * without a word. /api/notifications is not used either — it selects
 * group_id and session_occurrence_id, which this table does not have on
 * staging, so it errors there.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CaretRight,
  ChatCircle,
  CreditCard,
  SlidersHorizontal,
  VideoCamera,
} from '@phosphor-icons/react';
import { Segmented, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';

type Row = {
  id: string;
  title: string;
  message: string | null;
  type: string | null;
  link: string | null;
  created_at: string;
  is_read: boolean;
};

const TZ = 'America/Port_of_Spain';
const WEEK_MS = 7 * 86_400_000;

/** The frame draws two kinds — a class reminder (orange) and a payment (ink). */
function iconFor(n: Row) {
  const key = `${n.type ?? ''} ${n.title}`.toLowerCase();
  if (/session|class|lesson|reminder|attendance|starts/.test(key))
    return { cls: 'bg-accent-orange text-ink', icon: <VideoCamera size={20} weight="bold" aria-hidden /> };
  if (/pay|subscri|billing|receipt|charge|refund|credit/.test(key))
    return { cls: 'bg-ink text-brand', icon: <CreditCard size={20} weight="bold" aria-hidden /> };
  if (/message|chat/.test(key))
    return { cls: 'bg-on-ink-muted text-ink', icon: <ChatCircle size={20} weight="bold" aria-hidden /> };
  return { cls: 'bg-brand text-ink', icon: <Bell size={20} weight="bold" aria-hidden /> };
}

function when(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TZ })
    .format(new Date(iso))
    .replace(/(\d+) (\w+)/, '$2 $1');
}

export default function StudentNotificationsV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'student') router.push(nonStudentRedirect(profile));
  }, [profile, loading, router]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    const { data, error: e } = await supabase
      .from('notifications')
      .select('id, title, message, type, link, created_at, is_read')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (e) {
      setError(true);
      setRows([]);
      return;
    }
    setError(false);
    setRows((data ?? []) as Row[]);
  }, [profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = rows?.filter((r) => !r.is_read).length ?? 0;
  const shown = useMemo(
    () => (rows ?? []).filter((r) => filter === 'all' || !r.is_read),
    [rows, filter]
  );
  const cutoff = Date.now() - WEEK_MS;
  const groups: Array<[string, Row[]]> = [
    ['This week', shown.filter((r) => new Date(r.created_at).getTime() >= cutoff)],
    ['Earlier', shown.filter((r) => new Date(r.created_at).getTime() < cutoff)],
  ];

  const markAll = async () => {
    if (!profile?.id || unread === 0) return;
    setRows((prev) => prev?.map((r) => ({ ...r, is_read: true })) ?? prev);
    const { error: e } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    if (e) void load(); // put the truth back rather than pretend
  };

  const open = async (r: Row) => {
    if (!r.is_read) {
      setRows((prev) => prev?.map((x) => (x.id === r.id ? { ...x, is_read: true } : x)) ?? prev);
      await supabase.from('notifications').update({ is_read: true }).eq('id', r.id);
    }
    // Only in-app paths; a stored absolute URL is not followed blindly.
    if (r.link && r.link.startsWith('/')) router.push(r.link);
  };

  return (
    <div className="flex flex-col gap-ds-4">
      <div className="flex items-center gap-ds-3">
        <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Notifications</h1>
        {unread > 0 ? <Tag tone="orange" className="text-[12px] normal-case tracking-normal">{`${unread} new`}</Tag> : null}
      </div>

      <div className="lg:max-w-[420px]">
        <Segmented
          label="Show"
          options={[
            { id: 'all', label: 'All' },
            { id: 'unread', label: unread > 0 ? `Unread · ${unread}` : 'Unread' },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {error ? (
        <p className="m-0 rounded-ds-card bg-danger-soft bw-hair border-danger p-ds-4 text-[15px] font-bold text-ink">
          We couldn&apos;t load your notifications.
        </p>
      ) : null}

      {rows === null ? (
        <div className="flex flex-col gap-ds-3" aria-busy>
          <div className="h-[84px] animate-pulse rounded-ds-card bg-surface-sunken" />
          <div className="h-[84px] animate-pulse rounded-ds-card bg-surface-sunken" />
        </div>
      ) : shown.length === 0 ? (
        // I1 — nothing here.
        <div className="flex flex-col items-center gap-ds-2 rounded-ds-card bg-surface-card bw-hair border-border px-ds-4 py-ds-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-ds-sm bg-surface-sunken text-ink">
            <Bell size={24} aria-hidden />
          </span>
          <p className="m-0 font-display text-[18px] font-extrabold text-ink">
            {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
          </p>
          <p className="m-0 max-w-[36ch] text-[14px] text-ink-muted">
            Class reminders, payments and messages from your tutors show up here.
          </p>
        </div>
      ) : (
        groups
          .filter(([, list]) => list.length > 0)
          .map(([label, list], gi) => (
            <section key={label} className="flex flex-col gap-ds-3">
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">{label}</h2>
                {gi === 0 && unread > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAll()}
                    className="ds-link min-h-[44px] border-0 bg-transparent p-0 text-[15px] font-extrabold text-brand-edge cursor-pointer"
                  >
                    Mark all read
                  </button>
                ) : null}
              </div>
              <div className="grid gap-ds-3 lg:grid-cols-2">
                {list.map((r) => {
                  const ic = iconFor(r);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => void open(r)}
                      className={cn(
                        'ds-press flex w-full items-start gap-ds-3 rounded-ds-card bg-surface-card p-ds-card text-left cursor-pointer',
                        r.is_read ? 'bw-hair border-border' : 'bw-bold border-ink'
                      )}
                    >
                      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-ds-sm', ic.cls)}>{ic.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-ds-2">
                          <span className="min-w-0 flex-1 text-[16px] font-extrabold leading-[20px] text-ink">{r.title}</span>
                          <span className="flex shrink-0 items-center gap-ds-1h pt-[2px] text-[13px] font-bold text-ink-muted">
                            {!r.is_read ? <i className="size-2 rounded-[2px] bg-brand" aria-label="Unread" /> : null}
                            {when(r.created_at)}
                          </span>
                        </span>
                        {r.message ? <span className="mt-ds-1 block text-[14px] leading-[19px] text-ink-muted">{r.message}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))
      )}

      <Link
        href="/student/settings"
        className="ds-press flex items-center gap-ds-3 rounded-ds-card bg-surface-card bw-hair border-border p-ds-card lg:max-w-[520px]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-ds-sm bg-accent-yellow text-ink">
          <SlidersHorizontal size={20} weight="bold" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-extrabold text-ink">Choose what you get</span>
          <span className="block text-[14px] text-ink-muted">Reminders, payments and tips</span>
        </span>
        <CaretRight size={20} weight="bold" className="shrink-0 text-ink" aria-hidden />
      </Link>
    </div>
  );
}
