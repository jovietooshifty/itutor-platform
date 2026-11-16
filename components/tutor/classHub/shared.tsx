'use client';

// Class hub: shared. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
// tab can be redrawn in the new UI on its own. Behaviour unchanged by the move.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Users, UserPlus, Copy, Check, Star, MapPin,
  Bell, X, Plus, ExternalLink, Trash2, Globe, Eye,
  Banknote, ListChecks, Video, MoreVertical, Pin, Sparkles, Link as LinkIcon, Paperclip, UploadCloud, AlertTriangle, ShieldAlert,
  Mail, MessageSquare, DollarSign, BarChart3, ArrowUp, ArrowDown, Lock,
  Calendar as CalendarIcon, BookOpen, Ban, Clock, Info, ArrowUpRight, ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { UnsavedBar } from '@/components/UnsavedBar';
import { supabase } from '@/lib/supabase/client';
import { fmtTTD } from '@/lib/utils/formatCurrency';
import { formatLevel, LEVEL_LABELS } from '@/lib/utils/formatLevel';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import { uploadStreamAttachment } from '@/lib/utils/streamAttachments';
import PaymentHistoryPanel from '@/components/students/PaymentHistoryPanel';
import { generateHistoryForMember, getPaymentStatus, getMembershipStatus, MEMBERSHIP_META, type MemberBilling } from '@/lib/utils/paymentCycles';
import {
  BANNER_ACCEPT,
  BANNER_MAX_BYTES,
  BANNER_MIN_H,
  BANNER_MIN_W,
  BANNER_W,
  BANNER_H,
  bannerToBlob,
  loadBitmap,
  renderBanner,
} from '@/lib/utils/bannerCanvas';
import { type ScheduleEntry } from '@/lib/utils/scheduleFormat';
import { preorderReasonMessage, type PreorderIneligibility } from '@/lib/payments/secureSpot';
import ClassPausePanel from '@/components/tutor/ClassPausePanel';
import ScheduleSessionsModal, { type CreatedOccurrence } from '@/components/tutor/classes/ScheduleSessionsModal';
import { ClassLinkPanel, LinkRotationBanner, providerLabel, useVideoConnection } from '@/components/tutor/classes/ClassLinkChoice';
import type { MeetingLinkMode } from '@/lib/types/groups';
import { formatOffersSeat, seatTypesFor, type ClassFormat } from '@/lib/utils/seatCapacity';
import InPersonSection, { type InPersonDraft } from '@/components/tutor/classes/InPersonSection';
import { usePhysicalClasses } from '@/lib/hooks/usePhysicalClasses';
import PaymentsGrid from '@/components/tutor/classes/PaymentsGrid';

export type DbSubject = { id: string; name: string; label: string; curriculum: string };

export const LEVEL_OPTIONS = Object.entries(LEVEL_LABELS).map(([value, label]) => ({ value, label }));

export type Tab = 'stream' | 'sessions' | 'roster' | 'payments' | 'settings' | 'analytics';

export type Subscriber = {
  id: string;
  student_id: string;
  status: string;
  payment_status: string;
  plan_price_ttd: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_payment_due_at: string | null;
  last_paid_at: string | null;
  cancel_at_period_end: boolean;
  cancelled_at: string | null;
  grace_period_ends_at: string | null;
  secured_at?: string | null;
  release_date?: string | null;
  /** Migration 242. Absent when the roster fell back to the base select. */
  seat_type?: 'online' | 'physical' | null;
  billing_provider?: string | null;
  /** Present only for SECURED enrolments — a held spot, not a live subscription. */
  secured?: { releaseDate: string | null; heldTtd: number; free: boolean; shortClass: boolean } | null;
  student: { id: string; full_name: string | null; avatar_url: string | null; email: string | null } | null;
};

export type GroupMember = {
  id: string;
  studentId: string;
  name: string;
  // 'secured' = paid up front and held by iTutor until the first month is
  // taught. Distinct from 'paid' on purpose: the money exists but the tutor
  // has not been paid it yet, and the roster must not imply otherwise.
  paymentStatus: 'paid' | 'pending' | 'overdue' | 'secured';
  status: 'active' | 'approved' | 'invited' | 'pending' | 'suspended' | 'banned' | 'removed';
  joinedAt: string | null;
  outstandingTtd?: number;
  /** What they bought. Everything before 242 was online. */
  seatType: 'online' | 'physical';
  /** How they pay. 'cash' means the tutor collects it and records it. */
  paymentMethod: 'card' | 'cash';
  email?: string | null;
  subscription?: Subscriber | null;
};

