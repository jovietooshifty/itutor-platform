'use client';

/**
 * ParentProfileV2 — frame `160:8114`, read from Figma.
 *
 * This is where the Profile TAB lands. The frame carries the bottom nav with
 * Profile active, which is how we know it is a tab destination and Settings
 * (`160:7984`, back link, no nav) is not. Before this, the tab went straight
 * to the old settings page.
 *
 * Three floating-label fields, a card per linked child, then Save changes and
 * Cancel. Email is shown but not editable: changing it is an auth flow with a
 * confirmation mail, not a profile field, and a text box that silently fails
 * to change your sign-in address is worse than a read-only one.
 *
 * Worth recording, since it was argued about: the frame's "Save changes"
 * button is DARK TEXT ON GREEN, not white. Same as every other primary button
 * in this file. The white-on-green in the old build was never the design.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';
import { useProfile } from '@/lib/hooks/useProfile';
import { Button } from '@/components/ui/Button';
import { DsIcon } from '@/components/ui/icons';
import '@/components/ui/ds-tokens.css';

type Child = { id: string; name: string };

function Field({
  label,
  value,
  onChange,
  readOnly,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  autoComplete?: string;
}) {
  return (
    <label
      className={cn(
        'flex flex-col gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2',
        'focus-within:border-ink'
      )}
    >
      <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        readOnly={readOnly}
        autoComplete={autoComplete}
        className={cn(
          'w-full border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink',
          'focus:outline-none',
          readOnly && 'text-ink-muted'
        )}
      />
    </label>
  );
}

export function ParentProfileV2() {
  const router = useRouter();
  const { profile } = useProfile();

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [children, setChildren] = useState<Child[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name || profile.full_name || '');
    setUsername(profile.username || '');
  }, [profile]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id);
      if (cancelled) return;
      const rows = (data ?? []).map((r: { child: unknown }) => {
        const c = (Array.isArray(r.child) ? r.child[0] : r.child) as
          | { id?: string; full_name?: string; display_name?: string }
          | null;
        return { id: c?.id ?? '', name: c?.display_name || c?.full_name || 'Child' };
      });
      setChildren(rows.filter((r) => r.id));
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const dirty =
    !!profile &&
    (displayName !== (profile.display_name || profile.full_name || '') ||
      username !== (profile.username || ''));

  async function save() {
    if (!profile?.id) return;
    setSaving(true);
    setError(null);
    const patch: Record<string, string> = { display_name: displayName.trim() };
    // Only send a username when it changed: the column is unique, so
    // rewriting the same value still round-trips a constraint check.
    if (username.trim() !== (profile.username || '')) patch.username = username.trim();

    const { error: err } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    setSaving(false);
    if (err) {
      // The likely one is a duplicate username, and "failed to save" would
      // send the parent back to try the same thing again.
      setError(
        /duplicate|unique/i.test(err.message)
          ? 'That username is taken. Try another.'
          : 'Could not save. Please try again.'
      );
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const childCards = children.map((c) => (
    <button
      key={c.id}
      type="button"
      onClick={() => router.push(`/parent/children/${c.id}`)}
      className={cn(
        'ds-press flex w-full items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card text-left',
        'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink'
      )}
    >
      <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-ds-sm bg-brand font-display text-[15px] font-extrabold text-ink">
        {(c.name[0] ?? 'C').toUpperCase()}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{c.name}</span>
        <span className="font-body text-[13px] text-ink-muted">Student account linked</span>
      </span>
      <span className="shrink-0 text-ink-muted">
        <DsIcon name="chevron" size={18} />
      </span>
    </button>
  ));

  // Phone: the frame, one column with both buttons always shown. From lg up
  // (PROVISIONAL, no wide frame): account on the left at a width that suits
  // a name, linked children on the right, and Save / Cancel only once
  // something has changed — a faded full-width button reads as broken, not
  // as "nothing to save".
  const showActions = dirty || saving || saved || Boolean(error);
  return (
    <div className="flex flex-col gap-ds-3 lg:gap-ds-5">
      <h1 className="ds-page-title">Profile</h1>

      <div className="flex flex-col gap-ds-3 lg:grid lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)] lg:items-start lg:gap-ds-8">
        <section className="flex flex-col gap-ds-3">
          <h2 className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
            Parent account
          </h2>
          <Field label="Display name" value={displayName} onChange={setDisplayName} autoComplete="name" />
          <Field label="Username" value={username} onChange={setUsername} autoComplete="username" />
          <Field label="Email" value={profile?.email ?? ''} readOnly />

          {/* Phone: children sit between the fields and the buttons, as drawn. */}
          {children.length > 0 ? <div className="flex flex-col gap-ds-3 lg:hidden">{childCards}</div> : null}

          {error ? (
            <p role="alert" className="font-body text-[13px] font-extrabold text-danger">
              {error}
            </p>
          ) : null}

          <div
            className={cn(
              'flex flex-col gap-ds-3 lg:flex-row-reverse lg:justify-start lg:gap-ds-2',
              !showActions && 'lg:hidden'
            )}
          >
            <Button onClick={save} disabled={!dirty || saving} block size="lg">
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                // From lg up Cancel undoes the edit in place; on a phone it
                // leaves the screen, as the frame's Cancel does.
                if (window.matchMedia('(min-width: 1024px)').matches && profile) {
                  setDisplayName(profile.display_name || profile.full_name || '');
                  setUsername(profile.username || '');
                  setError(null);
                } else {
                  router.push('/parent/dashboard');
                }
              }}
              block
              size="lg"
            >
              Cancel
            </Button>
          </div>
        </section>

        <section className="hidden flex-col gap-ds-3 lg:flex">
          <h2 className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
            Linked children
          </h2>
          {children.length > 0 ? (
            childCards
          ) : (
            <p className="font-body text-[14px] text-ink-muted">No child linked yet.</p>
          )}
          <button
            type="button"
            onClick={() => router.push('/parent/children')}
            className="ds-link self-start border-0 bg-transparent p-0 font-display text-[15px] font-extrabold text-ink underline underline-offset-4 cursor-pointer"
          >
            Manage children
          </button>
        </section>
      </div>
    </div>
  );
}

export default ParentProfileV2;
