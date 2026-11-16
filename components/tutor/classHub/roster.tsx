'use client';

// Class hub: roster. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
// tab can be redrawn in the new UI on its own. Behaviour unchanged by the move.
// Redrawn in the design system 2026-11-16; the one behaviour change is that
// Invite by link opens the device's share sheet (shareOrCopy).

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, Users, UserPlus, Copy, Check, Star, MapPin,
  Bell, X, Plus, ExternalLink, Trash2, Globe, Eye,
  Banknote, ListChecks, Video, MoreVertical, Pin, Sparkles, Link as LinkIcon, Paperclip, UploadCloud, AlertTriangle, ShieldAlert,
  Mail, MessageSquare, DollarSign, BarChart3, ArrowUp, ArrowDown, Lock,
  Calendar as CalendarIcon, BookOpen, Ban, Clock, Info, ArrowUpRight, ChevronRight,
  RefreshCw, Share2,
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
import { Button, Tag } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';
import { DbSubject, LEVEL_OPTIONS, Tab, Subscriber, GroupMember, StreamPost, GroupSession, URL_LINE_RE, GroupDetail, classCapacity, SettingsHead, Toggle, Banner, EmptyState, SideCard, InfoRow, SettCard, SetField, InfoPop, MenuBtn, MomCard, StatCard, ChartCard, formatRelative, DS_CARD, DS_INPUT, DS_LABEL, shareOrCopy } from './shared';
import { StreamTab, ComposerKind, COMPOSER_THEME, COMPOSER_MAX_MB, ClassPostComposer, StreamCard } from './stream';
import { NO_CLASS_LINK_MESSAGE, SessionRow, SessionsTab } from './sessions';
import { SETTINGS_SECTIONS, SettingsSectionId, SettingsTab, ClassBannerUpload, ClassPreviewCard } from './settings';
import { AnalyticsTab } from './analytics';

type TagTone = 'outline' | 'brand' | 'dark' | 'warning' | 'danger' | 'orange';

export const SUB_STATUS_CFG: Record<string, { label: string; tone: TagTone }> = {
  ACTIVE:             { label: 'Active',      tone: 'brand' },
  GRACE:              { label: 'Grace',       tone: 'warning' },
  SUSPENDED:          { label: 'Suspended',   tone: 'danger' },
  CANCELLED:          { label: 'Cancelled',   tone: 'outline' },
  PENDING_PAYMENT:    { label: 'Pending',     tone: 'outline' },
  ACTIVATION_FAILED:  { label: 'Activating',  tone: 'outline' },
  WAITLISTED:         { label: 'Waitlisted',  tone: 'dark' },
};

export const fmtShortDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short' }) : '—';

const initials = (name: string) => name.split(' ').map((n) => n[0]).join('').slice(0, 2);

/** Round initials avatar. */
function Avatar({ name, tone = 'brand' }: { name: string; tone?: 'brand' | 'danger' }) {
  return (
    <div className={cn(
      'grid size-9 shrink-0 place-items-center rounded-full bw-hair font-body text-[12px] font-extrabold',
      tone === 'danger' ? 'border-danger bg-danger/10 text-danger' : 'border-ink bg-brand text-ink'
    )}>
      {initials(name)}
    </div>
  );
}

const TH = 'px-ds-3 py-ds-2 text-left text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-muted';
const TD = 'px-ds-3 py-ds-3 align-top';

