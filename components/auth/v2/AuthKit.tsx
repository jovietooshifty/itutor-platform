'use client';

/**
 * The pieces every new-UI auth screen is built from, drawn once from the
 * Figma "Sign up and Log in" set (student file rwytRx6xmRHf4AMzpxAznd,
 * frames LG01–LG04, RO01, PO06, TO04 — node ids 64:*).
 *
 * These screens sit OUTSIDE every app shell (nobody is signed in), so
 * AuthFrame supplies `.ds-root` itself; without it the design tokens fall back
 * to the legacy palette.
 *
 * ROLE COLOURS. The set gives each account type a colour from the role picker
 * on: student = brand green, parent = navy #0f2e47, teacher = gold #f5a524.
 * Navy and gold are not design-system tokens yet, so they live here as
 * literals, in one place.
 *
 * WIDE SCREENS ARE PROVISIONAL: the set is drawn at 390px only. From md up the
 * same column is centred at 440px; there is no frame to check that against.
 */

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { EyeSlash, WarningCircle } from '@phosphor-icons/react';
import '@/components/ui/ds-tokens.css';
import { DS_ROOT_CLASS } from '@/components/ui';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export type AuthRole = 'student' | 'parent' | 'tutor';

/** Fill, text and lip for each account type's button (LG01 64:7020). */
const TONES = {
  ink: 'bg-ink border-ink text-on-ink shadow-[0_4px_0_#05110b] active:shadow-[0_2px_0_#05110b]',
  outline: 'bg-surface-card border-ink text-ink shadow-[0_4px_0_rgb(var(--ds-ink))] active:shadow-[0_2px_0_rgb(var(--ds-ink))]',
  student: 'bg-brand border-ink text-ink shadow-[0_3px_0_rgb(var(--ds-ink))] active:shadow-[0_1px_0_rgb(var(--ds-ink))]',
  parent: 'bg-[#0f2e47] border-ink text-on-ink shadow-[0_3px_0_#05111c] active:shadow-[0_1px_0_#05111c]',
  tutor: 'bg-[#f5a524] border-ink text-ink shadow-[0_3px_0_rgb(var(--ds-ink))] active:shadow-[0_1px_0_rgb(var(--ds-ink))]',
} as const;
export type AuthTone = keyof typeof TONES;

/** The tag colours from the role picker (RO01 64:6876). */
export const ROLE_TAG: Record<AuthRole, string> = {
  student: 'bg-brand text-ink',
  parent: 'bg-[#0f2e47] text-on-ink',
  tutor: 'bg-[#f5a524] text-ink',
};
export const ROLE_PANEL: Record<AuthRole, string> = {
  student: 'bg-brand',
  parent: 'bg-[#0f2e47]',
  tutor: 'bg-[#f5a524]',
};

export function AuthFrame({
  children,
  tone = 'page',
}: {
  children: ReactNode;
  /** 'brand' paints the whole screen green, as the role picker does. */
  tone?: 'page' | 'brand';
}) {
  return (
    <div
      className={cn(
        DS_ROOT_CLASS,
        'min-h-[100dvh] font-body text-ink',
        tone === 'brand' ? 'bg-brand' : 'bg-surface-page'
      )}
    >
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[440px] flex-col md:pt-8">{children}</div>
    </div>
  );
}

/** The 60px top row with the 44px back button (header.qtop). */
export function AuthTopBar({
  backHref,
  onBack,
  noBack,
  right,
}: {
  backHref?: string;
  onBack?: () => void;
  /** After the account exists there is nowhere sensible to go back to. */
  noBack?: boolean;
  right?: ReactNode;
}) {
  const icon = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/auth/back.svg" alt="" width={22} height={22} className="block h-[22px] w-[22px]" />
  );
  const cls =
    'grid h-11 w-11 shrink-0 place-items-center rounded-full focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-ink';
  return (
    <div className="flex h-[60px] shrink-0 items-center gap-ds-2 pl-1 pr-4">
      {noBack ? (
        <span className="h-11 w-11 shrink-0" aria-hidden />
      ) : onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" className={cls}>
          {icon}
        </button>
      ) : (
        <Link href={backHref ?? '/'} aria-label="Back" className={cls}>
          {icon}
        </Link>
      )}
      {right}
    </div>
  );
}

/** The column under the top bar: 20px sides, 14px between items. */
export function AuthMain({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn('flex flex-1 flex-col gap-[14px] px-5 pb-6 pt-1', className)}>{children}</main>;
}

export function Wordmark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/auth/wordmark.png" alt="iTutor" width={120} height={29} className="block h-[29px] w-[120px]" />
  );
}

export function AuthTitle({ children, size = 30 }: { children: ReactNode; size?: 30 | 34 }) {
  return (
    <h1
      className={cn(
        'font-display font-extrabold text-ink',
        size === 34 ? 'text-[34px] leading-[1.04] tracking-[-0.34px]' : 'text-[30px] leading-[1.1] tracking-[-0.3px]'
      )}
    >
      {children}
    </h1>
  );
}

export function AuthLead({ children }: { children: ReactNode }) {
  return <p className="-mt-1 text-[16px] leading-[1.35] text-ink-muted">{children}</p>;
}

const BTN =
  'inline-flex h-14 w-full items-center justify-center gap-[10px] rounded-[10px] bw-bold px-5 mb-1 ' +
  'font-body text-[17px] font-extrabold leading-none ' +
  'transition-[transform,box-shadow] duration-[90ms] ease-[cubic-bezier(.23,1,.32,1)] active:translate-y-[2px] ' +
  '[-webkit-tap-highlight-color:transparent] focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink ' +
  'disabled:cursor-not-allowed disabled:active:translate-y-0';