export type StreamPost = {
  id: string;
  kind: 'announcement' | 'attachment' | 'link';
  title: string;
  body: string;
  at: string;
  pinned?: boolean;
  pendingApproval?: boolean;
  attachmentName?: string;
  attachmentUrl?: string;
  linkUrl?: string;
};

export type GroupSession = {
  id: string;
  date: string;
  durationMin: number;
  status: 'upcoming' | 'past';
  attendanceStatus?: string;
  paymentStatus?: string;
  /** Per-session relocation (242). NULL means the class venue. */
  venueId?: string | null;
};


// Link posts have no dedicated link_url column — the composer writes the raw
// URL as its own line in message_body, so detect a line that IS a bare URL.
export const URL_LINE_RE = /^https?:\/\/\S+$/;

// The seat-type rules live in one place. seatCapacity.ts holds the one that
// matters — a class is not full until every seat type it offers is full — and
// this page is one of the two callers it was written for.

export type GroupDetail = {
  id: string;
  title: string;
  subject: string;
  level: string;
  description: string;
  capacity: number;
  enrolled: number;
  // ── In person (migration 242) ──
  // `capacity` above stays the class TOTAL — a trigger keeps groups.max_students
  // as the sum of the seat caps the format offers, so it is derived, not a
  // third number to reconcile (see classCapacity below). These are the per-seat
  // caps that actually gate enrolment.
  classFormat: ClassFormat;
  venueId: string | null;
  venueVisibility: 'public' | 'after_enrolment';
  maxStudentsOnline: number | null;
  maxStudentsPhysical: number | null;
  priceOnlineTtd: number | null;
  pricePhysicalTtd: number | null;
  acceptsCash: boolean;
  pricePerSession: number | null;
  memberServiceFee: number;
  billingModel: 'per-session' | 'per-month' | 'prepaid';
  status: string;
  visibility: 'public' | 'private';
  isPublic: boolean;
  requireJoinRequests: boolean;
  secureSpotEnabled: boolean;
  autoSuspendMissedPayment: boolean;
  gracePeriodDays: number;
  primaryChannel: 'native' | 'whatsapp' | 'classroom';
  googleClassroomLink: string;
  feedbackMode: 'off' | 'included_free' | 'paid_addon';
  parentFeedbackPrice: number;
  thumbnailGradient?: string;
  recurrenceRule?: string;
  videoProvider?: string;
  earningsTtd?: number;
  totalSessionsRun?: number;
  rating?: number | null;
  reviewCount?: number;
  whatsappLink?: string;
  /** groups.tutor_id — the class's owner, which is not the viewer in admin mode. */
  tutorId: string | null;
  /** groups.end_date as 'YYYY-MM-DD'. Sessions can't be scheduled past it. */
  endDate: string | null;
  // ── Class link (migration 262) ──
  // One link per class. 'generated' = minted by POST /meeting-link on the first
  // Join; 'custom' = the tutor's own room, opened as-is by every Join button.
  // Always set (never undefined) — Settings compares JSON snapshots of this
  // object, and a key that comes and goes would flag unsaved changes.
  meetingLink: string;
  meetingLinkMode: MeetingLinkMode;
  meetingLinkGeneratedAt: string | null;
  /** False when the row has no meeting_link_mode column: the own-link option is hidden. */
  linkModeAvailable: boolean;
  /** groups.meeting_link_set_at (migration 263): when the own link was saved. Drives the rotation banner. */
  meetingLinkSetAt: string | null;
  /**
   * False when the row has no meeting_link_set_at column. The banner is then
   * hidden: every link would read as unknown age, i.e. due, for good.
   */
  linkSetAtAvailable: boolean;
  coverImage?: string;
  scheduleDisplay?: string;
  scheduleData?: ScheduleEntry[];
  activePromotion?: { id: string; kind: string; discount: number; student_cap: number | null; duration_days: number | null } | null;
};

