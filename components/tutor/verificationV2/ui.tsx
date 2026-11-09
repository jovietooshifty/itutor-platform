'use client';

// The building blocks of the teacher verification screens. They copy the
// "Complete your profile" checklist (app/tutor/get-listed/page.tsx): the same card, the
// same header with a status pill, the same progress card and the same buttons, all from
// the site's own tokens. Nothing here introduces a colour, size or radius the checklist
// does not already use.

import type { ReactNode } from 'react';
import { AlertCircle, Check, Circle } from 'lucide-react';
import type { StepStatus } from '@/lib/verificationV2/constants';
import { cn } from '@/lib/utils';

export const SUPPORT_EMAIL = 'hello@myitutor.com';

export type StepState = StepStatus | 'optional';

/** The checklist's steps, in the order they are shown. They can be done in ANY order. */
export const CHECKLIST_META = {
  name: { title: 'Name on your ID', subtitle: 'Your first and last name, exactly as on your government ID.' },
  identity: { title: 'Upload your ID', subtitle: 'A quick check of your government ID and a selfie, done by Didit.' },
  credentials: { title: 'Credentials', subtitle: 'Add each qualification you teach from, with a photo of the certificate.' },
  details: { title: 'Other details (optional)', subtitle: 'Up to three more things students may want to know.' },
} as const;

const PILL: Record<StepState, { label: string; cls: string }> = {
  not_started: { label: 'Not started', cls: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In progress', cls: 'bg-amber-100 text-amber-800' },
  done: { label: 'Done', cls: 'bg-brand/15 text-brand-deep' },
  // Red only for what needs the teacher to act.
  needs_changes: { label: 'Needs changes', cls: 'bg-red-50 text-red-700' },
  optional: { label: 'Optional', cls: 'bg-sky/20 text-sky-700' },
};

/** A step screen that can save what is on it. The Save button under the step calls this. */
export interface StepHandle {
  /** Saves anything typed or chosen on the screen. Resolves false when it could not (the step shows why). */
  save(): Promise<boolean>;
}

const DOT: Record<StepState, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-amber-100 text-amber-800',
  done: 'bg-brand text-white',
  needs_changes: 'bg-red-50 text-red-700',
  optional: 'bg-muted text-muted-foreground',
};

/**
 * "Step X of N" with a filled bar, and one tappable button per step showing whether it is done,
 * in progress, not started or needs changes. Any step can be opened at any time.
 */
export function StepBar({
  steps,
  current,
  onSelect,
}: {
  steps: { key: string; label: string; state: StepState }[];
  current: number;
  onSelect: (index: number) => void;
}) {
  const n = steps.length;
  const pct = Math.round(((current + 1) / n) * 100);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">
          Step {current + 1} of {n}
        </span>
        <span className="text-muted-foreground">{steps[current]?.label}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={current + 1}
        aria-valuemin={1}
        aria-valuemax={n}
        aria-label="Verification steps"
      >
        <div className="h-full bg-brand transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1.5">
        {steps.map((s, i) => (
          <li key={s.key} className="min-w-0">
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={i === current ? 'step' : undefined}
              className={cn(
                'flex min-h-[44px] w-full flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] font-semibold leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:flex-row sm:gap-2 sm:text-xs',
                i === current ? 'border-brand bg-brand/5 text-ink' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
              )}
            >
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[10px]', DOT[s.state])}>
                {s.state === 'done' ? <Check className="size-3" aria-hidden /> : s.state === 'needs_changes' ? <AlertCircle className="size-3" aria-hidden /> : i + 1}
              </span>
              <span className="truncate">{s.label}</span>
              <span className="sr-only">{PILL[s.state].label}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The status pill from the checklist, with the four step states. */
export function StatePill({ state }: { state: StepState }) {
  const p = PILL[state];
  return <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0', p.cls)}>{p.label}</span>;
}

/**
 * With a title this is the checklist's section card (header with a tick, title,
 * description and pill, then the body). Without one it is a plain card for a message.
 * `collapsed` shows only the header; with `onOpen` the header is a button.
 */
export function Card({
  children,
  className = '',
  title,
  subtitle,
  state,
  collapsed = false,
  onOpen,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  state?: StepState;
  collapsed?: boolean;
  onOpen?: () => void;
}) {
  if (!title) {
    return <div className={cn('rounded-2xl border border-border bg-card p-5 text-ink', className)}>{children}</div>;
  }

  const done = state === 'done';
  const needs = state === 'needs_changes';
  const head = (
    <>
      <span
        className={cn(
          'size-7 rounded-full grid place-items-center shrink-0',
          done ? 'bg-brand text-white' : needs ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'
        )}
      >
        {done ? <Check className="size-4" aria-hidden /> : needs ? <AlertCircle className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
      </span>
      <span className="flex-1 text-left">
        <span className="block font-semibold text-ink">{title}</span>
        {subtitle && <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {state && <StatePill state={state} />}
    </>
  );

  return (
    <section className={cn('rounded-2xl border border-border bg-card', className)}>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            'flex w-full min-h-[44px] items-start gap-3 px-5 py-4 text-left hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-2xl',
            !collapsed && 'border-b border-border rounded-b-none'
          )}
        >
          {head}
        </button>
      ) : (
        <header className={cn('flex items-start gap-3 px-5 py-4', !collapsed && 'border-b border-border')}>{head}</header>
      )}
      {!collapsed && <div className="p-5">{children}</div>}
    </section>
  );
}

/** "N of M complete" with the bar, as at the top of the checklist. */
export function ProgressCard({ completed, total, hint }: { completed: number; total: number; hint?: string }) {
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">
          {completed} of {total} complete
        </span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <div
        className="mt-2 h-2 bg-muted rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Verification progress"
      >
        <div className="h-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The checklist's amber notice. */
export function Notice({ children, className = '', role }: { children: ReactNode; className?: string; role?: 'status' | 'alert' }) {
  return (
    <div role={role} className={cn('rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800', className)}>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  const { busy, children, className = '', disabled, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {busy ? 'Please wait…' : children}
    </button>
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-ink transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    />
  );
}

/** Form field classes copied from the checklist's inputs. */
export const inputClass =
  'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50';

/** Shown when the automatic check cannot continue. There is no manual identity review. */
export function SupportNote({ reason }: { reason: string }) {
  return (
    <Notice>
      <p className="font-semibold">{reason}</p>
      <p className="mt-1">
        Please contact us at{' '}
        <a className="underline" href={`mailto:${SUPPORT_EMAIL}?subject=Teacher%20identity%20check`}>
          {SUPPORT_EMAIL}
        </a>{' '}
        and we will help.
      </p>
    </Notice>
  );
}

/** Reads an API error body without throwing on non-JSON. */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}
