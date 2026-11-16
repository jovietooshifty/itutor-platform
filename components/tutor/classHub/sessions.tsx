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

export const NO_CLASS_LINK_MESSAGE =
  "This class uses your own class link, but none is saved yet. Add it on the class's Sessions tab.";

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
      <div className={cn('rounded-2xl bg-card border p-4 flex flex-col md:flex-row md:items-center gap-4', selected ? 'border-brand bg-brand/5' : 'border-border')}>
        <input type="checkbox" checked={selected} onChange={onSelect} className="rounded shrink-0 mt-0.5 self-start md:self-center" />
        <div className="flex items-center gap-3 md:w-60">
          <div className="text-center bg-brand/10 text-brand-deep rounded-lg px-3 py-1.5 leading-tight shrink-0">
            <div className="text-base font-bold">{valid ? d.getDate() : '—'}</div>
            <div className="text-[9px] uppercase font-bold tracking-wider">{valid ? d.toLocaleString(undefined, { month: 'short' }) : '—'}</div>
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-ink text-sm truncate">
              {valid ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }) : 'Scheduled'}
            </div>
            <div className="text-xs text-muted-foreground">
              {valid ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}{valid ? ' · ' : ''}{durLabel}
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center gap-2 flex-wrap">
          {movedTo && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border bg-amber-50 text-amber-800 border-amber-200">
              <MapPin className="size-3" /> Moved to {movedTo}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canRelocate && (
            <div className="relative">
              <button
                onClick={() => setRelocateOpen((o) => !o)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-ink text-xs font-semibold hover:bg-muted transition">
                <MapPin className="size-3.5" /> {movedTo ? 'Moved' : 'Move'}
              </button>
              {relocateOpen && (
                <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-border bg-background p-1.5 shadow-lg">
                  <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Meet somewhere else</div>
                  {venues!.map((v) => (
                    <button key={v.id} disabled={relocating} onClick={() => relocate(v.id)}
                      className={cn('block w-full text-left rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-muted', v.id === venueId ? 'text-brand-deep' : 'text-ink')}>
                      {v.name}{v.id === classVenueId ? ' (usual)' : ''}
                    </button>
                  ))}
                  {/* Clearing the override is its own action. Asking a tutor
                      to re-pick their own venue from a list to undo a move
                      is not the same instruction, and leaves the override
                      row set to a value that only happens to match. */}
                  {venueId && (
                    <button disabled={relocating} onClick={() => relocate(null)}
                      className="mt-1 block w-full text-left rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground border-t border-border hover:bg-muted">
                      Back to the usual place
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {hasStarted && (
            <Link
              href={`/tutor/classes/${groupId}/sessions/${s.id}/attendance`}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-ink text-xs font-semibold hover:bg-muted transition">
              <ListChecks className="size-3.5" /> Attendance
            </Link>
          )}
          {/* Nothing to join in a room. */}
          {classFormat !== 'physical' && (
            <button
              onClick={handleJoin}
              disabled={joiningLink}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90 disabled:opacity-60">
              <Video className="size-3.5" /> {joiningLink ? 'Getting link…' : reconnected && linkMode === 'generated' ? 'Generate' : 'Join'}
            </button>
          )}
          <button
            onClick={() => setConfirmCancel(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-xs font-semibold hover:bg-rose-50 transition">
            <X className="size-3.5" /> Cancel
          </button>
        </div>
      </div>

      {joinError && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setJoinError('')}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-xl p-6 space-y-3">
            <div className="font-bold text-ink text-lg">Could not get meeting link</div>
            <p className="text-sm text-muted-foreground">{joinError}</p>
            <div className="flex justify-end gap-2">
              {joinNeedsLink && onEditLink && (
                <button onClick={() => { setJoinError(''); onEditLink(); }} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Add class link</button>
              )}
              <button onClick={() => setJoinError('')} className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand/90">OK</button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setConfirmCancel(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-background border border-border shadow-xl p-6 space-y-4">
            <div className="font-bold text-ink text-lg">Cancel this session?</div>
            <p className="text-sm text-muted-foreground">
              {valid ? d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : 'This session'} will be removed. Students will no longer see it on their schedule.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmCancel(false)} disabled={cancelling} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted">Keep</button>
              <button onClick={handleCancel} disabled={cancelling}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-50">
                {cancelling ? 'Cancelling…' : 'Cancel session'}
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="space-y-4">
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

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">Sessions</h2>
          <p className="text-xs text-muted-foreground">{upcoming.length} upcoming · {history.length} in history · manage attendance and join links.</p>
        </div>
        <button onClick={() => onOpenSchedule(false)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
          <Plus className="size-3.5" /> Add Session
        </button>
      </div>

      {/* The marketplace lists a class by its upcoming schedule (see the gate
          in GET /api/groups), and students join sessions, so a class with
          nothing ahead is invisible and unjoinable — say so where it's fixed. */}
      {upcoming.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="size-9 rounded-xl bg-amber-100 grid place-items-center shrink-0">
              <CalendarIcon className="size-4 text-amber-700" />
            </div>
            <div className="text-sm text-amber-900">
              <div className="font-semibold">
                {history.length === 0 ? 'No schedule yet' : 'No upcoming sessions'} — students can&apos;t find or join this class until it has one.
              </div>
              <div className="text-xs text-amber-800 mt-0.5">Set the days and times it meets, and how students join.</div>
            </div>
          </div>
          <button onClick={() => onOpenSchedule(false)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand/90">
            <CalendarIcon className="size-3.5" /> Set schedule
          </button>
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

      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs font-semibold">
        {(['upcoming', 'history'] as const).map((v) => (
          <button
            key={v}
            onClick={() => { setView(v); setSelectedIds(new Set()); }}
            className={`px-3 py-1.5 rounded-md ${view === v ? 'bg-brand text-white' : 'text-muted-foreground hover:bg-muted'}`}>
            {v === 'upcoming' ? `Upcoming (${upcoming.length})` : `History (${history.length})`}
          </button>
        ))}
      </div>

      {/* Bulk action bar */}
      {shown.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedIds.size === shown.length && shown.length > 0}
              onChange={toggleAll}
              className="rounded"
            />
            {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
          </label>
          {selectedIds.size > 0 && (
            <button
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 disabled:opacity-50">
              <Trash2 className="size-3.5" /> {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size} session${selectedIds.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      )}

      {/* With no sessions at all the banner above already says what to do. */}
      {sessions.length > 0 && shown.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">{view === 'upcoming' ? 'No upcoming sessions.' : 'No past sessions yet.'}</p>
      )}
      <div className="space-y-2">
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