/** The stamped 56px button of this set (a.obtn). Renders a Link when given href. */
export function AuthButton({
  tone = 'ink',
  href,
  type = 'button',
  onClick,
  disabled,
  busy,
  waiting,
  className,
  children,
}: {
  tone?: AuthTone;
  href?: string;
  type?: 'button' | 'submit';
  onClick?: () => void;
  disabled?: boolean;
  /** Shows a spinner and blocks presses, without the disabled fade. */
  busy?: boolean;
  /**
   * A countdown button ("Resend in 0:45") is drawn at full colour in the
   * frames (LG04): it is waiting, not unavailable. Everything else fades.
   */
  waiting?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const cls = cn(BTN, TONES[tone], !waiting && 'disabled:opacity-45', className);
  const body = busy ? <Spinner /> : children;
  if (href) {
    return (
      <Link href={href} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-busy={busy || undefined} className={cn(cls, busy && 'pointer-events-none')}>
      {body}
    </button>
  );
}

export function Spinner() {
  return <span aria-label="Working" className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator">
      <span className="h-[1.5px] flex-1 bg-border" />
      <span className="text-[13px] font-extrabold text-ink-muted">OR</span>
      <span className="h-[1.5px] flex-1 bg-border" />
    </div>
  );
}

/** Label above, optional link at the right of the label row, hint or error below. */
export function AuthField({
  label,
  htmlFor,
  aside,
  hint,
  error,
  ok,
  children,
}: {
  label: string;
  htmlFor?: string;
  aside?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** A positive check under the field, e.g. "Strong password". */
  ok?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[6px]">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[15px] font-extrabold text-ink">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <p className="text-[14px] font-bold text-danger">{error}</p>
      ) : ok ? (
        <p className="flex items-center gap-1.5 text-[14px] font-extrabold text-brand-edge">
          <CheckMark /> {ok}
        </p>
      ) : hint ? (
        <p className="text-[14px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="shrink-0">
      <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const INPUT =
  'h-[50px] w-full min-w-0 rounded-[8px] bw-hair border-border-strong bg-surface-card px-[14px] ' +
  'text-[16px] text-ink placeholder:text-[#6b7a70] outline-none ' +
  'focus:border-brand-edge focus:shadow-[0_0_0_1px_#0f6e3f] disabled:opacity-60';

export function AuthInput({
  invalid,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={cn(INPUT, invalid && 'border-danger shadow-[0_0_0_1px_#c2362f]', className)}
    />
  );
}

export function AuthSelect({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cn(INPUT, 'appearance-none bg-[length:12px] pr-10', className)} style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='%230d2318' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 16px center',
    }}>
      {children}
    </select>
  );
}

/** Password with the eye toggle inside the field (LG01 64:7007). */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder = 'Your password',
  invalid,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <AuthInput
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        invalid={invalid}
        disabled={disabled}
        className="pr-12"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-ink"
      >
        {show ? (
          <EyeSlash size={20} weight="bold" aria-hidden />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/auth/eye.svg" alt="" width={20} height={20} className="block h-5 w-5" />
        )}
      </button>
    </div>
  );
}

/** The red notice at the top of a form (LG02 64:7075). */
export function AuthAlert({ children, tone = 'danger' }: { children: ReactNode; tone?: 'danger' | 'info' }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-ds-2 rounded-[8px] bw-bold px-[14px] py-[12px] text-[15px] leading-[1.4]',
        tone === 'danger' ? 'border-danger bg-danger-soft text-[#7a1f1a]' : 'border-brand-edge bg-[#e6f7ec] text-ink'
      )}
    >
      {tone === 'danger' && <WarningCircle size={18} weight="bold" className="mt-[2px] shrink-0" aria-hidden />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Underlined bold link, 44px tall for the thumb (a.ulink). */
export function ULink({ href, onClick, children, className }: { href?: string; onClick?: () => void; children: ReactNode; className?: string }) {
  const cls = cn(
    'inline-flex min-h-[44px] items-center justify-center text-[16px] font-extrabold text-ink underline underline-offset-2',
    className
  );
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** "By continuing you agree to the Terms of Service and Privacy Policy." */
export function LegalLine({ role }: { role: AuthRole }) {
  const terms = role === 'tutor' ? '/terms/tutor' : role === 'parent' ? '/terms/parent' : '/terms/student';
  return (
    <p className="text-center text-[13px] leading-[1.4] text-ink-muted">
      By continuing you agree to the{' '}
      <a href={terms} target="_blank" rel="noreferrer" className="text-brand-edge underline">
        Terms of Service
      </a>{' '}
      and{' '}
      <a href="/privacy" target="_blank" rel="noreferrer" className="text-brand-edge underline">
        Privacy Policy
      </a>
      .
    </p>
  );
}

/**
 * Google sign-in. Same call as the old pages: the callback decides where to
 * land, and `redirect` rides along so a deep link survives the round trip.
 */
export function GoogleButton({ redirect, label = 'Continue with Google' }: { redirect: string | null; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) {
      setErr('Could not reach Google. Try again.');
      setBusy(false);
    }
  };
  return (
    <div>
      <AuthButton tone="outline" onClick={go} busy={busy}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/auth/google.svg" alt="" width={20} height={20} className="block h-5 w-5" />
        {label}
      </AuthButton>
      {err && <p className="mt-1 text-center text-[14px] font-bold text-danger">{err}</p>}
    </div>
  );
}
