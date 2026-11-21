'use client';

/**
 * Notification settings — frame `160:8262`. Settings › Notifications, and the
 * "Notification settings" row at the foot of /parent/notifications. This is
 * now the ONE place these switches live.
 *
 * REAL DATA: GET/PATCH /api/notifications/preferences, the same contract as
 * components/parent/NotificationPreferences.tsx (the old-UI version): the
 * categories come from the server constant the send paths use, each with a
 * push and an email channel, plus per-child mutes. Toggles save immediately
 * and optimistically; a failed save snaps back that one switch.
 *
 * Deviations from the frame:
 * - The frame draws three single-switch cards (Class reminders, Payments,
 *   Email). The real model is every category × {push, email}, so each card
 *   carries two labelled switches. A single switch per card would have had to
 *   write both channels, which the API does not offer and the old screen
 *   never did. The frame's "Email" card is the email column here.
 * - Card titles are the server's category labels, not the frame's copy, so a
 *   switch is never offered for something nothing sends.
 * - "Per child" (mute one child's notifications) has no frame. PROVISIONAL.
 * - Back link reads "Settings" with "Notifications" as the page title.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { DetailScreen, DetailSkeleton, EmptyCard } from './DetailScreen';
import { FormError, Switch } from './accountKit';

type Category = { key: string; label: string; detail: string };
type Matrix = Record<string, { push: boolean; email: boolean }>;
type Mute = { childId: string; category: string };
type Child = { id: string; name: string };

export default function ParentNotificationSettingsV2() {
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [categories, setCategories] = useState<Category[]>([]);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [mutes, setMutes] = useState<Mute[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const res = await fetch('/api/notifications/preferences', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setCategories(json.categories ?? []);
      setMatrix(json.preferences ?? {});
      setMutes(json.mutes ?? []);
      setChildren(json.children ?? []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleChannel = async (category: string, channel: 'push' | 'email') => {
    const next = !(matrix[category]?.[channel] ?? true);
    setMatrix((m) => ({ ...m, [category]: { ...m[category], [channel]: next } }));
    setError(null);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, channel, enabled: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMatrix((m) => ({ ...m, [category]: { ...m[category], [channel]: !next } }));
      setError('That did not save. Try again.');
    }
  };

  const isMuted = (childId: string, category: string) =>
    mutes.some((m) => m.childId === childId && m.category === category);

  const toggleMute = async (childId: string, category: string) => {
    const muted = !isMuted(childId, category);
    const apply = (mute: boolean) =>
      setMutes((prev) =>
        mute
          ? [...prev, { childId, category }]
          : prev.filter((m) => !(m.childId === childId && m.category === category))
      );
    apply(muted);
    setError(null);
    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, childId, muted }),
      });
      if (!res.ok) throw new Error();
    } catch {
      apply(!muted);
      setError('That did not save. Try again.');
    }
  };

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Notifications">
      {status === 'loading' ? (
        <DetailSkeleton rows={3} />
      ) : status === 'error' ? (
        <EmptyCard
          title="We could not load your settings"
          body="Nothing has changed. Try again in a moment."
          action={
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <p className="font-body text-[14px] text-ink-muted">
            Turning something off does not hide it: everything still appears in your notifications list.
          </p>
          {error ? <FormError>{error}</FormError> : null}

          <ul className="flex flex-col gap-ds-3">
            {categories.map((c) => (
              <li
                key={c.key}
                className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card"
              >
                <div className="flex flex-col gap-[2px]">
                  <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{c.label}</span>
                  <span className="font-body text-[13px] text-ink-muted">{c.detail}</span>
                </div>
                <div className="flex flex-wrap gap-x-ds-6 gap-y-ds-2">
                  {(['push', 'email'] as const).map((ch) => (
                    <div key={ch} className="flex items-center gap-ds-2">
                      <Switch
                        on={matrix[c.key]?.[ch] ?? true}
                        onToggle={() => toggleChannel(c.key, ch)}
                        label={`${c.label}: ${ch === 'push' ? 'push notifications' : 'email'}`}
                      />
                      <span className="font-body text-[13px] font-extrabold text-ink">
                        {ch === 'push' ? 'Push' : 'Email'}
                      </span>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>

          {children.length > 0 ? (
            <section className="flex flex-col gap-ds-3 pt-ds-2">
              <h2 className="font-display text-[18px] font-extrabold text-ink">Per child</h2>
              <p className="font-body text-[13px] text-ink-muted">
                Switch a category off to stop hearing about it for one child only.
              </p>
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card"
                >
                  <span className="py-ds-3 font-display text-[15px] font-extrabold text-ink">{child.name}</span>
                  {categories.map((c) => (
                    <div key={c.key} className="flex items-center gap-ds-3 bw-t-hair border-line-soft py-ds-3">
                      <span className="min-w-0 flex-1 font-body text-[14px] text-ink">{c.label}</span>
                      <Switch
                        on={!isMuted(child.id, c.key)}
                        onToggle={() => toggleMute(child.id, c.key)}
                        label={`${c.label} for ${child.name}`}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </section>
          ) : null}
        </>
      )}
    </DetailScreen>
  );
}
