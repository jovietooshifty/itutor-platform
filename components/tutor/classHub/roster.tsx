'use client';

// Class hub: roster. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
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
import { DbSubject, LEVEL_OPTIONS, Tab, Subscriber, GroupMember, StreamPost, GroupSession, URL_LINE_RE, GroupDetail, classCapacity, SettingsHead, Toggle, Banner, EmptyState, SideCard, InfoRow, SettCard, SetField, InfoPop, MenuBtn, MomCard, StatCard, ChartCard, formatRelative } from './shared';
import { StreamTab, ComposerKind, COMPOSER_THEME, COMPOSER_MAX_MB, ClassPostComposer, StreamCard } from './stream';
import { NO_CLASS_LINK_MESSAGE, SessionRow, SessionsTab } from './sessions';
import { SETTINGS_SECTIONS, SettingsSectionId, SettingsTab, ClassBannerUpload, ClassPreviewCard } from './settings';
import { AnalyticsTab } from './analytics';

export const SUB_STATUS_CFG: Record<string, { label: string; cls: string }> = {
  ACTIVE:             { label: 'Active',      cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  GRACE:              { label: 'Grace',       cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  SUSPENDED:          { label: 'Suspended',   cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  CANCELLED:          { label: 'Cancelled',   cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  PENDING_PAYMENT:    { label: 'Pending',     cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  ACTIVATION_FAILED:  { label: 'Activating',  cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  WAITLISTED:         { label: 'Waitlisted',  cls: 'bg-purple-100 text-purple-800 border-purple-200' },
};

export const fmtShortDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-TT', { day: 'numeric', month: 'short' }) : '—';

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
  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/classes/${group.id}` : '';

  // The Seat column earns its place only when the class can actually differ
  // by seat or by payment method.
  const showSeat = group.classFormat !== 'online' || group.acceptsCash;

  const updateMember = (sid: string, patch: Partial<GroupMember>) =>
    setMembers((ms) => ms.map((m) => m.studentId === sid ? { ...m, ...patch } : m));

  const copy = () => { navigator.clipboard?.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); };

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

  // Subscription summary (derived from the joined member data — no extra fetch)
  const withSub = visible.filter((m) => m.subscription);
  const activeSubs = withSub.filter((m) => ['ACTIVE', 'GRACE', 'SUSPENDED'].includes(m.subscription!.status)).length;
  const graceSubs = withSub.filter((m) => m.subscription!.status === 'GRACE').length;
  const billingSummary = withSub.length > 0
    ? ` · ${activeSubs} active${graceSubs > 0 ? ` · ${graceSubs} in grace period` : ''}`
    : '';

  return (
    <div className="space-y-4">
      {/* Pending join requests */}
      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-amber-100 grid place-items-center shrink-0">
              <Clock className="size-4 text-amber-700" />
            </div>
            <div>
              <div className="font-bold text-amber-900 text-sm">{pending.length} pending join request{pending.length !== 1 ? 's' : ''}</div>
              <div className="text-xs text-amber-700">Review and approve or decline each request.</div>
            </div>
          </div>
          <div className="space-y-2">
            {pending.map((m) => (
              <PendingRequestRow key={m.studentId} m={m} groupId={group.id}
                onApprove={() => updateMember(m.studentId, { status: 'approved' })}
                onDecline={() => updateMember(m.studentId, { status: 'removed' })} />
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Students</h2>
          <p className="text-xs text-muted-foreground">
            {isOneOnOne ? '1:1 — your recurring student.' : `${visible.length} of ${group.capacity} seats filled`}{billingSummary}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-background text-xs font-semibold hover:bg-muted">
              <RefreshCw className="size-3.5" /> Refresh
            </button>
          )}
          {!isOneOnOne && (
            <>
              <button disabled={atCapacity} onClick={() => setInviteOpen('link')}
                className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold',
                  atCapacity ? 'border-border text-muted-foreground cursor-not-allowed' : 'border-border bg-background hover:bg-muted')}>
                <LinkIcon className="size-3.5" /> Invite by Link
              </button>
              <button disabled={atCapacity} onClick={() => setInviteOpen('user')}
                className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold',
                  atCapacity ? 'bg-muted text-muted-foreground cursor-not-allowed' : 'bg-brand text-white hover:bg-brand/90')}>
                <UserPlus className="size-3.5" /> Invite by User
              </button>
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
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="font-semibold text-ink">Invite link</div>
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
            <span className="text-xs text-muted-foreground truncate font-mono flex-1">{inviteUrl}</span>
            <button onClick={copy} className="text-xs font-semibold text-brand-deep hover:underline inline-flex items-center gap-1">
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {inviteOpen === 'user' && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="font-semibold text-ink">Invite by username or email</div>
          <div className="flex items-center gap-2">
            <input
              value={inviteQuery}
              onChange={(e) => { setInviteQuery(e.target.value); setInviteError(''); setInviteOk(''); }}
              onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
              placeholder="e.g. student@example.tt"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            <button
              onClick={sendInvite}
              disabled={inviteSending || !inviteQuery.trim()}
              className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 inline-flex items-center gap-1.5 disabled:opacity-50">
              <Mail className="size-3.5" /> {inviteSending ? 'Sending…' : 'Send invite'}
            </button>
          </div>
          {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}
          {inviteOk && <p className="text-xs text-emerald-600 font-medium">{inviteOk}</p>}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState icon={Users} title="No members yet" body="Invite by link or by user to start filling this class." />
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-bold px-4 py-2">Member</th>
                <th className="text-left font-bold px-4 py-2">Contact</th>
                <th className="text-left font-bold px-4 py-2">Membership</th>
                {/* Only when it says something. "Online" against every
                    student of a purely online class is a column of noise on
                    a table that already scrolls sideways. */}
                {showSeat && <th className="text-left font-bold px-4 py-2">Seat</th>}
                <th className="text-left font-bold px-4 py-2">Subscription</th>
                <th className="text-left font-bold px-4 py-2">Joined</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((m) => (
                <RosterRow key={m.studentId} m={m} groupId={group.id} showSeat={showSeat} onUpdate={(p) => updateMember(m.studentId, p)} onRemoved={onRefresh} externalChannels={[group.whatsappLink && 'WhatsApp', group.googleClassroomLink && 'Google Classroom'].filter(Boolean).join(' and ') || undefined} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Banned students */}
      {members.filter((m) => m.status === 'banned').length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">Banned students</div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 divide-y divide-rose-100">
            {members.filter((m) => m.status === 'banned').map((m) => (
              <div key={m.studentId} className="flex items-center gap-3 px-4 py-3">
                <div className="size-8 rounded-full bg-rose-200 grid place-items-center text-xs font-bold text-rose-700 shrink-0">
                  {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink text-sm">{m.name}</div>
                </div>
                <PardonButton studentId={m.studentId} groupId={group.id} onPardon={() => updateMember(m.studentId, { status: 'approved' })} />
              </div>
            ))}
          </div>
        </div>
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
    <div className="flex items-center gap-3 bg-background rounded-xl px-3 py-2.5 border border-amber-200">
      <div className="size-8 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-white text-xs font-bold shrink-0">
        {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-ink text-sm truncate">{m.name}</div>
        <div className="text-xs text-muted-foreground">Requested to join</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          disabled={loading !== null}
          onClick={() => act('removed', onDecline)}
          className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50">
          {loading === 'decline' ? 'Declining…' : 'Decline'}
        </button>
        <button
          disabled={loading !== null}
          onClick={() => act('approved', onApprove)}
          className="px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90 disabled:opacity-50">
          {loading === 'approve' ? 'Approving…' : 'Approve'}
        </button>
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
    <button onClick={pardon} disabled={loading}
      className="text-xs font-semibold text-brand-deep hover:underline disabled:opacity-50">
      {loading ? 'Pardoning…' : 'Pardon'}
    </button>
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
    <div className="rounded-2xl border border-brand/30 bg-brand-soft/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-ink">
            {secured.length} spot{secured.length === 1 ? '' : 's'} secured
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {allFree
              ? 'Reserved places on a free class — no payment involved.'
              : <>
                  <span className="font-semibold text-ink">{fmtTTD(totalHeld)}</span> held
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
    </div>
  );
}

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
        className="grid size-4 place-items-center rounded-full border border-border text-[9px] font-bold text-muted-foreground hover:border-brand hover:text-brand-deep"
        aria-label="About reserved spots"
      >
        i
        {open && (
          <span className="absolute z-20 mt-24 w-64 rounded-xl border border-border bg-background p-3 text-left text-[11px] font-normal leading-relaxed text-muted-foreground shadow-lg">
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
      className="relative grid size-4 place-items-center rounded-full border border-border text-[9px] font-bold text-muted-foreground hover:border-brand hover:text-brand-deep"
      aria-label="When you'll be paid"
    >
      i
      {open && (
        <span className="absolute left-0 top-5 z-20 w-72 rounded-xl border border-border bg-background p-3 text-left text-[11px] font-normal leading-relaxed text-muted-foreground shadow-lg">
          <span className="mb-1 block text-xs font-bold text-ink">When you&apos;ll be paid</span>
          {secured.shortClass ? (
            <>
              Students pay for this class up front. iTutor holds that payment
              until the class finishes{dateLabel ? <> on <span className="font-semibold text-ink">{dateLabel}</span></> : null},
              then releases it with your next payout.
            </>
          ) : (
            <>
              Students who secure a spot pay for their first month up front.
              iTutor holds that payment until you&apos;ve taught the first month
              of classes — for this class, that&apos;s{' '}
              <span className="font-semibold text-ink">{dateLabel ?? 'a month after the first lesson'}</span>.
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

  // Manual overrides win over the payment-derived default; otherwise Membership
  // is payment-driven (OVERDUE current cycle → Suspended, automatically).
  const membershipView =
    m.status === 'banned'
      ? { label: 'Banned', chip: 'bg-rose-100 text-rose-700 border-rose-200' }
      : (m.status === 'suspended' || payMembership === 'SUSPENDED')
      ? { label: MEMBERSHIP_META.SUSPENDED.label, chip: 'bg-red-50 text-red-700 border-red-200' }
      : { label: MEMBERSHIP_META.ACTIVE.label, chip: 'bg-emerald-100 text-emerald-700 border-emerald-200' };

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

  return (
    <>
      <tr className={cn(m.status === 'suspended' && 'bg-amber-50/40', m.status === 'banned' && 'bg-rose-50/40')}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-gradient-to-br from-brand to-emerald-400 grid place-items-center text-xs font-bold text-white shrink-0">
              {m.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-ink">{m.name}</span>
                {/* Visually distinct from an active subscriber: this student
                    has paid, but the tutor has not been paid yet. */}
                {m.paymentStatus === 'secured' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-deep">
                    Spot secured
                  </span>
                )}
              </div>
              {m.paymentStatus === 'secured' && m.subscription?.secured && (
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {m.subscription.secured.free ? (
                    <span>Reserved · free class</span>
                  ) : (
                    <span>
                      <span className="font-semibold text-ink">
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
              {m.paymentStatus === 'overdue' && <div className="text-[11px] text-rose-600 font-semibold">Outstanding {fmtTTD(m.outstandingTtd ?? 0)}</div>}
              {m.subscription?.cancel_at_period_end && (
                <div className="text-[10px] text-zinc-500 font-medium flex items-center gap-1">
                  <X className="size-2.5" /> Cancels {fmtShortDate(m.subscription.current_period_end)}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs">
          {m.email ? (
            <a href={`mailto:${m.email}`} className="block text-ink hover:text-brand-deep hover:underline truncate max-w-[160px] text-xs">{m.email}</a>
          ) : <span className="text-muted-foreground">—</span>}
        </td>
        <td className="px-4 py-3">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border', membershipView.chip)}>{membershipView.label}</span>
        </td>
        {showSeat && (
          <td className="px-4 py-3">
            <div className="flex items-center gap-1.5">
              <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
                m.seatType === 'physical' ? 'bg-brand-soft text-brand-deep border-brand/30' : 'bg-sky-50 text-sky-700 border-sky-200')}>
                {m.seatType === 'physical' ? <MapPin className="size-3" /> : <Video className="size-3" />}
                {m.seatType === 'physical' ? 'In person' : 'Online'}
              </span>
              {/* Cash is worth naming on the roster: it is the one payment
                  the platform never sees, so the tutor is the only record
                  that it happened. */}
              {m.paymentMethod === 'cash' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
                  <Banknote className="size-3" /> Cash
                </span>
              )}
            </div>
          </td>
        )}
        <td className="px-4 py-3">
          {m.subscription ? (
            <div className="space-y-1">
              <span className={cn('inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border',
                (SUB_STATUS_CFG[m.subscription.status] ?? { cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' }).cls)}>
                {(SUB_STATUS_CFG[m.subscription.status] ?? { label: m.subscription.status }).label}
              </span>
              <div className="text-[11px] text-muted-foreground">{m.subscription.plan_price_ttd ? fmtTTD(m.subscription.plan_price_ttd) : '—'}</div>
            </div>
          ) : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
          <button
            ref={infoRef}
            type="button"
            onClick={(e) => { e.stopPropagation(); setHistoryOpen(true); }}
            aria-label={`View payment history for ${m.name}`}
            title="Payment history"
            className="size-8 grid place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <Info className="size-[18px]" />
          </button>
          <button ref={btnRef} onClick={openMenu} className="size-8 grid place-items-center rounded-md hover:bg-muted text-muted-foreground">
            <MoreVertical className="size-4" />
          </button>
          </div>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div
                className="fixed z-50 w-56 rounded-xl border border-border bg-background shadow-xl p-1 text-left"
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
        </td>
      </tr>

      {confirm && conf && (
        <tr><td colSpan={showSeat ? 7 : 6} className="p-0">
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={closeConfirm}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
              <div className="font-bold text-ink text-lg">{conf.title}</div>
              <p className="text-sm text-muted-foreground">{conf.body}</p>
              {/* Suspension end date — only for suspend action */}
              {confirm === 'suspend' && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Suspended until <span className="normal-case font-normal text-rose-600">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={suspendedUntil || defaultSuspendUntil}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setSuspendedUntil(e.target.value)}
                    className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">The student's access will automatically restore at this date and time.</p>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Reason <span className="normal-case font-normal">(optional — shown to student)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Repeated disruption during sessions"
                  rows={2}
                  className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                />
              </div>
              {externalChannels && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
                  <ShieldAlert className="size-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-800">
                    <span className="font-semibold">Also remove from external channels — </span>
                    if {m.name} is in your {externalChannels}, remove them there too. iTutor can't do that automatically.
                  </p>
                </div>
              )}
              {err && <p className="text-xs text-rose-600">{err}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={closeConfirm} disabled={saving} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Cancel</button>
                <button
                  disabled={saving}
                  onClick={() => callApi(confirm === 'suspend' ? 'suspended' : confirm === 'ban' ? 'banned' : 'removed', reason)}
                  className={cn('px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-50',
                    conf.tone === 'rose' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700')}>
                  {saving ? 'Saving…' : conf.action}
                </button>
              </div>
            </div>
          </div>
        </td></tr>
      )}

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
