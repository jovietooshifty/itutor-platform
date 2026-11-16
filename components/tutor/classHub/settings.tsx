'use client';

// Class hub: settings. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
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
import { SUB_STATUS_CFG, fmtShortDate, RosterTab, PendingRequestRow, PardonButton, SecuredSpotsSummary, SecuredPayoutInfo, RosterRow } from './roster';
import { AnalyticsTab } from './analytics';

export const SETTINGS_SECTIONS = [
  { id: 'basics',    label: 'Display',           icon: Info },
  { id: 'capacity',  label: 'Capacity',          icon: Users },
  { id: 'inperson',  label: 'Class type',        icon: MapPin },
  { id: 'billing',   label: 'Billing',           icon: DollarSign },
  { id: 'access',    label: 'Access & policies', icon: Lock },
  { id: 'classlink', label: 'Class link',        icon: Video },
  { id: 'channels',  label: 'Communication',     icon: MessageSquare },
  { id: 'danger',    label: 'Danger zone',        icon: AlertTriangle },
] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export function SettingsTab({ group, setGroup, isOneOnOne, onDirtyChange, enrolledCount }: {
  group: GroupDetail;
  setGroup: React.Dispatch<React.SetStateAction<GroupDetail | null>>;
  isOneOnOne: boolean;
  onDirtyChange: (dirty: boolean) => void;
  enrolledCount: number;
}) {
  const physicalClasses = usePhysicalClasses();
  // Capacity can be raised or lowered at any time, including on a class that
  // has already started — but never below the seats already taken, since there
  // is no rule for who would be dropped.
  const capacityFloor = Math.max(2, enrolledCount);

  const gradients = [
    'from-orange-500 to-amber-400', 'from-fuchsia-500 to-purple-500', 'from-sky-500 to-cyan-400',
    'from-emerald-500 to-teal-400', 'from-rose-500 to-pink-400', 'from-indigo-500 to-blue-500',
    'from-yellow-500 to-orange-500', 'from-slate-600 to-slate-400',
  ];

  // Local editable copy (decoupled from parent until saved)
  const [draft, setDraft] = useState(() => ({ ...group }));
  const d = <K extends keyof GroupDetail>(k: K, v: GroupDetail[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  // The Capacity stepper and Class type's "Student limit" are one number on a
  // class with one kind of seat. Once that seat has a cap, the trigger derives
  // max_students from it and would quietly throw a stepper change away — the
  // "I entered 12 and it shows something else" problem — so the stepper edits
  // the cap too. With no cap set it is the plain limit, as it always was.
  const setCapacity = (v: number) =>
    setDraft((prev) => {
      if (prev.classFormat === 'online' && prev.maxStudentsOnline != null) {
        return { ...prev, capacity: v, maxStudentsOnline: v };
      }
      if (prev.classFormat === 'physical' && prev.maxStudentsPhysical != null) {
        return { ...prev, capacity: v, maxStudentsPhysical: v };
      }
      return { ...prev, capacity: v };
    });
  // A hybrid class with either seat capped has a total that is only a sum.
  const hybridCapsSetTotal =
    draft.classFormat === 'hybrid' && (draft.maxStudentsOnline != null || draft.maxStudentsPhysical != null);

  // Can this class open preorders at all? Answered by the server, because the
  // recurrence lives in group_sessions and this page only holds flattened
  // occurrences — and because the same rule has to gate the save anyway.
  const [preorderReady, setPreorderReady] =
    useState<{ ok: boolean; reason?: string; firstSession?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/groups/schedules?ids=${group.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setPreorderReady(json?.schedules?.[group.id]?.preorderReady ?? { ok: false, reason: 'no_schedule' });
      })
      .catch(() => {
        // Leaving it null keeps the switch disabled rather than offering
        // something the save would then reject.
        if (!cancelled) setPreorderReady({ ok: false, reason: 'no_schedule' });
      });
    return () => { cancelled = true; };
  }, [group.id]);

  // Track saved snapshot to compute dirty state
  const savedRef = useRef(JSON.stringify(group));
  const dirty = JSON.stringify(draft) !== savedRef.current;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useUnsavedGuard(dirty);

  const [section, setSection] = useState<SettingsSectionId>('basics');
  const tryChangeSection = (id: SettingsSectionId) => {
    if (dirty && !window.confirm('You have unsaved changes. Discard them and switch sections?')) return;
    // Back to the saved snapshot, exactly as the Discard button does. The live
    // group can differ from it (a background refresh updates the enrolled
    // count), and a draft taken from that would still read as dirty.
    if (dirty) handleDiscard();
    setSection(id);
  };
  // Remember join-requests value from when class was public so we can restore it on public→private→public round-trip
  const lastPublicJoinReq = useRef<boolean>(
    group.visibility === 'public' ? group.requireJoinRequests : false
  );

  // Subject search
  const [allSubjects, setAllSubjects] = useState<DbSubject[]>([]);
  const [subjectSearch, setSubjectSearch] = useState(group.subject && group.subject !== '—' ? group.subject : '');
  const [subjectOpen, setSubjectOpen] = useState(false);
  const subjectRef = useRef<HTMLDivElement>(null);

  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    supabase
      .from('subjects')
      .select('id, name, label, curriculum')
      .order('curriculum', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => setAllSubjects((data ?? []).map((s: any) => ({ id: s.id, name: s.name, label: s.label || s.name, curriculum: s.curriculum || '' }))));
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (subjectRef.current && !subjectRef.current.contains(e.target as Node)) setSubjectOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredSubjects = allSubjects.filter((s) =>
    !subjectSearch || s.label.toLowerCase().includes(subjectSearch.toLowerCase())
  );

  const selectSubject = (label: string) => {
    d('subject', label);
    setSubjectSearch(label);
    setSubjectOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    setSaveOk(false);
    try {
      const pricingModelMap: Record<string, string> = {
        'per-session': 'PER_SESSION',
        'per-month': 'MONTHLY',
        'prepaid': 'FREE',
      };

      // The level this draft was built from. form_level is sent only when the
      // tutor actually changed it: every Form 1–4 class moves up a form on
      // 1 July (the progress-class-levels cron), and a Settings tab left open
      // across that night would otherwise put the old level back on its next
      // save — and re-stamp the school year, so it would never move up again.
      const savedLevel = (JSON.parse(savedRef.current) as GroupDetail).level;
      const levelChanged = draft.level !== savedLevel;

      // A cap or price for a seat type the format doesn't offer is sent as
      // null. Class type keeps each seat's fields in the draft while the tutor
      // flips between formats, so an in-person limit typed and then left
      // behind by switching to "Online only" used to be saved and summed into
      // max_students — the 0/24 on a class capped at 12. Migration 263 clears
      // such a cap in the trigger too; this stops sending it at all.
      const offersOnline = formatOffersSeat(draft.classFormat, 'online');
      const offersPhysical = formatOffersSeat(draft.classFormat, 'physical');
      const seats = {
        maxStudentsOnline: offersOnline ? draft.maxStudentsOnline : null,
        maxStudentsPhysical: offersPhysical ? draft.maxStudentsPhysical : null,
        priceOnlineTtd: offersOnline ? draft.priceOnlineTtd : null,
        pricePhysicalTtd: offersPhysical ? draft.pricePhysicalTtd : null,
      };
      const studentLimit = draft.capacity > 0 ? draft.capacity : 20;

      // Basics + capacity/billing → existing groups PATCH (name, description, subject, level, capacity, price, billing model)
      //
      // schedule_display / schedule_data are NOT sent. They are echo-only —
      // the Sessions tab is the only source of a class's schedule, and this
      // page has no input that ever writes draft.scheduleDisplay/scheduleData
      // — and on an environment where those columns don't exist sending them
      // made the route fall back to an attempt that writes only name,
      // description, subject and cover — silently dropping level, capacity,
      // status and format.
      const basicRes = await fetch(`/api/groups/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.title || 'Untitled class',
          description: draft.description || null,
          cover_image: draft.coverImage?.trim() || null,
          subject: draft.subject && draft.subject !== '—' ? draft.subject : null,
          ...(levelChanged ? { form_level: draft.level && draft.level !== '—' ? draft.level : null } : {}),
          max_students: studentLimit,
          status: draft.visibility === 'private' ? 'DRAFT' : 'PUBLISHED',
          // In person (migration 242). Sent to the groups PATCH rather than the
          // settings endpoint because that is where the venue-ownership and
          // format rules are enforced.
          //
          // max_students above is still sent, and a trigger will immediately
          // overwrite it with the sum of the seat caps once any is set.
          // That is the intended precedence — the caps are the fact, the total is
          // derived — and it is why the In person tab shows the derived total
          // read-only rather than offering a third number to edit.
          class_format: draft.classFormat,
          venue_id: draft.classFormat === 'online' ? null : draft.venueId,
          venue_visibility: draft.venueVisibility,
          // An online class has one seat type, so its cap IS the capacity.
          // Re-sending the cap loaded with the page made the trigger restore
          // the old total over the capacity the tutor just typed. For the
          // other formats, a cap for a seat type they don't offer is sent as
          // null (seats, above) rather than whatever survived a format
          // switch — migration 263's trigger clears it server-side either
          // way, but this keeps the client's own preview honest before the
          // next reload.
          max_students_online: draft.classFormat === 'online'
            ? (draft.capacity > 0 ? draft.capacity : 20)
            : seats.maxStudentsOnline,
          max_students_physical: draft.classFormat === 'online' ? null : seats.maxStudentsPhysical,
          price_online_ttd: seats.priceOnlineTtd,
          price_physical_ttd: seats.pricePhysicalTtd,
          accepts_cash: draft.classFormat === 'online' ? false : draft.acceptsCash,
        }),
      });
      const basicJson = await basicRes.json().catch(() => ({}));
      if (!basicRes.ok) throw new Error(basicJson?.error ?? `Save failed (${basicRes.status})`);

      // Access, comms, feedback → new canonical settings endpoint
      const settingsRes = await fetch(`/api/classes/${draft.id}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visibility: draft.visibility,
          require_join_requests: draft.requireJoinRequests,
          secure_spot_enabled: draft.secureSpotEnabled,
          auto_suspend_missed_payment: draft.autoSuspendMissedPayment,
          grace_period_days: draft.gracePeriodDays,
          primary_channel: draft.primaryChannel,
          whatsapp_url: draft.whatsappLink || null,
          google_classroom_link: draft.googleClassroomLink || null,
          // No meeting_link: the class link has its own section and its own
          // save (ClassLinkPanel), which sends it together with its mode. The
          // route ignores a bare meeting_link anyway, so resending the draft's
          // copy could only ever look like it did something.
          parent_feedback_mode: draft.feedbackMode,
          parent_feedback_price: draft.feedbackMode === 'paid_addon' ? (draft.parentFeedbackPrice ?? 0) : null,
          price_monthly: draft.pricePerSession ?? 0,
          pricing_model: 'MONTHLY',
          member_service_fee: draft.memberServiceFee ?? 0,
        }),
      });
      const settingsJson = await settingsRes.json().catch(() => ({}));
      if (!settingsRes.ok) {
        // `error` is a machine code ("already_started", "validation_failed") —
        // it surfaced raw in the red banner. Prefer the human `message`.
        const detail = settingsJson?.details?.[0]?.message
          ?? settingsJson?.message
          ?? settingsJson?.error
          ?? `Save failed (${settingsRes.status})`;
        throw new Error(detail);
      }

      // What was actually stored: the seat fields as sent, and the class total
      // as the trigger derives it. The header's MEMBERS x/y reads
      // group.capacity, and spreading the draft alone put back whatever
      // total the draft held — the stale or summed number — until a reload.
      // With no seat cap for this format the trigger keeps the plain limit
      // that was sent, which the returned row confirms.
      const storedLimit = Number(basicJson?.group?.max_students);
      const saved: GroupDetail = {
        ...draft,
        ...seats,
        capacity: classCapacity(
          draft.classFormat,
          seats.maxStudentsOnline,
          seats.maxStudentsPhysical,
          Number.isFinite(storedLimit) && storedLimit > 0 ? storedLimit : studentLimit,
        ),
      };

      // The link fields are the class's, not the draft's — they are saved
      // separately and may have changed (a Join minting a Meet link) since the
      // draft was taken.
      setGroup((g) => g ? {
        ...g,
        ...saved,
        meetingLink: g.meetingLink,
        meetingLinkMode: g.meetingLinkMode,
        meetingLinkGeneratedAt: g.meetingLinkGeneratedAt,
        linkModeAvailable: g.linkModeAvailable,
        meetingLinkSetAt: g.meetingLinkSetAt,
        linkSetAtAvailable: g.linkSetAtAvailable,
      } : g);
      // The draft takes the stored values too, so the snapshot and the form
      // agree — unless the tutor kept typing while this saved, in which case
      // their newer edits stay and still read as unsaved.
      const sentDraft = JSON.stringify(draft);
      setDraft((prev) => (JSON.stringify(prev) === sentDraft ? saved : prev));
      savedRef.current = JSON.stringify(saved);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2500);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    const parsed = JSON.parse(savedRef.current) as GroupDetail;
    setDraft({ ...parsed });
    setSubjectSearch(parsed.subject && parsed.subject !== '—' ? parsed.subject : '');
  };

  // Class link saves on its own, outside the draft and the unsaved bar. The
  // result is folded into the class, the draft AND the saved snapshot at once;
  // leaving either copy behind would light up "unsaved changes" for something
  // that is already saved (or have Discard put the old link back on screen).
  const handleClassLinkSaved = (mode: MeetingLinkMode, url: string, setAt: string | null) => {
    const patch = {
      meetingLinkMode: mode,
      meetingLink: url,
      meetingLinkGeneratedAt: mode === 'custom' || mode !== group.meetingLinkMode ? null : group.meetingLinkGeneratedAt,
      meetingLinkSetAt: mode === 'custom' ? setAt : null,
    };
    setGroup((g) => g ? { ...g, ...patch } : g);
    setDraft((prev) => ({ ...prev, ...patch }));
    savedRef.current = JSON.stringify({ ...(JSON.parse(savedRef.current) as GroupDetail), ...patch });
  };

  const handleDelete = async (force = false) => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/classes/${group.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deleteReason || null, force }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        router.replace('/tutor/classes');
        return;
      }
      if (res.status === 409 && json.error === 'has_future_sessions') {
        const count = json.count ?? 'upcoming';
        setDeleteError(`This class has ${count} upcoming session${count === 1 ? '' : 's'}. Click "Delete anyway" to cancel them all and delete the class.`);
      } else if (res.status === 409) {
        setDeleteError(json.message ?? 'Cannot delete class — resolve outstanding items first.');
      } else {
        setDeleteError(json.error ?? 'Failed to delete. Please try again.');
      }
    } catch {
      setDeleteError('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-4">
      {saveOk && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          <Check className="size-4" /> Changes saved successfully.
        </div>
      )}
      {saveError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-sm text-rose-700">{saveError}</div>
      )}

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar nav */}
        <nav className="space-y-1">
          {SETTINGS_SECTIONS.filter((s) =>
            (s.id !== 'inperson' || physicalClasses) &&
            // An in-person-only class has nothing to join.
            (s.id !== 'classlink' || group.classFormat !== 'physical')
          ).map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            const danger = s.id === 'danger';
            return (
              <button key={s.id} onClick={() => tryChangeSection(s.id)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                  active
                    ? danger ? 'bg-rose-50 border border-rose-200 text-rose-700' : 'bg-background border border-border text-ink shadow-sm'
                    : danger ? 'text-rose-600 hover:bg-rose-50/60' : 'text-muted-foreground hover:bg-background')}>
                <Icon className="size-4 shrink-0" />
                <span className="flex-1 text-left">{s.label}</span>
                <ChevronRight className={cn('size-3.5 transition', active && !danger && 'text-brand-deep', active && danger && 'text-rose-600')} />
              </button>
            );
          })}
        </nav>

        {/* Content panel */}
        <div className="rounded-2xl bg-background border border-border p-6 space-y-6">
          {section === 'basics' && (
            <>
              <SettingsHead title="Display" desc="Control how your class appears to students in the marketplace." />
              <SetField label="Class title">
                <input value={draft.title} onChange={(e) => d('title', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </SetField>
              <div className="grid grid-cols-2 gap-3">
                <SetField label="Subject">
                  <div className="relative" ref={subjectRef}>
                    <input
                      value={subjectSearch}
                      onChange={(e) => { setSubjectSearch(e.target.value); setSubjectOpen(true); d('subject', ''); }}
                      onFocus={() => setSubjectOpen(true)}
                      placeholder="Search subjects…"
                      className="w-full px-3 py-2 pr-7 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    {draft.subject && draft.subject !== '—' && (
                      <button type="button" onClick={() => { d('subject', ''); setSubjectSearch(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-ink">
                        <X className="size-3.5" />
                      </button>
                    )}
                    {subjectOpen && filteredSubjects.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {filteredSubjects.map((s) => (
                          <button key={s.id} type="button" onClick={() => selectSubject(s.label)}
                            className={cn('w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors',
                              draft.subject === s.label && 'bg-brand/10 text-brand-deep font-medium')}>
                            <span className="font-medium">{s.label}</span>
                            {s.curriculum && <span className="text-xs text-muted-foreground ml-1.5">· {s.curriculum}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </SetField>
                <SetField label="Level">
                  <select
                    value={draft.level && draft.level !== '—' ? draft.level : ''}
                    onChange={(e) => d('level', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand appearance-none"
                  >
                    <option value="">Select level…</option>
                    {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </SetField>
              </div>
              <SetField label="Description" hint="Shown on your public listing and marketplace card.">
                <textarea value={draft.description} onChange={(e) => d('description', e.target.value)}
                  placeholder="Tell students what this class covers, who it's for, and what they'll achieve…"
                  className="w-full min-h-24 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </SetField>
              <ClassBannerUpload
                groupId={draft.id}
                currentUrl={draft.coverImage ?? ''}
                onUploaded={(url) => d('coverImage', url)}
              />
              {/* Marketplace preview */}
              <div className="pt-2 border-t border-border space-y-3">
                <div className="text-sm font-semibold text-ink">Marketplace preview</div>
                <p className="text-xs text-muted-foreground">This is how your class appears to students browsing the Explore page.</p>
                <ClassPreviewCard draft={draft} enrolledCount={enrolledCount} />
              </div>
            </>
          )}

          {section === 'capacity' && (
            <>
              <SettingsHead title="Capacity" desc="Control how many students can be in this class." />
              {isOneOnOne ? (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  This is a 1-on-1 class — capacity is fixed at 1.
                </div>
              ) : hybridCapsSetTotal ? (
                // Two kinds of seat, at least one capped: the total is derived
                // from them and nothing typed here would survive the trigger,
                // so the seat limits are shown, not a third number offered.
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  This class has online and in-person seats, so its limit is set per seat type
                  {physicalClasses ? ' under Class type' : ''}:{' '}
                  <strong className="font-semibold text-ink">
                    {draft.maxStudentsOnline ?? 'no limit'} online · {draft.maxStudentsPhysical ?? 'no limit'} in person
                  </strong>.
                </div>
              ) : (
                <SetField
                  label="Student limit"
                  // The floor is the seats already taken — the server enforces
                  // the same rule, so saying it here saves a rejected save.
                  hint={capacityFloor > 2
                    ? `Min ${capacityFloor} (students already enrolled) · Max 500.`
                    : 'Min 2 · Max 500.'}
                >
                  <div className="inline-flex items-center gap-2">
                    <button onClick={() => setCapacity(Math.max(capacityFloor, draft.capacity - 1))}
                      disabled={draft.capacity <= capacityFloor}
                      className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold disabled:opacity-40 disabled:hover:bg-transparent">−</button>
                    <input
                      type="number" value={draft.capacity} min={capacityFloor} max={500}
                      onChange={(e) => setCapacity(Math.max(capacityFloor, Math.min(500, Number(e.target.value))))}
                      className="w-20 text-center px-3 py-2 rounded-lg border border-border bg-background text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <button onClick={() => setCapacity(Math.min(500, draft.capacity + 1))}
                      className="size-9 grid place-items-center rounded-lg border border-border hover:bg-muted text-lg font-semibold">+</button>
                  </div>
                  {capacityFloor > 2 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      To go below {capacityFloor}, remove a student from the Students tab first.
                    </p>
                  )}
                </SetField>
              )}
            </>
          )}

          {section === 'inperson' && physicalClasses && (
            <>
              <SettingsHead
                title="Class type"
                desc="Run this class at a venue, online, or both."
              />
              {isOneOnOne ? (
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  1-on-1 sessions are arranged directly with the student, so this
                  is set per session rather than on the class.
                </div>
              ) : (
                <InPersonSection
                  draft={{
                    classFormat: draft.classFormat,
                    venueId: draft.venueId,
                    venueVisibility: draft.venueVisibility,
                    maxStudentsOnline: draft.maxStudentsOnline,
                    maxStudentsPhysical: draft.maxStudentsPhysical,
                    priceOnlineTtd: draft.priceOnlineTtd,
                    pricePhysicalTtd: draft.pricePhysicalTtd,
                    acceptsCash: draft.acceptsCash,
                  }}
                  // The total follows the seat limits as they are typed, so the
                  // Capacity tab and the preview card never show a number the
                  // save would then replace. With every cap for the format
                  // blank, the trigger keeps the plain limit already saved.
                  onChange={(patch: Partial<InPersonDraft>) =>
                    setDraft((prev) => {
                      const next = { ...prev, ...patch };
                      return {
                        ...next,
                        capacity: classCapacity(
                          next.classFormat,
                          next.maxStudentsOnline,
                          next.maxStudentsPhysical,
                          (JSON.parse(savedRef.current) as GroupDetail).capacity,
                        ),
                      };
                    })
                  }
                  // Per-seat counts need group_enrollments.seat_type, which this
                  // page does not load. Passing the class total as the ONLINE
                  // floor is the safe direction while every existing enrolment
                  // is online: it can only ever refuse a cap that is too low,
                  // never allow one. Revisit when the roster carries seat_type.
                  enrolledOnline={enrolledCount}
                  enrolledPhysical={0}
                />
              )}
            </>
          )}

          {section === 'billing' && (
            <>
              <SettingsHead title="Billing" desc="How members are charged for this class." />
              <div className="rounded-xl border border-brand/30 bg-brand-soft/30 px-4 py-3 text-sm font-medium text-brand-deep">
                Monthly billing — students are charged a flat fee each month.
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SetField label="Monthly price (TTD)">
                  <input type="number" value={draft.pricePerSession ?? 0} onChange={(e) => d('pricePerSession', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </SetField>
                <SetField label="Per-member service fee (TTD)" infoTitle="Service fee" infoBlurb="A small flat fee added to each member's bill — useful to cover materials, platform costs, or admin overhead.">
                  <input type="number" value={draft.memberServiceFee} onChange={(e) => d('memberServiceFee', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </SetField>
              </div>
            </>
          )}

          {section === 'access' && (
            <>
              <SettingsHead title="Access & policies" desc="Who can join and what happens when payments fall behind." />
              <SetField label="Visibility" hint="Public classes appear in the marketplace. Private classes don't, and always require approval to join.">
                <div className="grid grid-cols-2 gap-2">
                  {(['public', 'private'] as const).map((v) => (
                    <button key={v} onClick={() => {
                      if (v === draft.visibility) return;
                      if (v === 'private') {
                        lastPublicJoinReq.current = draft.requireJoinRequests;
                        setDraft((prev) => ({ ...prev, visibility: 'private', isPublic: false, requireJoinRequests: true }));
                      } else {
                        setDraft((prev) => ({ ...prev, visibility: 'public', isPublic: true, requireJoinRequests: lastPublicJoinReq.current }));
                      }
                    }}
                      className={cn('px-3 py-2 rounded-lg border text-xs font-semibold capitalize inline-flex items-center justify-center gap-1.5 transition-colors',
                        draft.visibility === v ? 'bg-brand-soft border-brand text-brand-deep' : 'bg-background text-muted-foreground border-border hover:text-ink')}>
                      {v === 'public' ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
                      {v}
                    </button>
                  ))}
                </div>
              </SetField>
              <Toggle
                label="Enable join requests"
                hint={draft.visibility === 'private' ? 'Private classes always require approval to join.' : 'Members must request approval before joining.'}
                value={draft.requireJoinRequests}
                onChange={(v) => d('requireJoinRequests', v)}
                disabled={draft.visibility === 'private'}
              />
              {/* Preorders. The switch is only offered once the class has a
                  schedule whose first lesson is still ahead — students must
                  never see a payment button next to "schedule to be
                  confirmed", and a class already running is joined, not
                  reserved. The server re-checks this on save. */}
              <Toggle
                label="Let students secure a spot before it starts"
                hint={
                  preorderReady === null
                    ? 'Checking the schedule…'
                    : preorderReady.ok
                      ? `On by default until the class starts${
                          preorderReady.firstSession
                            ? ` on ${new Date(preorderReady.firstSession).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
                            : ''
                        }. Students pay their first month up front to hold a place; switch off if you'd rather they joined normally. Turning it off doesn't affect spots already secured.`
                      : preorderReasonMessage(
                          (preorderReady.reason ?? 'no_schedule') as PreorderIneligibility
                        )
                }
                value={draft.secureSpotEnabled}
                // Never blocked while it's already on, so a tutor can always
                // switch it back off — including after the class has started.
                disabled={!draft.secureSpotEnabled && !(preorderReady?.ok ?? false)}
                onChange={(v) => d('secureSpotEnabled', v)}
              />
              <Toggle label="Auto-suspend on overdue payment" hint="When a payment goes overdue past the grace window, the member is suspended until they pay." value={draft.autoSuspendMissedPayment} onChange={(v) => d('autoSuspendMissedPayment', v)} />
              {draft.autoSuspendMissedPayment && (
                <SetField label="Grace window (days)" infoTitle="Grace window" infoBlurb="How many days after a missed payment before the member is auto-suspended. Set to 0 to suspend immediately.">
                  <input type="number" value={draft.gracePeriodDays} onChange={(e) => d('gracePeriodDays', Number(e.target.value))}
                    className="w-32 px-3 py-2 rounded-lg border border-border bg-background text-sm" />
                </SetField>
              )}
            </>
          )}

          {section === 'classlink' && group.classFormat !== 'physical' && (
            <>
              <SettingsHead
                title="Class link"
                desc="How students join your online sessions. This saves on its own — it isn't part of the Save button for the rest of Settings."
              />
              <ClassLinkPanel
                groupId={group.id}
                tutorId={group.tutorId}
                mode={group.meetingLinkMode}
                url={group.meetingLink}
                linkModeAvailable={group.linkModeAvailable}
                onSaved={handleClassLinkSaved}
              />
            </>
          )}

          {section === 'channels' && (
            <>
              <SettingsHead title="Communication channels" desc="Optional external channels where your students can stay in touch." />
              <SetField label="WhatsApp group link" infoTitle="WhatsApp" infoBlurb="Students enrolled in this class will see a prompt to join your WhatsApp group.">
                <input value={draft.whatsappLink ?? ''} onChange={(e) => d('whatsappLink', e.target.value)} placeholder="https://chat.whatsapp.com/…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </SetField>
              <SetField label="Google Classroom link" infoTitle="Google Classroom" infoBlurb="Students will see a prompt to join your Google Classroom when they open the class stream.">
                <input value={draft.googleClassroomLink ?? ''} onChange={(e) => d('googleClassroomLink', e.target.value)} placeholder="https://classroom.google.com/c/…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </SetField>
            </>
          )}

          {section === 'danger' && (
            <>
              <SettingsHead title="Danger zone" desc="Irreversible actions. Double-check before confirming." tone="danger" />
              <div className="space-y-3">
                {/* Pausing is reversible, unlike everything else in this section,
                    and the panel says so. It lives here because of who it
                    affects: it stops billing and moves the renewal date for every
                    enrolled family at once. */}
                <ClassPausePanel classId={group.id} />

                <button onClick={() => { setDeleteOpen(true); setDeleteConfirmText(''); setDeleteReason(''); setDeleteError(''); }}
                  className="w-full flex items-start gap-3 rounded-xl border border-rose-200 bg-background px-4 py-3 text-left hover:bg-rose-50 transition-colors">
                  <Trash2 className="size-4 mt-0.5 text-rose-600" />
                  <div>
                    <div className="text-sm font-semibold text-rose-700">Delete class</div>
                    <div className="text-xs text-muted-foreground">Permanently archive this class and all its data.</div>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 backdrop-blur-sm p-4" onClick={() => setDeleteOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-background border border-border shadow-pop p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-rose-100 grid place-items-center"><Trash2 className="size-5 text-rose-600" /></div>
              <div>
                <div className="font-bold text-ink">Delete &ldquo;{group.title}&rdquo;?</div>
                <div className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</div>
              </div>
            </div>
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-800">
              All sessions, roster data, and stream posts will be archived. Past earnings and payment records are preserved.
            </div>
            <div>
              <label className="text-xs font-semibold text-ink">Type <span className="font-bold">{group.title}</span> to confirm</label>
              <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={group.title}
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
            </div>
            <div>
              <label className="text-xs font-semibold text-ink">Reason <span className="font-normal text-muted-foreground">(optional)</span></label>
              <input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="e.g. Course completed, consolidating classes…"
                className="mt-1.5 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            </div>
            {deleteError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{deleteError}</div>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteOpen(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
              {deleteError.includes('Delete anyway') && (
                <button onClick={() => handleDelete(true)} disabled={deleting}
                  className="px-4 py-2 rounded-lg bg-rose-700 text-white text-sm font-semibold hover:bg-rose-800 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                  {deleting ? <><span className="size-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : 'Delete anyway'}
                </button>
              )}
              <button onClick={() => handleDelete(false)} disabled={deleteConfirmText.trim() !== group.title.trim() || deleting}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5">
                {deleting ? <><span className="size-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Deleting…</> : 'Delete class'}
              </button>
            </div>
          </div>
        </div>
      )}

      <UnsavedBar dirty={dirty} onSave={handleSave} onDiscard={handleDiscard} saveLabel="Save class settings" saving={saving} />
    </div>
  );
}

/* ─── Class banner (Banner Builder, or upload your own) ──────── */
export function ClassBannerUpload({ groupId, currentUrl, onUploaded }: { groupId: string; currentUrl: string; onUploaded: (url: string) => void }) {
  const { profile } = useProfile();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState('');

  // Straight upload, for tutors who already have artwork and don't want to
  // compose one. The file is still rasterised through renderBanner at
  // 1600x400 rather than stored as-is: the card and listing assume that exact
  // 4:1 frame, so an arbitrary aspect ratio would letterbox or crop badly.
  // Same pipeline the builder uses for its 'upload' template, so both routes
  // produce an identical artefact.
  async function handleFile(file: File) {
    setError(''); setWarn('');
    if (!BANNER_ACCEPT.includes(file.type)) { setError('Use a JPG, PNG or WebP image.'); return; }
    if (file.size > BANNER_MAX_BYTES) { setError('Image must be under 10MB.'); return; }
    if (!profile?.id) { setError('Not signed in.'); return; }

    setBusy(true);
    try {
      const bmp = await loadBitmap(file);
      if (bmp.width < BANNER_MIN_W || bmp.height < BANNER_MIN_H) {
        setWarn(`For the sharpest result use at least ${BANNER_MIN_W}×${BANNER_MIN_H}px (yours is ${bmp.width}×${bmp.height}).`);
      }

      const canvas = document.createElement('canvas');
      renderBanner(canvas, {
        template: 'upload',
        wash: 'neutral',
        upload: bmp,
        uploadScale: 1,
        uploadOffsetX: 0,
        uploadOffsetY: 0,
        atmosphere: '',
        showGuides: false,
      });
      const blob = await bannerToBlob(canvas);
      const out = new File([blob], 'banner.jpg', { type: 'image/jpeg' });

      // Same bucket/prefix convention as the builder — `avatars` is the bucket
      // whose RLS and public read are provisioned in every environment.
      const path = `${profile.id}/groups/banner-${groupId}-${Date.now()}.jpg`;
      const up = await supabase.storage.from('avatars').upload(path, out, { upsert: true, contentType: 'image/jpeg' });
      if (up.error) throw up.error;

      onUploaded(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch (e: any) {
      setError(e?.message ?? 'Could not read that image.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-ink">Banner image</div>
      <p className="text-xs text-muted-foreground">
        Shown at the top of your class listing. Build one, or upload your own — {BANNER_W}×{BANNER_H} ({BANNER_W / BANNER_H}:1) works best.
      </p>
      {currentUrl && (
        <div className="rounded-xl overflow-hidden h-24 border border-border">
          <img src={currentUrl} alt="Banner" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/tutor/classes/${groupId}/banner`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition"
        >
          <ArrowUpRight className="size-4 rotate-45" />
          {currentUrl ? 'Change banner' : 'Build banner'}
        </Link>

        <input
          ref={fileRef}
          type="file"
          accept={BANNER_ACCEPT.join(',')}
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Upload image'}
        </button>

        {currentUrl && (
          <button onClick={() => onUploaded('')} className="text-xs text-muted-foreground hover:text-rose-600 transition">Remove</button>
        )}
      </div>
      {warn && <p className="text-xs text-amber-600">{warn}</p>}
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

/* ─── Marketplace preview card ───────────────────────── */
export function ClassPreviewCard({ draft, enrolledCount }: { draft: any; enrolledCount: number }) {
  const capacity = draft.capacity ?? 20;
  const pct = capacity > 0 ? Math.round((enrolledCount / capacity) * 100) : 0;
  const spotsLeft = capacity - enrolledCount;
  const isLow = spotsLeft > 0 && spotsLeft <= 3;
  const isFull = spotsLeft <= 0;
  const GRADIENTS = ['from-brand to-emerald-400', 'from-sky-500 to-cyan-400', 'from-orange-500 to-amber-400', 'from-fuchsia-500 to-purple-500'];
  const gradient = GRADIENTS[Math.abs((draft.title || '').charCodeAt(0) ?? 0) % GRADIENTS.length];

  return (
    <div className="max-w-xs rounded-3xl bg-background border border-border overflow-hidden shadow-md">
      {/* Banner */}
      <div className={cn('relative h-24 flex items-end p-3', !draft.coverImage && `bg-gradient-to-br ${gradient}`)}
        style={draft.coverImage ? { backgroundImage: `url(${draft.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className="size-12 rounded-2xl bg-white/90 backdrop-blur grid place-items-center text-2xl shadow-md">📚</div>
      </div>
      {/* Body */}
      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-ink leading-tight">{draft.title || 'Untitled class'}</h3>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold shrink-0">
            <Star className="size-3 fill-amber-500 text-amber-500" /> 0.0
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          {draft.subject || 'Subject'}{draft.level ? ` · ${formatLevel(draft.level)}` : ''}
        </div>
        {draft.description && <p className="text-xs text-muted-foreground line-clamp-2">{draft.description}</p>}
        <div className="flex flex-wrap gap-1.5">
          {draft.requireJoinRequests && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-border bg-muted text-muted-foreground">Approval required</span>
          )}
          {draft.feedbackMode !== 'off' && (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand text-white inline-flex items-center gap-1">
              <Sparkles className="size-2.5" /> {draft.feedbackMode === 'paid_addon' ? 'Parent feedback' : 'Free parent feedback'}
            </span>
          )}
          {isLow && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Only {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</span>}
          {isFull && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Class full</span>}
        </div>
        {draft.scheduleDisplay && (
          <div className="text-xs text-muted-foreground whitespace-pre-line">{draft.scheduleDisplay}</div>
        )}
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">{enrolledCount}/{capacity} enrolled</div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', pct > 80 ? 'bg-coral' : 'bg-brand')} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <div>
            {draft.billingModel === 'per-month'
              ? <><span className="font-bold text-ink">{draft.pricePerSession ? `TT$${draft.pricePerSession}` : 'Free'}</span><span className="text-xs text-muted-foreground">/mo</span></>
              : <span className="font-bold text-brand-deep">Free</span>}
          </div>
          <span className="text-xs font-semibold text-brand-deep">View →</span>
        </div>
      </div>
    </div>
  );
}