/**
 * The class total, worked out the way sync_group_max_students (migration 263)
 * stores it in groups.max_students: the sum of the caps for the seat types
 * this format offers (a blank cap adds nothing), or — when none of those is
 * set — the plain student limit, which the trigger then leaves alone.
 *
 * Computed here rather than read back because the stored number has been
 * wrong: before 263 the trigger summed a cap the format doesn't offer, so an
 * online class capped at 12 with a leftover in-person 12 read "0/24". Deriving
 * it keeps the header, the Capacity tab and the Class type tab on one number
 * — on load, while editing, and straight after a save — whatever the row says.
 */
export function classCapacity(
  format: ClassFormat,
  online: number | null,
  physical: number | null,
  studentLimit: number,
): number {
  const caps = seatTypesFor(format).map((s) => (s === 'online' ? online : physical));
  if (caps.every((c) => c == null)) return studentLimit;
  return Math.max(1, caps.reduce<number>((sum, c) => sum + (c ?? 0), 0));
}


export function SettingsHead({ title, desc, tone }: { title: string; desc?: string; tone?: 'danger' }) {
  return (
    <div className="flex flex-col gap-[2px] bw-b-hair border-line-soft pb-ds-3">
      <h3 className={cn('m-0 font-display text-[20px] font-extrabold leading-tight', tone === 'danger' ? 'text-danger' : 'text-ink')}>{title}</h3>
      {desc && <p className="m-0 text-[14px] text-ink-muted">{desc}</p>}
    </div>
  );
}

export function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-ds-4 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card', disabled && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-extrabold text-ink">{label}</div>
        {hint && <div className="mt-[2px] text-[13px] leading-[18px] text-ink-muted">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
        title={disabled ? hint : undefined}
        onClick={() => !disabled && onChange(!value)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-ds-full bw-bold border-ink p-[2px] transition-colors',
          value ? 'bg-brand' : 'bg-surface-sunken',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        <span className={cn('block size-5 rounded-full bw-hair border-ink bg-surface-card transition-transform', value && 'translate-x-5')} />
      </button>
    </div>
  );
}

/* ----------- Analytics ----------- */
// Real figures only. Enrollment is derived from each member's own joinedAt;
// money comes from the group's actual totals. There is deliberately no
// revenue-by-month chart: the client has a collected TOTAL but no per-month
// payment history, and a tutor's earnings are the last thing to guess at.
export function Banner({ tone, icon: Icon, title, body }: { tone: 'rose' | 'amber'; icon: any; title: string; body: string }) {
  return (
    <div
      role={tone === 'rose' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-ds-3 rounded-ds-card bw-hair p-ds-card',
        tone === 'rose' ? 'border-danger/40 bg-danger/10' : 'border-accent-yellow bg-accent-yellow/20'
      )}
    >
      <Icon className={cn('mt-[2px] size-5 shrink-0', tone === 'rose' ? 'text-danger' : 'text-ink')} />
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold text-ink">{title}</div>
        <div className="text-[14px] leading-5 text-ink-muted">{body}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-ds-2 rounded-ds-card bw-hair bw-dashed border-border bg-surface-card px-ds-4 py-ds-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-sunken text-ink"><Icon className="size-5" /></span>
      <div className="font-display text-[17px] font-extrabold text-ink">{title}</div>
      <div className="max-w-[420px] text-[14px] leading-5 text-ink-muted">{body}</div>
    </div>
  );
}

export function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">{title}</div>
      <div className="mt-ds-2">{children}</div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-ds-3 bw-b-hair border-line-soft py-ds-2 text-[14px] last:border-b-0">
      <span className="text-ink-muted">{label}</span>
      <span className="text-right font-extrabold text-ink [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

export function SettCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <h3 className="m-0 font-display text-[17px] font-extrabold text-ink">{title}</h3>
      {children}
    </div>
  );
}

export function SetField({ label, hint, infoTitle, infoBlurb, children }: { label: string; hint?: string; infoTitle?: string; infoBlurb?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-ds-1">
      <div className="inline-flex items-center gap-[6px] text-[12px] font-extrabold uppercase tracking-[0.05em] text-ink-muted">
        {label}
        {infoTitle && infoBlurb && <InfoPop title={infoTitle} blurb={infoBlurb} />}
      </div>
      {hint && <div className="text-[13px] leading-[18px] text-ink-muted">{hint}</div>}
      {children}
    </div>
  );
}

