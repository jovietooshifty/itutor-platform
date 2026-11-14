'use client';

/**
 * Small pieces shared by the Account screens (Settings › Payment methods,
 * Notifications, Security, Add a card, Help sub-screens). Not design-system
 * components: they are the frames' own field and toggle, drawn once here so
 * the screens cannot drift apart.
 *
 * - FloatField: the floating-label field from Security `160:8156` and Add a
 *   card `160:8220` (uppercase label inside a 10px-radius card, ink border).
 * - Switch: the green pill toggle from Notification settings `160:8262`.
 * - useNewUiOnly: these routes exist only in the new UI. With the flag off
 *   they send the parent to the old screen that holds the same thing, rather
 *   than 404ing.
 */

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';

export function FloatField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoComplete,
  readOnly,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  readOnly?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex flex-col gap-[2px] rounded-ds-card bw-hair border-ink bg-surface-card px-ds-card py-ds-2',
        'focus-within:outline focus-within:outline-2 focus-within:outline-ink'
      )}
    >
      <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
        {label}
      </span>
      <input
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        readOnly={readOnly}
        className="w-full border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink placeholder:font-body placeholder:font-normal placeholder:text-ink-muted focus:outline-none"
      />
    </label>
  );
}

export function Switch({
  on,
  onToggle,
  label,
  busy,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onToggle}
      className={cn(
        'relative h-[28px] w-[48px] shrink-0 rounded-ds-full border-0 cursor-pointer transition-colors disabled:opacity-60',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
        on ? 'bg-brand' : 'bg-line-soft'
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] h-[22px] w-[22px] rounded-ds-full bg-surface-card transition-all',
          on ? 'left-[23px]' : 'left-[3px]'
        )}
      />
    </button>
  );
}

/** A white card row: title, one-line detail, and something on the right. */
export function ToggleCard({ title, detail, children }: { title: ReactNode; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{title}</span>
        {detail ? <span className="font-body text-[13px] text-ink-muted">{detail}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="font-body text-[13px] font-extrabold text-danger">
      {children}
    </p>
  );
}

export function FormNote({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="font-body text-[13px] font-extrabold text-ink">
      {children}
    </p>
  );
}

/**
 * True when the new UI is on. When it is off, replaces the URL with
 * `fallback` (an old-UI screen) and the caller renders nothing.
 */
export function useNewUiOnly(fallback: string): boolean {
  const router = useRouter();
  const enabled = isNewUiEnabled();
  useEffect(() => {
    if (!enabled) router.replace(fallback);
  }, [enabled, fallback, router]);
  return enabled;
}