export function RosterTab({ members, setMembers, group, isOneOnOne, atCapacity, onRefresh }: {
  members: GroupMember[]; setMembers: React.Dispatch<React.SetStateAction<GroupMember[]>>;
  group: GroupDetail; isOneOnOne: boolean; atCapacity: boolean; onRefresh?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [inviteOpen, setInviteOpen] = useState<null | 'link' | 'user'>(null);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteOk, setInviteOk] = useState('');
  // Outcome of the last share attempt: only 'copied' and 'failed' say anything.
  const [shareResult, setShareResult] = useState<null | 'copied' | 'failed'>(null);
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/classes/${group.id}` : '';

  // The Seat column earns its place only when the class can actually differ
  // by seat or by payment method.
  const showSeat = group.classFormat !== 'online' || group.acceptsCash;

  const updateMember = (sid: string, patch: Partial<GroupMember>) =>
    setMembers((ms) => ms.map((m) => m.studentId === sid ? { ...m, ...patch } : m));

  const copy = () => { navigator.clipboard?.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  // Invite by link opens the device's share sheet (WhatsApp, Messages, ...),
  // falling back to the clipboard where there is none. The link stays on screen
  // either way so it can be copied by hand.
  const shareLink = async () => {
    setInviteOpen('link');
    setShareResult(null);
    if (!inviteUrl) return;
    // No `text`: shareOrCopy's clipboard fallback copies `text` instead of the
    // url when one is given, and the tutor needs the link itself.
    const result = await shareOrCopy({ title: group.title || 'Join my class on iTutor', url: inviteUrl });
    if (result === 'copied' || result === 'failed') {
      setShareResult(result);
      if (result === 'copied') setTimeout(() => setShareResult((r) => (r === 'copied' ? null : r)), 2500);
    }
  };

  const sendInvite = async () => {
    if (!inviteQuery.trim() || inviteSending) return;
    setInviteSending(true); setInviteError(''); setInviteOk('');
    try {
      const res = await fetch(`/api/groups/${group.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteQuery.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`);
      const name = json.profile?.full_name ?? inviteQuery.trim();
      setInviteOk(`${name} added successfully!`);
      setInviteQuery('');
      // Add to local roster if not already present
      if (json.member?.user_id) {
        setMembers((ms) => {
          if (ms.find((m) => m.studentId === json.member.user_id)) return ms;
          const newMember: GroupMember = {
            id: json.member.id ?? json.member.user_id,
            studentId: json.member.user_id,
            name: json.profile?.full_name ?? inviteQuery.trim(),
            status: 'active',
            paymentStatus: 'pending',
            // An invited member has not chosen a seat yet — there is no
            // enrolment row to read one from. Where the class offers only one
            // kind that is the answer; where it offers both this is a
            // placeholder the next roster fetch replaces with their choice.
            seatType: group.classFormat === 'physical' ? 'physical' : 'online',
            paymentMethod: 'card',
            joinedAt: json.member.joined_at ?? new Date().toISOString(),
          };
          return [...ms, newMember];
        });
      }
    } catch (e: any) {
      setInviteError(e?.message ?? 'Failed to send invite');
    } finally {
      setInviteSending(false);
    }
  };
  const pending = members.filter((m) => m.status === 'pending');
  const visible = members.filter((m) => m.status !== 'removed' && m.status !== 'pending');
  const banned = members.filter((m) => m.status === 'banned');

  // Subscription summary (derived from the joined member data — no extra fetch)
  const withSub = visible.filter((m) => m.subscription);
  const activeSubs = withSub.filter((m) => ['ACTIVE', 'GRACE', 'SUSPENDED'].includes(m.subscription!.status)).length;
  const graceSubs = withSub.filter((m) => m.subscription!.status === 'GRACE').length;
  const billingSummary = withSub.length > 0
    ? ` · ${activeSubs} active${graceSubs > 0 ? ` · ${graceSubs} in grace period` : ''}`
    : '';

  return (
    <div className="flex min-w-0 flex-col gap-ds-4">
      {/* Pending join requests */}
      {pending.length > 0 && (
        <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-ink bg-accent-yellow/20 p-ds-card">
          <div className="flex items-start gap-ds-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-ds-sm bw-hair border-ink bg-accent-yellow text-ink">
              <Clock className="size-4" />
            </span>
            <div className="min-w-0">
              <h3 className="m-0 font-display text-[17px] font-extrabold text-ink">
                {pending.length} pending join request{pending.length !== 1 ? 's' : ''}
              </h3>
              <p className="m-0 text-[14px] text-ink-muted">Review and approve or decline each request.</p>
            </div>
          </div>
          <div className="flex flex-col gap-ds-2">
            {pending.map((m) => (
              <PendingRequestRow key={m.studentId} m={m} groupId={group.id}
                onApprove={() => updateMember(m.studentId, { status: 'approved' })}
                onDecline={() => updateMember(m.studentId, { status: 'removed' })} />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-end justify-between gap-ds-3">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[20px] font-extrabold text-ink">Students</h2>
          <p className="m-0 text-[14px] text-ink-muted">
            {isOneOnOne ? '1:1 — your recurring student.' : `${visible.length} of ${group.capacity} seats filled`}{billingSummary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-ds-2">
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="gap-[6px] px-ds-3">
              <RefreshCw className="size-4" /> Refresh
            </Button>
          )}
          {!isOneOnOne && (
            <>
              <Button variant="outline" size="sm" disabled={atCapacity} onClick={shareLink} className="gap-[6px] px-ds-3">
                <LinkIcon className="size-4" /> Invite by link
              </Button>
              <Button variant="dark" size="sm" disabled={atCapacity} onClick={() => setInviteOpen('user')} className="gap-[6px] px-ds-3">
                <UserPlus className="size-4" /> Invite by user
              </Button>
            </>
          )}
        </div>
      </div>

      {atCapacity && (
        <Banner tone="rose" icon={ShieldAlert} title="Class is at capacity"
          body="New invites are paused. Increase max class size in Settings or wait for a member to leave." />
      )}

      <SecuredSpotsSummary members={members} />

      {inviteOpen === 'link' && (
        <div className={cn(DS_CARD, 'flex flex-col gap-ds-3')}>
          <div className="flex items-start justify-between gap-ds-3">
            <div className="min-w-0">
              <h3 className="m-0 font-display text-[17px] font-extrabold text-ink">Invite link</h3>
              <p className="m-0 text-[14px] text-ink-muted">Send it on WhatsApp or any app, or copy it below.</p>
            </div>
            <button type="button" onClick={() => setInviteOpen(null)} aria-label="Close invite link"
              className="grid size-8 shrink-0 place-items-center rounded-ds-sm text-ink-muted hover:bg-surface-sunken hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-ds-2 rounded-ds-btn bg-surface-sunken px-ds-3 py-ds-2">
            <span className="min-w-0 flex-1 font-mono text-[13px] text-ink [overflow-wrap:anywhere] select-all">{inviteUrl}</span>
            <button type="button" onClick={copy}
              className="inline-flex shrink-0 items-center gap-1 text-[13px] font-extrabold text-ink hover:underline">
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-ds-3">
            <Button variant="dark" size="sm" disabled={atCapacity} onClick={shareLink} className="gap-[6px] px-ds-3">
              <Share2 className="size-4" /> Share link
            </Button>
            {shareResult === 'copied' && (
              <span role="status" className="inline-flex items-center gap-1 text-[14px] font-extrabold text-brand-edge">
                <Check className="size-4" /> Link copied
              </span>
            )}
            {shareResult === 'failed' && (
              <span role="alert" className="text-[14px] font-extrabold text-danger">
                Couldn&apos;t open the share menu or copy the link. Copy it from the box above.
              </span>
            )}
          </div>
        </div>
      )}

      {inviteOpen === 'user' && (
        <div className={cn(DS_CARD, 'flex flex-col gap-ds-3')}>
          <div className="flex items-start justify-between gap-ds-3">
            <h3 className="m-0 font-display text-[17px] font-extrabold text-ink">Invite by username or email</h3>
            <button type="button" onClick={() => setInviteOpen(null)} aria-label="Close invite by user"
              className="grid size-8 shrink-0 place-items-center rounded-ds-sm text-ink-muted hover:bg-surface-sunken hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
          <div className="flex flex-col gap-ds-2 sm:flex-row sm:items-center">
            <input
              value={inviteQuery}
              onChange={(e) => { setInviteQuery(e.target.value); setInviteError(''); setInviteOk(''); }}
              onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
              placeholder="e.g. student@example.tt"
              aria-label="Student username or email"
              className={cn(DS_INPUT, 'min-w-0 sm:flex-1')} />
            <Button variant="dark" size="md" onClick={sendInvite} disabled={inviteSending || !inviteQuery.trim()} className="shrink-0 gap-[6px] px-ds-4">
              <Mail className="size-4" /> {inviteSending ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
          {inviteError && <p role="alert" className="m-0 text-[14px] font-extrabold text-danger">{inviteError}</p>}
          {inviteOk && <p role="status" className="m-0 text-[14px] font-extrabold text-brand-edge">{inviteOk}</p>}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={Users} title="No members yet" body="Invite by link or by user to start filling this class." />
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-ds-card bw-hair border-border bg-surface-card">
          <table className="w-full min-w-[640px] font-body text-[14px]">
            <thead className="bg-surface-sunken">
              <tr>
                <th className={TH}>Member</th>
                <th className={TH}>Contact</th>
                <th className={TH}>Membership</th>
                {/* Only when it says something. "Online" against every
                    student of a purely online class is a column of noise on
                    a table that already scrolls sideways. */}
                {showSeat && <th className={TH}>Seat</th>}
                <th className={TH}>Subscription</th>
                <th className={TH}>Joined</th>
                <th className={TH}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <RosterRow key={m.studentId} m={m} groupId={group.id} showSeat={showSeat} onUpdate={(p) => updateMember(m.studentId, p)} onRemoved={onRefresh} externalChannels={[group.whatsappLink && 'WhatsApp', group.googleClassroomLink && 'Google Classroom'].filter(Boolean).join(' and ') || undefined} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Banned students */}
      {banned.length > 0 && (
        <section className="flex flex-col gap-ds-2">
          <div className={cn(DS_LABEL, 'pt-ds-2')}>Banned students</div>
          <div className="rounded-ds-card bw-hair border-danger bg-surface-card">
            {banned.map((m) => (
              <div key={m.studentId} className="flex items-center gap-ds-3 bw-b-hair border-line-soft px-ds-card py-ds-3 last:border-b-0">
                <Avatar name={m.name} tone="danger" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold text-ink">{m.name}</div>
                </div>
                <PardonButton studentId={m.studentId} groupId={group.id} onPardon={() => updateMember(m.studentId, { status: 'approved' })} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function PendingRequestRow({ m, groupId, onApprove, onDecline }: {
  m: GroupMember; groupId: string; onApprove: () => void; onDecline: () => void;
}) {
  const [loading, setLoading] = useState<'approve' | 'decline' | null>(null);

  const act = async (status: 'approved' | 'removed', cb: () => void) => {
    setLoading(status === 'approved' ? 'approve' : 'decline');
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${m.studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      cb();
    } catch { /* silent */ } finally { setLoading(null); }
  };

  return (
    <div className="flex flex-wrap items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card px-ds-3 py-ds-3">
      <Avatar name={m.name} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-extrabold text-ink">{m.name}</div>
        <div className="text-[13px] text-ink-muted">Requested to join</div>
      </div>
      <div className="flex shrink-0 items-center gap-ds-2">
        <Button variant="outline" size="sm" disabled={loading !== null} onClick={() => act('removed', onDecline)} className="px-ds-3">
          {loading === 'decline' ? 'Declining…' : 'Decline'}
        </Button>
        <Button variant="dark" size="sm" disabled={loading !== null} onClick={() => act('approved', onApprove)} className="px-ds-3">
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </Button>
      </div>
    </div>
  );
}

export function PardonButton({ studentId, groupId, onPardon }: { studentId: string; groupId: string; onPardon: () => void }) {
  const [loading, setLoading] = useState(false);
  const pardon = async () => {
    setLoading(true);
    try {
      // Delete the membership row so the student must re-join from scratch.
      // The pardon API route handles notifying the student they can rejoin.
      const res = await fetch(`/api/groups/${groupId}/members/${studentId}/pardon`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error();
      onPardon();
    } catch { /* silent */ } finally { setLoading(false); }
  };
  return (
    <Button variant="outline" size="sm" onClick={pardon} disabled={loading} className="shrink-0 px-ds-3">
      {loading ? 'Pardoning…' : 'Pardon'}
    </Button>
  );
}

/**
 * Class-level summary of held money.
 *
 * A tutor waiting weeks between a student paying and being paid needs to see
 * why in one place. Discovering it through an unexpectedly short payout is how
 * tutors leave.
 */
export function SecuredSpotsSummary({ members }: { members: GroupMember[] }) {
  const secured = members.filter((m) => m.paymentStatus === 'secured');
  if (secured.length === 0) return null;

  const totalHeld = secured.reduce((sum, m) => sum + (m.subscription?.secured?.heldTtd ?? 0), 0);
  const releaseDates = secured
    .map((m) => m.subscription?.secured?.releaseDate)
    .filter((d): d is string => !!d)
    .sort();
  const earliest = releaseDates[0] ?? null;
  const allFree = totalHeld <= 0;

  return (
    <div className="flex items-start gap-ds-3 rounded-ds-card bw-hair border-brand bg-brand/10 p-ds-card">
      <span className="grid size-9 shrink-0 place-items-center rounded-ds-sm bw-hair border-ink bg-brand text-ink">
        <Lock className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold text-ink">
          {secured.length} spot{secured.length === 1 ? '' : 's'} secured
        </div>
        <div className="text-[14px] text-ink-muted">
          {allFree
            ? 'Reserved places on a free class — no payment involved.'
            : <>
                <span className="font-extrabold text-ink">{fmtTTD(totalHeld)}</span> held
                {earliest && (
                  <> · releasing from{' '}
                    {new Date(`${earliest}T00:00:00`).toLocaleDateString('en-US', {
                      month: 'long', day: 'numeric', year: 'numeric',
                    })}
                  </>
                )}
              </>}
        </div>
      </div>
    </div>
  );
}

const POP = 'absolute left-0 top-6 z-20 w-64 sm:w-72 rounded-ds-card bw-bold border-ink bg-surface-card p-ds-3 text-left text-[13px] font-normal normal-case leading-[18px] tracking-normal text-ink-muted shadow-[0_8px_24px_rgba(0,0,0,0.14)]';
const INFO_BTN = 'relative grid size-5 shrink-0 place-items-center rounded-full text-ink-muted hover:text-ink';

/**
 * The (i) beside a secured student. Three variants, because the single line
 * "you'll be paid after the first month" is only true for long classes.
 *
 * Deliberately about timing only. The full release conditions (class not
 * deleted, no open report) belong in the terms and at the point the tutor
 * switches the feature on — reading them beside a student's name, when the
 * overwhelming majority of tutors will never trip them, reads as accusatory.
 */
export function SecuredPayoutInfo({ secured }: { secured: NonNullable<Subscriber['secured']> }) {
  const [open, setOpen] = useState(false);
  const dateLabel = secured.releaseDate
    ? new Date(`${secured.releaseDate}T00:00:00`).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : null;

  if (secured.free) {
    return (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={INFO_BTN}
        aria-label="About reserved spots"
      >
        <Info className="size-4" />
        {open && (
          <span className={POP}>
            This student has reserved a place before the class starts. This is a
            free class, so there is no payment involved.
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className={INFO_BTN}
      aria-label="When you'll be paid"
    >
      <Info className="size-4" />
      {open && (
        <span className={POP}>
          <span className="mb-1 block text-[13px] font-extrabold text-ink">When you&apos;ll be paid</span>
          {secured.shortClass ? (
            <>
              Students pay for this class up front. iTutor holds that payment
              until the class finishes{dateLabel ? <> on <span className="font-extrabold text-ink">{dateLabel}</span></> : null},
              then releases it with your next payout.
            </>
          ) : (
            <>
              Students who secure a spot pay for their first month up front.
              iTutor holds that payment until you&apos;ve taught the first month
              of classes — for this class, that&apos;s{' '}
              <span className="font-extrabold text-ink">{dateLabel ?? 'a month after the first lesson'}</span>.
              {' '}Payment is released with your next payout after that date, as
              long as the class runs as scheduled.
            </>
          )}
        </span>
      )}
    </button>
  );
}

export function RosterRow({ m, groupId, onUpdate, onRemoved, externalChannels, showSeat }: { m: GroupMember; groupId: string; onUpdate: (p: Partial<GroupMember>) => void; onRemoved?: () => void; externalChannels?: string; showSeat?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const [confirm, setConfirm] = useState<null | 'suspend' | 'ban' | 'remove'>(null);
  const [reason, setReason] = useState('');
  const [suspendedUntil, setSuspendedUntil] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const infoRef = useRef<HTMLButtonElement>(null);

  // Default suspension end: 7 days from now
  const defaultSuspendUntil = (() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 16);
  })();

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuHeight = 140;
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
      setMenuPos({ top, right: window.innerWidth - rect.right });
    }
    setMenu(true);
  };

  const closeConfirm = () => { setConfirm(null); setReason(''); setSuspendedUntil(''); setErr(''); };

  const callApi = async (status: string, r?: string) => {
    setSaving(true); setErr('');
    try {
      // 'removed' calls DELETE so the subscription cancellation + refund record
      // creation logic in handleTutorRemoval runs; all other actions use PATCH.
      let res: Response;
      if (status === 'removed') {
        res = await fetch(`/api/groups/${groupId}/members/${m.studentId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      } else {
        const body: Record<string, unknown> = { status, reason: r || undefined };
        if (status === 'suspended' && suspendedUntil) {
          body.suspended_until = new Date(suspendedUntil).toISOString();
        }
        res = await fetch(`/api/groups/${groupId}/members/${m.studentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed');
      onUpdate({ status: status as GroupMember['status'] });
      if (status === 'removed') onRemoved?.();
      closeConfirm();
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  // Billing seed shared by the table Membership badge AND the Payment History
  // panel — both consume the SAME getMembershipStatus() derivation so they can
  // never drift. Manual Ban/Suspend sit on top of this payment-driven default.
  const billing: MemberBilling = {
    studentId: m.studentId,
    joinedAt: m.joinedAt,
    status: m.subscription?.status ?? null,
    amount: m.subscription?.plan_price_ttd ?? null,
    lastPaidAt: m.subscription?.last_paid_at ?? null,
  };
  const currentCycle = generateHistoryForMember(billing)[0];
  const payMembership = currentCycle ? getMembershipStatus(getPaymentStatus(currentCycle)) : 'ACTIVE';

  // Manual overrides win over the payment-driven default; otherwise Membership
  // is payment-driven (OVERDUE current cycle → Suspended, automatically).
  const membershipView: { label: string; tone: TagTone } =
    m.status === 'banned'
      ? { label: 'Banned', tone: 'danger' }
      : (m.status === 'suspended' || payMembership === 'SUSPENDED')
      ? { label: MEMBERSHIP_META.SUSPENDED.label, tone: 'danger' }
      : { label: MEMBERSHIP_META.ACTIVE.label, tone: 'brand' };

  const isOverdue = m.paymentStatus === 'overdue';
  const confirmCopy = {
    suspend: {
      title: `Suspend ${m.name}?`,
      body: isOverdue
        ? `${m.name} has an outstanding balance. Suspending pauses their access to the stream, sessions, and meeting links until you reactivate them or they settle the balance.`
        : `${m.name} will lose access to the stream, sessions, and meeting links until you reactivate them.`,
      action: 'Suspend', tone: 'amber' as const,
    },
    ban: {
      title: `Ban ${m.name} from this class?`,
      body: `${m.name} will be permanently removed and blocked from rejoining or requesting access. They'll be notified. This cannot be undone.`,
      action: 'Ban from class', tone: 'rose' as const,
    },
    remove: {
      title: `Remove ${m.name}?`,
      body: (m.subscription && ['ACTIVE', 'GRACE', 'SUSPENDED'].includes(m.subscription.status))
        ? `${m.name} will be removed and their subscription cancelled with a refund for the current month. If the tutor payout was already released, iTutor recovers it from future earnings.`
        : `${m.name} will lose access immediately. They can be re-invited later.`,
      action: 'Remove', tone: 'rose' as const,
    },
  };
  const conf = confirm ? confirmCopy[confirm] : null;
  const subCfg = m.subscription
    ? SUB_STATUS_CFG[m.subscription.status] ?? { label: m.subscription.status, tone: 'outline' as TagTone }
    : null;

  return (
    <>
      <tr className={cn('bw-t-hair border-line-soft', m.status === 'suspended' && 'bg-accent-yellow/10', m.status === 'banned' && 'bg-danger/10')}>
        <td className={TD}>
          <div className="flex items-start gap-ds-3">
            <Avatar name={m.name} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-[6px]">
                <span className="text-[15px] font-extrabold text-ink">{m.name}</span>
                {/* Visually distinct from an active subscriber: this student
                    has paid, but the tutor has not been paid yet. */}
                {m.paymentStatus === 'secured' && <Tag tone="orange">Spot secured</Tag>}
              </div>
              {m.paymentStatus === 'secured' && m.subscription?.secured && (
                <div className="mt-[2px] flex items-center gap-[6px] text-[13px] text-ink-muted">
                  {m.subscription.secured.free ? (
                    <span>Reserved · free class</span>
                  ) : (
                    <span>
                      <span className="font-extrabold text-ink">
                        {fmtTTD(m.subscription.secured.heldTtd)}
                      </span>{' '}
                      held
                      {m.subscription.secured.releaseDate && (
                        <> · releases{' '}
                          {new Date(`${m.subscription.secured.releaseDate}T00:00:00`).toLocaleDateString(
                            'en-US', { month: 'long', day: 'numeric' }
                          )}
                        </>
                      )}
                    </span>
                  )}
                  <SecuredPayoutInfo secured={m.subscription.secured} />
                </div>
              )}
              {m.paymentStatus === 'overdue' && <div className="mt-[2px] text-[13px] font-extrabold text-danger">Outstanding {fmtTTD(m.outstandingTtd ?? 0)}</div>}
              {m.subscription?.cancel_at_period_end && (
                <div className="mt-[2px] flex items-center gap-1 text-[12px] font-extrabold text-ink-muted">
                  <X className="size-3" /> Cancels {fmtShortDate(m.subscription.current_period_end)}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className={cn(TD, 'text-[13px]')}>
          {m.email ? (
            <a href={`mailto:${m.email}`} className="block max-w-[180px] text-ink [overflow-wrap:anywhere] hover:underline">{m.email}</a>
          ) : <span className="text-ink-muted">—</span>}
        </td>
        <td className={TD}>
          <Tag tone={membershipView.tone}>{membershipView.label}</Tag>
        </td>
        {showSeat && (
          <td className={TD}>
            <div className="flex flex-wrap items-center gap-[6px]">
              <Tag tone="outline" className="gap-1">
                {m.seatType === 'physical' ? <MapPin className="size-3" /> : <Video className="size-3" />}
                {m.seatType === 'physical' ? 'In person' : 'Online'}
              </Tag>
              {/* Cash is worth naming on the roster: it is the one payment
                  the platform never sees, so the tutor is the only record
                  that it happened. */}
              {m.paymentMethod === 'cash' && (
                <Tag tone="warning" className="gap-1">
                  <Banknote className="size-3" /> Cash
                </Tag>
              )}
            </div>
          </td>
        )}
        <td className={TD}>
          {m.subscription && subCfg ? (
            <div className="flex flex-col items-start gap-1">
              <Tag tone={subCfg.tone}>{subCfg.label}</Tag>
              <div className="text-[13px] text-ink-muted tabular-nums">{m.subscription.plan_price_ttd ? fmtTTD(m.subscription.plan_price_ttd) : '—'}</div>
            </div>
          ) : <span className="text-[13px] text-ink-muted">—</span>}
        </td>
        <td className={cn(TD, 'whitespace-nowrap text-[13px] text-ink-muted')}>
          {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
        </td>
        <td className={cn(TD, 'text-right')}>
          <div className="flex items-center justify-end gap-1">
            <button
              ref={infoRef}
              type="button"
              onClick={(e) => { e.stopPropagation(); setHistoryOpen(true); }}
              aria-label={`View payment history for ${m.name}`}
              title="Payment history"
              className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              <Info className="size-[18px]" />
            </button>
            <button ref={btnRef} type="button" onClick={openMenu} aria-label={`Actions for ${m.name}`}
              className="grid size-8 place-items-center rounded-ds-sm text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
              <MoreVertical className="size-4" />
            </button>
          </div>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div
                className="fixed z-50 w-56 rounded-ds-card bw-bold border-ink bg-surface-card p-1 text-left shadow-[0_8px_24px_rgba(0,0,0,0.14)]"
                style={{ top: menuPos.top, right: menuPos.right }}
              >
                {m.status === 'suspended'
                  ? <MenuBtn icon={Check} label="Reactivate" onClick={() => { callApi('approved'); setMenu(false); }} />
                  : m.status !== 'banned' && m.paymentStatus === 'overdue'
                  ? <MenuBtn icon={ShieldAlert} label="Suspend" onClick={() => { setMenu(false); setConfirm('suspend'); }} />
                  : null}
                {m.status !== 'banned' && <MenuBtn icon={Ban} destructive label="Ban from class" onClick={() => { setMenu(false); setConfirm('ban'); }} />}
                <MenuBtn icon={Trash2} destructive label="Remove from class" onClick={() => { setMenu(false); setConfirm('remove'); }} />
              </div>
            </>
          )}
          {/* Portalled: renders no DOM inside the table. */}
          <Sheet
            open={!!(confirm && conf)}
            onClose={closeConfirm}
            title={conf?.title ?? ''}
            footer={conf && (
              <div className="flex flex-wrap justify-end gap-ds-2">
                <Button variant="outline" size="md" onClick={closeConfirm} disabled={saving} className="px-ds-4">Cancel</Button>
                <Button
                  variant={conf.tone === 'rose' ? 'danger' : 'dark'}
                  size="md"
                  disabled={saving}
                  onClick={() => callApi(confirm === 'suspend' ? 'suspended' : confirm === 'ban' ? 'banned' : 'removed', reason)}
                  className="px-ds-4"
                >
                  {saving ? 'Saving…' : conf.action}
                </Button>
              </div>
            )}
          >
            {conf && (
              <div className="flex flex-col gap-ds-4 text-left">
                <p className="m-0 text-[15px] leading-[22px] text-ink-muted">{conf.body}</p>
                {/* Suspension end date — only for suspend action */}
                {confirm === 'suspend' && (
                  <div className="flex flex-col gap-ds-1">
                    <label htmlFor={`suspend-until-${m.studentId}`} className={DS_LABEL}>
                      Suspended until <span className="text-danger">*</span>
                    </label>
                    <input
                      id={`suspend-until-${m.studentId}`}
                      type="datetime-local"
                      value={suspendedUntil || defaultSuspendUntil}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(e) => setSuspendedUntil(e.target.value)}
                      className={DS_INPUT}
                    />
                    <p className="m-0 text-[13px] text-ink-muted">The student&apos;s access will automatically restore at this date and time.</p>
                  </div>
                )}
                <div className="flex flex-col gap-ds-1">
                  <label htmlFor={`reason-${m.studentId}`} className={DS_LABEL}>
                    Reason <span className="normal-case tracking-normal font-normal">(optional — shown to student)</span>
                  </label>
                  <textarea
                    id={`reason-${m.studentId}`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Repeated disruption during sessions"
                    rows={2}
                    className={cn(DS_INPUT, 'resize-none')}
                  />
                </div>
                {externalChannels && (
                  <Banner tone="amber" icon={ShieldAlert} title="Also remove from external channels"
                    body={`If ${m.name} is in your ${externalChannels}, remove them there too. iTutor can't do that automatically.`} />
                )}
                {err && <p role="alert" className="m-0 text-[14px] font-extrabold text-danger">{err}</p>}
              </div>
            )}
          </Sheet>
        </td>
      </tr>

      <PaymentHistoryPanel
        open={historyOpen}
        onClose={() => { setHistoryOpen(false); infoRef.current?.focus(); }}
        name={m.name}
        email={m.email}
        billing={billing}
      />
    </>
  );
}

/* ----------- Settings ----------- */
