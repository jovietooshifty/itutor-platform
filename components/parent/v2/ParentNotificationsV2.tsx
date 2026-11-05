'use client';

/**
 * Notifications, new UI. Reached from the header bell.
 *
 * PROVISIONAL VISUALS: no Figma frame covers this screen. Built from NavRow
 * and the system's ink toggle; check against a frame when one exists.
 *
 * Changes from the old page:
 * - Four filters became two (All / Unread). "Enrolment" and "Alerts" matched
 *   on substrings of the type and hid rows they should have shown.
 * - Unread is marked by weight and a dark dot, not the old orange dot.
 * - The notification switches moved to Settings › Notifications, where every
 *   other setting lives; this screen links there.
 * - Every row that has somewhere to go opens it, and reading it marks it read.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { NavRow } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';

type NotifRow = {
  id: string;
  title: string;
  message: string;
  type: string;
  link: string | null;
  created_at: string;
  is_read: boolean;
};

/**
 * Where a notification takes a parent. Links are written by whoever raised the
 * notification, and some point at student-only routes, which used to bounce a
 * parent to the login screen. Known student routes map to the parent
 * equivalent; feedback and report notifications go to Feedback whatever their
 * link says; anything else under /student/ is dropped.
 */
export function parentNotificationHref(n: Pick<NotifRow, 'type' | 'link'>): string | null {
  const t = (n.type || '').toLowerCase();
  if (t.includes('feedback') || t.includes('report')) return '/parent/feedback';
  const link = n.link;
  if (!link) {
    if (t.includes('payment') || t.includes('charge') || t.includes('receipt')) return '/parent/billing';
    if (t.includes('approval') || t.includes('request')) return '/parent/my-classes';
    return null;
  }
  if (!link.startsWith('/student/')) return link;
  if (link.startsWith('/student/bookings')) return '/parent/my-classes';
  if (link.startsWith('/student/subscriptions')) return '/parent/my-classes';
  if (link.startsWith('/student/classes')) return '/parent/my-classes';
  if (link.startsWith('/student/explore')) return '/parent/classes';
  if (link.startsWith('/student/tutors/')) return link.replace('/student/tutors/', '/parent/tutors/');
  if (link.startsWith('/student/dashboard')) return '/parent/dashboard';
  return null;
}

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.round((now.getTime() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const sameDay = d.toDateString() === now.toDateString();
  const t = d.toLocaleTimeString('en-TT', { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today · ${t}`;
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `Yesterday · ${t}`;
  return `${d.toLocaleDateString('en-TT', { weekday: 'short', day: 'numeric', month: 'short' })} · ${t}`;
}

export default function ParentNotificationsV2() {
  const router = useRouter();
  const { profile } = useProfile();
  const [items, setItems] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const load = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, link, created_at, is_read')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60);
    setItems((data as NotifRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.id) load(profile.id);
  }, [profile?.id, load]);

  const unread = items.filter((n) => !n.is_read).length;
  const shown = unreadOnly ? items.filter((n) => !n.is_read) : items;

  const markAllRead = async () => {
    if (!profile?.id) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile.id).eq('is_read', false);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const open = async (n: NotifRow) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    }
    const href = parentNotificationHref(n);
    if (href) router.push(href);
  };

  return (
    <DetailScreen
      backLabel="Back"
      fallbackHref="/parent/dashboard"
      title="Notifications"
      action={
        unread > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            className="shrink-0 border-0 bg-transparent p-0 pb-[4px] font-display text-[14px] font-extrabold text-ink underline underline-offset-4 cursor-pointer"
          >
            Mark all read
          </button>
        ) : null
      }
    >
      <div role="tablist" aria-label="Show" className="flex gap-ds-2">
        {[
          { on: false, label: 'All' },
          { on: true, label: unread > 0 ? `Unread · ${unread}` : 'Unread' },
        ].map((f) => {
          const active = unreadOnly === f.on;
          return (
            <button
              key={f.label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setUnreadOnly(f.on)}
              className={cn(
                'rounded-ds-full bw-bold px-ds-4 py-ds-2 font-display text-[14px] font-extrabold cursor-pointer',
                active ? 'border-ink bg-ink text-on-ink' : 'border-ink bg-surface-card text-ink'
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading && profile?.id ? (
        <DetailSkeleton rows={4} />
      ) : shown.length === 0 ? (
        <EmptyCard
          title={unreadOnly ? 'Nothing unread' : 'No notifications yet'}
          body={
            unreadOnly
              ? 'You have read everything.'
              : 'Booking requests, payments and tutor feedback show up here.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-ds-2">
          {shown.map((n) => {
            const href = parentNotificationHref(n);
            return (
              <li key={n.id}>
                <NavRow
                  onClick={() => open(n)}
                  chevron={!!href}
                  tile={
                    <span
                      aria-label={n.is_read ? undefined : 'Unread'}
                      className={cn(
                        'h-[10px] w-[10px] flex-none rounded-ds-full',
                        n.is_read ? 'bg-transparent' : 'bg-ink'
                      )}
                    />
                  }
                  title={<span className={n.is_read ? 'font-body font-normal' : ''}>{n.title}</span>}
                  meta={
                    <span className="flex flex-col gap-[2px]">
                      {n.message ? <span className="text-ink">{n.message}</span> : null}
                      <span>{when(n.created_at)}</span>
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <NavRow
        href="/parent/settings?section=notifications"
        title="Notification settings"
        meta="Choose what we send you"
      />
    </DetailScreen>
  );
}
