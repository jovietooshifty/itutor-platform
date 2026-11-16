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
    <div className="pb-4 border-b border-border">
      <div className={cn('text-base font-bold', tone === 'danger' ? 'text-rose-700' : 'text-ink')}>{title}</div>
      {desc && <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>}
    </div>
  );
}

export function Toggle({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 rounded-xl border border-border p-4', disabled && 'opacity-70')}>
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <button
        type="button"
        disabled={disabled}
        title={disabled ? hint : undefined}
        onClick={() => !disabled && onChange(!value)}
        className={cn('w-11 h-6 rounded-full p-0.5 transition shrink-0', value ? 'bg-brand' : 'bg-muted', disabled && 'cursor-not-allowed')}>
        <span className={cn('block size-5 rounded-full bg-white shadow transition', value && 'translate-x-5')} />
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
  const cls = { rose: 'border-rose-200 bg-rose-50 text-rose-900', amber: 'border-amber-200 bg-amber-50 text-amber-900' }[tone];
  return (
    <div className={cn('rounded-xl border px-4 py-3 flex items-start gap-3', cls)}>
      <Icon className="size-4 mt-0.5" />
      <div><div className="font-semibold text-sm">{title}</div><div className="text-xs opacity-90">{body}</div></div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-card/50 p-10 text-center">
      <div className="mx-auto size-12 rounded-full bg-muted grid place-items-center text-muted-foreground"><Icon className="size-5" /></div>
      <div className="mt-3 font-semibold text-ink">{title}</div>
      <div className="text-sm text-muted-foreground">{body}</div>
    </div>
  );
}

export function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-border last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-ink font-semibold">{value}</span>
    </div>
  );
}

export function SettCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <h3 className="font-bold text-ink">{title}</h3>
      {children}
    </div>
  );
}

export function SetField({ label, hint, infoTitle, infoBlurb, children }: { label: string; hint?: string; infoTitle?: string; infoBlurb?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink inline-flex items-center gap-1.5 mb-1">
        {label}
        {infoTitle && infoBlurb && <InfoPop title={infoTitle} blurb={infoBlurb} />}
      </div>
      {hint && <div className="text-xs text-muted-foreground mb-2">{hint}</div>}
      {children}
    </div>
  );
}

export function InfoPop({ title, blurb }: { title: string; blurb: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        className="size-4 grid place-items-center rounded-full text-muted-foreground hover:text-brand-deep"
        aria-label={`About ${title}`}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span className="absolute z-20 left-1/2 -translate-x-1/2 top-6 w-56 rounded-lg border border-border bg-background shadow-pop p-3 text-left">
          <span className="block text-[11px] font-bold uppercase tracking-wider text-ink">{title}</span>
          <span className="block text-xs text-muted-foreground mt-1 font-normal normal-case">{blurb}</span>
        </span>
      )}
    </span>
  );
}

export function MenuBtn({ icon: Icon, label, onClick, destructive }: { icon: any; label: string; onClick: () => void; destructive?: boolean }) {
  return (
    <button onClick={onClick} className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-muted', destructive && 'text-rose-600 hover:bg-rose-50')}>
      <Icon className="size-4" /> {label}
    </button>
  );
}

export function MomCard({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className={cn('mt-2 text-2xl font-bold flex items-center gap-1', positive ? 'text-emerald-700' : 'text-rose-700')}>
        {value}
        {positive ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
      </div>
    </div>
  );
}

// For absolute figures. Deliberately has no arrow — a count is not a trend,
// and MomCard's arrow made "3 members" read as "up".
export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">{label}</div>
      <div className="mt-2 text-2xl font-bold text-ink">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function ChartCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-ink">{title}</h3>
        <span className="text-[11px] text-muted-foreground">{caption}</span>
      </div>
      <div className="mt-6 h-40 flex items-end gap-3">{children}</div>
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

