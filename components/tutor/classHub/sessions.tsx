'use client';

// Class hub: sessions. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
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
import { SUB_STATUS_CFG, fmtShortDate, RosterTab, PendingRequestRow, PardonButton, SecuredSpotsSummary, SecuredPayoutInfo, RosterRow } from './roster';
import { SETTINGS_SECTIONS, SettingsSectionId, SettingsTab, ClassBannerUpload, ClassPreviewCard } from './settings';
import { AnalyticsTab } from './analytics';
import { Button, Segmented, Tag } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';

export const NO_CLASS_LINK_MESSAGE =
  "This class uses your own class link, but none is saved yet. Add it on the class's Sessions tab.";

// The Attendance link sits beside DS Buttons, so it borrows the outline
// Button's look (a Link cannot be a <Button>).
const OUTLINE_LINK =
  'mb-[3px] inline-flex h-10 items-center justify-center gap-ds-2 rounded-ds-btn bw-bold border-ink bg-surface-card px-ds-4 text-[14px] font-extrabold leading-none text-ink shadow-edge-ink no-underline transition-transform active:translate-y-[2px] focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-ink';

const CHECKBOX = 'size-[18px] shrink-0 cursor-pointer accent-ink';

export function SessionRow({ s, groupId, meetingLink, linkMode, classFormat, selected, onSelect, onCancel, reconnected, venues, classVenueId, onEditLink, onLinkMinted }: {
  s: GroupSession;
  groupId: string;
  meetingLink: string;
  linkMode: MeetingLinkMode;
  classFormat: ClassFormat;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  reconnected?: boolean;
  venues?: Array<{ id: string; name: string }>;
  classVenueId?: string | null;
  /** Opens the link editor — offered when Join fails for want of a link. */
  onEditLink?: () => void;
  /** A generated link came back from Join; lets the page show it without a reload. */
  onLinkMinted?: (url: string, mode: MeetingLinkMode) => void;
}) {
  const d = new Date(s.date);
  const valid = !isNaN(d.getTime());
  const durationMin = s.durationMin ?? 60;
  const durLabel = durationMin < 60 ? `${durationMin}m` : durationMin % 60 === 0 ? `${durationMin / 60}hr` : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;
  // The register is only offered once the session has begun. A "Take
  // attendance" button on a class three weeks away is noise, and worse, it
  // invites a sheet to be filled in before anybody is in the room.
  const hasStarted = valid && d.getTime() <= Date.now();
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [joiningLink, setJoiningLink] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [joinNeedsLink, setJoinNeedsLink] = useState(false);
  const [relocateOpen, setRelocateOpen] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(s.venueId ?? null);

  // A relocation is a one-off, so it is only offered on a session that has
  // not happened yet. Telling students last Tuesday moved is not information.
  const canRelocate = Boolean(venues && venues.length > 0) && !hasStarted;
  const movedTo = venueId && venueId !== classVenueId
    ? venues?.find((v) => v.id === venueId)?.name ?? 'another venue'
    : null;

  // Status chip. Display only: derived from the date, nothing reads it back.
  const nowMs = Date.now();
  const isLive = valid && hasStarted && nowMs < d.getTime() + durationMin * 60_000;
  const isToday = valid && d.toDateString() === new Date(nowMs).toDateString();
  const isCancelled = s.attendanceStatus === 'cancelled';
  const statusTag: { tone: 'brand' | 'warning' | 'outline' | 'danger' | 'dark'; label: string } =
    isCancelled ? { tone: 'danger', label: 'Cancelled' }
    : isLive ? { tone: 'brand', label: 'Live now' }
    : s.status === 'upcoming' && isToday ? { tone: 'warning', label: 'Today' }
    : s.status === 'upcoming' ? { tone: 'outline', label: 'Upcoming' }
    : { tone: 'dark', label: 'Past' };

  const relocate = async (next: string | null) => {
    setRelocating(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions/occurrences/${s.id}/relocate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Could not move this session');
      setVenueId(next);
      setRelocateOpen(false);
    } catch (e: any) {
      setJoinError(e?.message ?? 'Could not move this session');
    } finally {
      setRelocating(false);
    }
  };

  // Popup blockers only allow a window opened inside the click itself. So the
  // tutor's own link opens synchronously, with no request in front of it, and
  // a generated link opens a blank tab FIRST and points it at the link once
  // the POST answers — opening after the await is what got blocked.
  const handleJoin = async () => {
    setJoinError('');
    setJoinNeedsLink(false);
    if (linkMode === 'custom') {
      if (!meetingLink) { setJoinNeedsLink(true); setJoinError(NO_CLASS_LINK_MESSAGE); return; }
      window.open(meetingLink, '_blank', 'noopener,noreferrer');
      return;
    }

    const w = window.open('about:blank', '_blank');
    // Severed by hand rather than with 'noopener' in the features string,
    // which makes window.open return null and leaves nothing to navigate.
    if (w) w.opener = null;
    setJoiningLink(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/meeting-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401 && json?.error === 'token_expired') {
        w?.close();
        window.location.href = json.reconnectUrl;
        return;
      }
      if (!res.ok) {
        if (json?.code === 'no_class_link') setJoinNeedsLink(true);
        throw new Error(json?.error ?? 'Could not generate link');
      }
      const url: string | undefined = json?.join_url;
      if (!url) throw new Error('No link returned');
      if (w && !w.closed) w.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
      onLinkMinted?.(url, json?.mode === 'custom' ? 'custom' : 'generated');
    } catch (e: any) {
      w?.close();
      setJoinError(e?.message ?? 'Failed to get meeting link');
    } finally {
      setJoiningLink(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/groups/${groupId}/sessions/occurrences/${s.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed');
      onCancel();
    } catch (e: any) {
      alert(e?.message ?? 'Failed to cancel session');
      setCancelling(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          'flex flex-col gap-ds-3 rounded-ds-card bw-hair p-ds-card md:flex-row md:items-center',
          selected ? 'border-ink bg-brand/10' : 'border-border bg-surface-card'
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-ds-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelect}
            aria-label={valid ? `Select session on ${d.toLocaleDateString()}` : 'Select session'}
            className={CHECKBOX}
          />
          {/* Date block, as on the student's enrolled-class page. */}
          <span
            className={cn(
              'flex size-[52px] shrink-0 flex-col items-center justify-center gap-[2px] rounded-ds-sm',
              s.status === 'upcoming' ? 'bg-ink text-brand' : 'bg-surface-sunken text-ink'
            )}
          >
            <span className="font-display text-[20px] font-black leading-5 tabular-nums">{valid ? d.getDate() : '—'}</span>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.8px]">{valid ? d.toLocaleString(undefined, { month: 'short' }) : '—'}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-extrabold text-ink">
              {valid ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }) : 'Scheduled'}
            </div>
            <div className="text-[13px] text-ink-muted tabular-nums">
              {valid ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}{valid ? ' · ' : ''}{durLabel}
            </div>
            <div className="mt-ds-1 flex flex-wrap items-center gap-ds-1">
              <Tag tone={statusTag.tone}>{statusTag.label}</Tag>
              {movedTo && (
                <Tag tone="warning" className="max-w-full gap-[4px] whitespace-normal [overflow-wrap:anywhere]">
                  <MapPin className="size-3 shrink-0" /> Moved to {movedTo}
                </Tag>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-ds-2 md:shrink-0 md:justify-end">
          {canRelocate && (
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setRelocateOpen((o) => !o)}>
                <MapPin className="size-4" /> {movedTo ? 'Moved' : 'Move'}
              </Button>
              {relocateOpen && (
                <div className="absolute left-0 z-30 mt-ds-1 w-56 rounded-ds-card bw-hair border-ink bg-surface-card p-ds-1 md:left-auto md:right-0">
                  <div className="px-ds-2 py-ds-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-ink-muted">Meet somewhere else</div>
                  {venues!.map((v) => (
                    <button key={v.id} type="button" disabled={relocating} onClick={() => relocate(v.id)}
                      className={cn(
                        'block w-full rounded-ds-xs px-ds-2 py-ds-2 text-left text-[14px] hover:bg-surface-sunken disabled:opacity-50',
                        v.id === venueId ? 'font-extrabold text-brand-edge' : 'text-ink'
                      )}>
                      {v.name}{v.id === classVenueId ? ' (usual)' : ''}
                    </button>
                  ))}
                  {/* Clearing the override is its own action. Asking a tutor
                      to re-pick their own venue from a list to undo a move
                      is not the same instruction, and leaves the override
                      row set to a value that only happens to match. */}
                  {venueId && (
                    <button type="button" disabled={relocating} onClick={() => relocate(null)}
                      className="mt-ds-1 block w-full bw-t-hair border-line-soft rounded-ds-xs px-ds-2 py-ds-2 text-left text-[14px] text-ink-muted hover:bg-surface-sunken disabled:opacity-50">
                      Back to the usual place
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {hasStarted && (
            <Link href={`/tutor/classes/${groupId}/sessions/${s.id}/attendance`} className={OUTLINE_LINK}>
              <ListChecks className="size-4" /> Attendance
            </Link>
          )}
          {/* Nothing to join in a room. */}
          {classFormat !== 'physical' && (
            <Button variant="dark" size="sm" onClick={handleJoin} disabled={joiningLink}>
              <Video className="size-4" /> {joiningLink ? 'Getting link…' : reconnected && linkMode === 'generated' ? 'Generate' : 'Join'}
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-danger" onClick={() => setConfirmCancel(true)}>
            <X className="size-4" /> Cancel
          </Button>
        </div>
      </div>

      <Sheet
        open={Boolean(joinError)}
        onClose={() => setJoinError('')}
        title="Could not get meeting link"
        footer={
          <>
            {joinNeedsLink && onEditLink && (
              <Button variant="outline" onClick={() => { setJoinError(''); onEditLink(); }}>Add class link</Button>
            )}
            <Button variant="dark" onClick={() => setJoinError('')}>OK</Button>
          </>
        }
      >
        <p className="m-0 text-[15px] leading-6 text-ink-muted [overflow-wrap:anywhere]">{joinError}</p>
      </Sheet>

      <Sheet
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel this session?"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmCancel(false)} disabled={cancelling}>Keep</Button>
            <Button variant="danger" onClick={handleCancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel session'}
            </Button>
          </>
        }
      >
        <p className="m-0 text-[15px] leading-6 text-ink-muted">
          {valid ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : 'This session'} will be removed. Students will no longer see it on their schedule.
        </p>
      </Sheet>
    </>
  );
}

export function SessionsTab({ sessions, groupId, setSessions, reconnected, group, onOpenSchedule, onLinkSaved }: {
  sessions: GroupSession[];
  groupId: string;
  setSessions: React.Dispatch<React.SetStateAction<GroupSession[]>>;
  reconnected?: boolean;
  group: GroupDetail;
  /** Opens the scheduling pop-up — at step 1, or straight at the link step. */
  onOpenSchedule: (linkOnly: boolean) => void;
  onLinkSaved: (mode: MeetingLinkMode, url: string, setAt: string | null) => void;
}) {
  // Sessions arrive grouped by series (every Monday, then every Tuesday),
  // so a two-day class read as two separate years-long lists. Sort across
  // series: upcoming soonest first, history most recent first.
  const byTime = (s: GroupSession) => new Date(s.date).getTime();
  const upcoming = sessions.filter((s) => s.status === 'upcoming').sort((a, b) => byTime(a) - byTime(b));
  const history = sessions.filter((s) => s.status !== 'upcoming').sort((a, b) => byTime(b) - byTime(a));
  const [view, setView] = useState<'upcoming' | 'history'>('upcoming');
  const shown = view === 'upcoming' ? upcoming : history;
  const physical = group.classFormat === 'physical';
  // Loaded once, here rather than per row: a class with twenty sessions
  // would otherwise make twenty identical requests the moment it renders.
  // Only for classes that meet somewhere — an online class has nowhere to
  // move to.
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (group.classFormat === 'online') return;
    let alive = true;
    fetch('/api/tutor/venues')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive && j?.venues) setVenues(j.venues); })
      .catch(() => {});
    return () => { alive = false; };
  }, [group.classFormat]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelectedIds(selectedIds.size === shown.length ? new Set() : new Set(shown.map((s) => s.id)));

  const bulkDelete = async () => {
    if (!selectedIds.size) return;
    setBulkDeleting(true);
    const ids = [...selectedIds];
    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/groups/${groupId}/sessions/occurrences/${id}`, { method: 'DELETE' }))
    );
    const deleted = ids.filter((_, i) => (results[i] as PromiseFulfilledResult<Response>)?.value?.ok);
    setSessions((prev) => prev.filter((s) => !deleted.includes(s.id)));
    setSelectedIds(new Set());
    setBulkDeleting(false);
  };

  // A Join that mints a Meet link stores it on the class; mirror it so the
  // strip and Settings show the link without a reload. Only for generated
  // mode — a stale page whose server now says 'custom' gets a real refresh
  // from the next fetchAll instead of a guess here.
  const handleLinkMinted = (url: string, mode: MeetingLinkMode) => {
    if (mode === 'generated' && group.meetingLinkMode === 'generated' && url !== group.meetingLink) {
      onLinkSaved('generated', url, null);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-ds-4">
      {/* Month-end "rotate your own link". Not for an in-person-only class,
          which has no link, nor where migration 263 is missing and no link has
          a date — it would read as due every day. */}
      {!physical && group.linkSetAtAvailable && (
        <LinkRotationBanner
          groupId={groupId}
          mode={group.meetingLinkMode}
          url={group.meetingLink}
          setAt={group.meetingLinkSetAt}
          onRotate={() => onOpenSchedule(true)}
        />
      )}

      <div className="flex flex-wrap items-end justify-between gap-ds-3">
        <div className="min-w-0">
          <h2 className="m-0 font-display text-[20px] font-extrabold leading-tight text-ink">Sessions</h2>
          <p className="m-0 mt-[2px] text-[14px] text-ink-muted">
            <span className="font-extrabold text-ink tabular-nums">{upcoming.length}</span> upcoming · <span className="font-extrabold text-ink tabular-nums">{history.length}</span> in history · manage attendance and join links.
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => onOpenSchedule(false)}>
          <Plus className="size-4" /> Add session
        </Button>
      </div>

      {/* The marketplace lists a class by its upcoming schedule (see the gate
          in GET /api/groups), and students join sessions, so a class with
          nothing ahead is invisible and unjoinable — say so where it's fixed. */}
      {upcoming.length === 0 && (
        <div role="status" className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-accent-yellow bg-accent-yellow/20 p-ds-card sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-ds-3">
            <CalendarIcon className="mt-[2px] size-5 shrink-0 text-ink" />
            <div className="min-w-0">
              <div className="text-[15px] font-extrabold text-ink">
                {history.length === 0 ? 'No schedule yet' : 'No upcoming sessions'} — students can&apos;t find or join this class until it has one.
              </div>
              <div className="text-[14px] leading-5 text-ink-muted">Set the days and times it meets, and how students join.</div>
            </div>
          </div>
          <Button variant="dark" size="sm" className="shrink-0" onClick={() => onOpenSchedule(false)}>
            <CalendarIcon className="size-4" /> Set schedule
          </Button>
        </div>
      )}

      {/* How students join. Nothing to join for an in-person-only class. */}
      {!physical && (
        <ClassLinkPanel
          compact
          groupId={groupId}
          tutorId={group.tutorId}
          mode={group.meetingLinkMode}
          url={group.meetingLink}
          linkModeAvailable={group.linkModeAvailable}
          onEdit={() => onOpenSchedule(true)}
          onSaved={onLinkSaved}
        />
      )}

      <Segmented
        label="Sessions view"
        className="w-full sm:max-w-[360px]"
        value={view}
        onChange={(v) => { setView(v); setSelectedIds(new Set()); }}
        options={[
          { id: 'upcoming', label: `Upcoming (${upcoming.length})` },
          { id: 'history', label: `History (${history.length})` },
        ]}
      />

      {/* Bulk action bar */}
      {shown.length > 0 && (
        <div className="flex min-h-[43px] flex-wrap items-center gap-ds-3">
          <label className="flex cursor-pointer select-none items-center gap-ds-2 text-[14px] font-extrabold text-ink">
            <input
              type="checkbox"
              checked={selectedIds.size === shown.length && shown.length > 0}
              onChange={toggleAll}
              className={CHECKBOX}
            />
            {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
          </label>
          {selectedIds.size > 0 && (
            <Button variant="danger" size="sm" onClick={bulkDelete} disabled={bulkDeleting}>
              <Trash2 className="size-4" /> {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size} session${selectedIds.size !== 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      )}

      {/* With no sessions at all the banner above already says what to do. */}
      {sessions.length > 0 && shown.length === 0 && (
        <EmptyState
          icon={view === 'upcoming' ? CalendarIcon : Clock}
          title={view === 'upcoming' ? 'No upcoming sessions.' : 'No past sessions yet.'}
          body={view === 'upcoming' ? 'Add a session or set a schedule and it will show here.' : 'Sessions you have taught will show here, with their attendance.'}
        />
      )}
      <div className="flex flex-col gap-ds-2">
        {shown.map((s) => (
          <SessionRow
            key={s.id}
            s={s}
            groupId={groupId}
            meetingLink={group.meetingLink}
            linkMode={group.meetingLinkMode}
            classFormat={group.classFormat}
            venues={venues}
            classVenueId={group.venueId}
            selected={selectedIds.has(s.id)}
            onSelect={() => toggleSelect(s.id)}
            onCancel={() => { setSessions((prev) => prev.filter((x) => x.id !== s.id)); setSelectedIds((p) => { const n = new Set(p); n.delete(s.id); return n; }); }}
            reconnected={reconnected}
            onEditLink={() => onOpenSchedule(true)}
            onLinkMinted={handleLinkMinted}
          />
        ))}
      </div>
    </div>
  );
}


/* ----------- Students (roster + subscription billing) ----------- */

// Subscription-status chip styling, shared by the merged Students table.