export function InfoPop({ title, blurb }: { title: string; blurb: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex normal-case tracking-normal">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="grid size-5 place-items-center rounded-full text-ink-muted hover:text-ink"
        aria-label={`About ${title}`}
      >
        <Info className="size-4" />
      </button>
      {open && (
        <span className="absolute left-1/2 top-7 z-20 w-60 -translate-x-1/2 rounded-ds-card bw-bold border-ink bg-surface-card p-ds-3 text-left shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
          <span className="block text-[13px] font-extrabold text-ink">{title}</span>
          <span className="mt-[2px] block text-[13px] font-normal leading-[18px] text-ink-muted">{blurb}</span>
        </span>
      )}
    </span>
  );
}

export function MenuBtn({ icon: Icon, label, onClick, destructive }: { icon: any; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-ds-2 rounded-ds-sm px-ds-3 py-ds-2 text-left font-body text-[14px] font-extrabold',
        destructive ? 'text-danger hover:bg-danger/10' : 'text-ink hover:bg-surface-sunken'
      )}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}

export function MomCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">{label}</div>
      <div className={cn('mt-ds-1 flex items-center gap-ds-1 font-display text-[26px] font-extrabold tabular-nums', positive ? 'text-brand-edge' : 'text-danger')}>
        {value}
        {positive ? <ArrowUp className="size-5" /> : <ArrowDown className="size-5" />}
      </div>
    </div>
  );
}

// For absolute figures. Deliberately has no arrow — a count is not a trend,
// and MomCard's arrow made "3 members" read as "up".
export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">{label}</div>
      <div className="mt-ds-1 font-display text-[26px] font-extrabold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-[2px] text-[13px] text-ink-muted">{hint}</div>}
    </div>
  );
}

export function ChartCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
      <div className="flex items-baseline justify-between gap-ds-3">
        <h3 className="m-0 font-display text-[17px] font-extrabold text-ink">{title}</h3>
        <span className="text-[12px] font-bold text-ink-muted">{caption}</span>
      </div>
      <div className="mt-ds-5 flex h-40 items-end gap-ds-3">{children}</div>
    </div>
  );
}

export function formatRelative(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.round(diff / 86400000)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}


/* ----------- Design-system strings for the hub tabs (new UI, 2026-11-16) ----------- */

/** A card: hairline border, card radius, card padding. */
export const DS_CARD = 'rounded-ds-card bw-hair border-border bg-surface-card p-ds-card';
/** Text input / textarea / select. */
export const DS_INPUT =
  'w-full rounded-ds-btn bw-hair border-ink bg-surface-card px-ds-3 py-[10px] font-body text-[15px] text-ink placeholder:text-ink-muted focus:[outline-style:solid] focus:outline-2 focus:outline-ink disabled:opacity-60';
/** Uppercase section label. */
export const DS_LABEL = 'text-[12px] font-extrabold uppercase tracking-[0.06em] text-ink-muted';
/** Pill filter / segmented chip; add DS_PILL_ON when selected. */
export const DS_PILL =
  'ds-press inline-flex items-center gap-[6px] rounded-full bw-hair px-ds-3 py-[6px] font-body text-[13px] font-extrabold cursor-pointer border-border bg-surface-card text-ink';
export const DS_PILL_ON = '!border-ink !bg-ink !text-on-ink';

/**
 * Share a link through the device's share sheet (WhatsApp, Messages, …) where
 * the browser has one, else copy it. Owner/itutor-63, 2026-11-16: Invite by
 * link must open the share menu. Resolves to what happened; a dismissed
 * share sheet ('cancelled') is not an error.
 */
export async function shareOrCopy(data: { title?: string; text?: string; url: string }): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const nav: any = typeof navigator !== 'undefined' ? navigator : null;
  if (nav?.share) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'cancelled';
      // Fall through to the clipboard (some desktop browsers refuse share()).
    }
  }
  try {
    // The link must always be in what is copied, message or not.
    const copy = data.text ? (data.text.includes(data.url) ? data.text : `${data.text} ${data.url}`) : data.url;
    await nav?.clipboard?.writeText(copy);
    return 'copied';
  } catch {
    return 'failed';
  }
}
