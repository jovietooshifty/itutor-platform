'use client';

// Class hub: settings. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
// tab can be redrawn in the new UI on its own. Redrawn in the design system the
// same day; behaviour (draft, dirty tracking, save, delete) unchanged.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Users, Check, Star, MapPin, X, Trash2, Globe, Video, Sparkles, AlertTriangle,
  MessageSquare, DollarSign, Lock, Info, ArrowUpRight, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useUnsavedGuard } from '@/lib/hooks/useUnsavedGuard';
import { UnsavedBar } from '@/components/UnsavedBar';
import { supabase } from '@/lib/supabase/client';
import { formatLevel } from '@/lib/utils/formatLevel';
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
import { preorderReasonMessage, type PreorderIneligibility } from '@/lib/payments/secureSpot';
import ClassPausePanel from '@/components/tutor/ClassPausePanel';
import { ClassLinkPanel } from '@/components/tutor/classes/ClassLinkChoice';
import type { MeetingLinkMode } from '@/lib/types/groups';
import { formatOffersSeat } from '@/lib/utils/seatCapacity';
import InPersonSection, { type InPersonDraft } from '@/components/tutor/classes/InPersonSection';
import { usePhysicalClasses } from '@/lib/hooks/usePhysicalClasses';
import { Button, Tag } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';
import { ClassCover } from '@/components/parent/v2/ClassCover';
import {
  DbSubject, LEVEL_OPTIONS, GroupDetail, classCapacity, SettingsHead, Toggle, Banner, SetField,
  DS_CARD, DS_INPUT, DS_LABEL, DS_PILL, DS_PILL_ON,
} from './shared';

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

/** A muted note in place of a form (1-on-1 classes, derived totals). */
const NOTE = 'rounded-ds-card bg-surface-sunken px-ds-4 py-ds-3 text-[14px] leading-5 text-ink-muted';
/** − / + square on the capacity stepper. */
const STEP_BTN =
  'ds-press grid size-11 shrink-0 place-items-center rounded-ds-btn bw-hair border-ink bg-surface-card font-display text-[20px] font-extrabold text-ink cursor-pointer hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-card';
/** Small spinner that takes the button's text colour. */
const SPINNER = 'size-3.5 animate-spin rounded-full bw-bold border-transparent border-t-current';

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


  const visibleSections = SETTINGS_SECTIONS.filter((s) =>
    (s.id !== 'inperson' || physicalClasses) &&
    // An in-person-only class has nothing to join.
    (s.id !== 'classlink' || group.classFormat !== 'physical')
  );

  return (
    <div className="flex max-w-5xl flex-col gap-ds-4">
      {saveOk && (
        <div role="status" className="flex items-center gap-ds-2 rounded-ds-card bw-hair border-brand bg-brand/10 px-ds-4 py-ds-3 text-[14px] font-extrabold text-ink">
          <Check className="size-4 shrink-0 text-brand-edge" /> Changes saved successfully.
        </div>
      )}
      {saveError && (
        <Banner tone="rose" icon={AlertTriangle} title="Couldn't save your changes" body={saveError} />
      )}

      <div className="grid gap-ds-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-ds-5">
        {/* Section nav. Phones: a scrolling pill row. Wide: a column of rows. */}
        <nav aria-label="Settings sections" className="min-w-0">
          <div className="-mx-ds-1 flex gap-ds-2 overflow-x-auto px-ds-1 pb-ds-1 [scrollbar-width:none] lg:hidden">
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              const danger = s.id === 'danger';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => tryChangeSection(s.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    DS_PILL,
                    'shrink-0 whitespace-nowrap',
                    danger && 'text-danger',
                    active && (danger ? '!border-danger !bg-danger !text-on-ink' : DS_PILL_ON)
                  )}
                >
                  <Icon className="size-3.5" />
                  {s.label}
                </button>
              );
            })}
          </div>

          <div className="hidden flex-col gap-[2px] lg:flex">
            {visibleSections.map((s) => {
              const Icon = s.icon;
              const active = section === s.id;
              const danger = s.id === 'danger';
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => tryChangeSection(s.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'ds-press flex w-full items-center gap-ds-3 rounded-ds-btn bw-bold px-ds-3 py-[10px] text-left font-body text-[14px] font-extrabold cursor-pointer transition-colors',
                    danger && 'mt-ds-2',
                    active
                      ? danger ? 'border-danger bg-surface-card text-danger' : 'border-ink bg-ink text-on-ink'
                      : danger ? 'border-transparent text-danger hover:bg-danger/10' : 'border-transparent text-ink hover:bg-surface-sunken'
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">{s.label}</span>
                  <ChevronRight className={cn('size-3.5 shrink-0', !active && 'opacity-40')} />
                </button>
              );
            })}
          </div>
        </nav>

        {/* Content panel */}
        <div className={cn(DS_CARD, 'flex min-w-0 flex-col gap-ds-5')}>
          {section === 'basics' && (
            <>
              <SettingsHead title="Display" desc="Control how your class appears to students in the marketplace." />
              <SetField label="Class title">
                <input value={draft.title} onChange={(e) => d('title', e.target.value)} className={DS_INPUT} />
              </SetField>
              <div className="grid gap-ds-3 sm:grid-cols-2">
                <SetField label="Subject">
                  <div className="relative" ref={subjectRef}>
                    <input
                      value={subjectSearch}
                      onChange={(e) => { setSubjectSearch(e.target.value); setSubjectOpen(true); d('subject', ''); }}
                      onFocus={() => setSubjectOpen(true)}
                      placeholder="Search subjects…"
                      className={cn(DS_INPUT, 'pr-10')}
                    />
                    {draft.subject && draft.subject !== '—' && (
                      <button
                        type="button"
                        aria-label="Clear subject"
                        onClick={() => { d('subject', ''); setSubjectSearch(''); }}
                        className="absolute right-ds-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-ds-sm text-ink-muted hover:text-ink"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                    {subjectOpen && filteredSubjects.length > 0 && (
                      <div className="absolute z-20 mt-ds-1 max-h-56 w-full overflow-y-auto rounded-ds-btn bw-hair border-ink bg-surface-card p-ds-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
                        {filteredSubjects.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => selectSubject(s.label)}
                            className={cn(
                              'w-full rounded-ds-sm px-ds-3 py-ds-2 text-left text-[14px] text-ink hover:bg-surface-sunken',
                              draft.subject === s.label && 'bg-brand/10'
                            )}
                          >
                            <span className="font-extrabold">{s.label}</span>
                            {s.curriculum && <span className="ml-[6px] text-[12px] text-ink-muted">· {s.curriculum}</span>}
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
                    className={cn(DS_INPUT, 'cursor-pointer')}
                  >
                    <option value="">Select level…</option>
                    {LEVEL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </SetField>
              </div>
              <SetField label="Description" hint="Shown on your public listing and marketplace card.">
                <textarea
                  value={draft.description}
                  onChange={(e) => d('description', e.target.value)}
                  placeholder="Tell students what this class covers, who it's for, and what they'll achieve…"
                  className={cn(DS_INPUT, 'min-h-28 resize-y')}
                />
              </SetField>
              <ClassBannerUpload
                groupId={draft.id}
                currentUrl={draft.coverImage ?? ''}
                onUploaded={(url) => d('coverImage', url)}
              />
              {/* Marketplace preview */}
              <div className="flex flex-col gap-ds-3 bw-t-hair border-line-soft pt-ds-4">
                <div>
                  <div className="font-display text-[17px] font-extrabold text-ink">Marketplace preview</div>
                  <p className="m-0 mt-[2px] text-[13px] leading-[18px] text-ink-muted">This is how your class appears to students browsing the Explore page.</p>
                </div>
                <ClassPreviewCard draft={draft} enrolledCount={enrolledCount} />
              </div>
            </>
          )}

          {section === 'capacity' && (
            <>
              <SettingsHead title="Capacity" desc="Control how many students can be in this class." />
              {isOneOnOne ? (
                <div className={NOTE}>This is a 1-on-1 class — capacity is fixed at 1.</div>
              ) : hybridCapsSetTotal ? (
                // Two kinds of seat, at least one capped: the total is derived
                // from them and nothing typed here would survive the trigger,
                // so the seat limits are shown, not a third number offered.
                <div className={NOTE}>
                  This class has online and in-person seats, so its limit is set per seat type
                  {physicalClasses ? ' under Class type' : ''}:{' '}
                  <strong className="font-extrabold text-ink">
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
                  <div className="inline-flex items-center gap-ds-2">
                    <button
                      type="button"
                      aria-label="Decrease limit"
                      onClick={() => setCapacity(Math.max(capacityFloor, draft.capacity - 1))}
                      disabled={draft.capacity <= capacityFloor}
                      className={STEP_BTN}
                    >−</button>
                    <input
                      type="number" value={draft.capacity} min={capacityFloor} max={500}
                      aria-label="Student limit"
                      onChange={(e) => setCapacity(Math.max(capacityFloor, Math.min(500, Number(e.target.value))))}
                      className={cn(DS_INPUT, 'w-24 text-center font-extrabold tabular-nums')}
                    />
                    <button
                      type="button"
                      aria-label="Increase limit"
                      onClick={() => setCapacity(Math.min(500, draft.capacity + 1))}
                      className={STEP_BTN}
                    >+</button>
                  </div>
                  {capacityFloor > 2 && (
                    <p className="m-0 mt-ds-1 text-[13px] leading-[18px] text-ink-muted">
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
                <div className={NOTE}>
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
              <div className="flex flex-wrap items-center gap-ds-2 rounded-ds-card bw-hair border-brand bg-brand/10 px-ds-4 py-ds-3 text-[14px] text-ink">
                <Tag tone="brand">Monthly</Tag>
                <span className="min-w-0">Students are charged a flat fee each month.</span>
              </div>
              <div className="grid gap-ds-3 sm:grid-cols-2">
                <SetField label="Monthly price (TTD)">
                  <input type="number" value={draft.pricePerSession ?? 0} onChange={(e) => d('pricePerSession', Number(e.target.value))}
                    className={cn(DS_INPUT, 'tabular-nums')} />
                </SetField>
                <SetField label="Per-member service fee (TTD)" infoTitle="Service fee" infoBlurb="A small flat fee added to each member's bill — useful to cover materials, platform costs, or admin overhead.">
                  <input type="number" value={draft.memberServiceFee} onChange={(e) => d('memberServiceFee', Number(e.target.value))}
                    className={cn(DS_INPUT, 'tabular-nums')} />
                </SetField>
              </div>
            </>
          )}

          {section === 'access' && (
            <>
              <SettingsHead title="Access & policies" desc="Who can join and what happens when payments fall behind." />
              <SetField label="Visibility" hint="Public classes appear in the marketplace. Private classes don't, and always require approval to join.">
                <div className="grid grid-cols-2 gap-ds-2" role="radiogroup" aria-label="Visibility">
                  {(['public', 'private'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={draft.visibility === v}
                      onClick={() => {
                        if (v === draft.visibility) return;
                        if (v === 'private') {
                          lastPublicJoinReq.current = draft.requireJoinRequests;
                          setDraft((prev) => ({ ...prev, visibility: 'private', isPublic: false, requireJoinRequests: true }));
                        } else {
                          setDraft((prev) => ({ ...prev, visibility: 'public', isPublic: true, requireJoinRequests: lastPublicJoinReq.current }));
                        }
                      }}
                      className={cn(DS_PILL, 'justify-center rounded-ds-btn py-[10px] text-[14px] capitalize', draft.visibility === v && DS_PILL_ON)}
                    >
                      {v === 'public' ? <Globe className="size-4" /> : <Lock className="size-4" />}
                      {v}
                    </button>
                  ))}
                </div>
              </SetField>
              <div className="flex flex-col gap-ds-3">
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
              </div>
              {draft.autoSuspendMissedPayment && (
                <SetField label="Grace window (days)" infoTitle="Grace window" infoBlurb="How many days after a missed payment before the member is auto-suspended. Set to 0 to suspend immediately.">
                  <input type="number" value={draft.gracePeriodDays} onChange={(e) => d('gracePeriodDays', Number(e.target.value))}
                    className={cn(DS_INPUT, 'w-32 tabular-nums')} />
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
                  className={DS_INPUT} />
              </SetField>
              <SetField label="Google Classroom link" infoTitle="Google Classroom" infoBlurb="Students will see a prompt to join your Google Classroom when they open the class stream.">
                <input value={draft.googleClassroomLink ?? ''} onChange={(e) => d('googleClassroomLink', e.target.value)} placeholder="https://classroom.google.com/c/…"
                  className={DS_INPUT} />
              </SetField>
            </>
          )}

          {section === 'danger' && (
            <>
              <SettingsHead title="Danger zone" desc="Irreversible actions. Double-check before confirming." tone="danger" />
              <div className="flex flex-col gap-ds-3">
                {/* Pausing is reversible, unlike everything else in this section,
                    and the panel says so. It lives here because of who it
                    affects: it stops billing and moves the renewal date for every
                    enrolled family at once. */}
                <ClassPausePanel classId={group.id} />

                <div className="flex flex-wrap items-center gap-ds-3 rounded-ds-card bw-hair border-danger bg-surface-card p-ds-card">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger/10 text-danger">
                    <Trash2 className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <div className="text-[15px] font-extrabold text-danger">Delete class</div>
                    <div className="text-[13px] leading-[18px] text-ink-muted">Permanently archive this class and all its data.</div>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => { setDeleteOpen(true); setDeleteConfirmText(''); setDeleteReason(''); setDeleteError(''); }}
                  >
                    Delete class
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <Sheet
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={<>Delete &ldquo;{group.title}&rdquo;?</>}
        label={`Delete ${group.title}?`}
        footer={
          <div className="flex flex-wrap justify-end gap-ds-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            {deleteError.includes('Delete anyway') && (
              <Button variant="danger" size="sm" onClick={() => handleDelete(true)} disabled={deleting}>
                {deleting ? <><span className={SPINNER} />Deleting…</> : 'Delete anyway'}
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDelete(false)}
              disabled={deleteConfirmText.trim() !== group.title.trim() || deleting}
            >
              {deleting ? <><span className={SPINNER} />Deleting…</> : 'Delete class'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-ds-4">
          <p className="m-0 text-[14px] font-extrabold text-danger">This action cannot be undone.</p>
          <div className="rounded-ds-card bw-hair border-danger/40 bg-danger/10 px-ds-3 py-ds-2 text-[14px] leading-5 text-ink">
            All sessions, roster data, and stream posts will be archived. Past earnings and payment records are preserved.
          </div>
          <label className="flex flex-col gap-ds-1">
            <span className={DS_LABEL}>Type <span className="normal-case tracking-normal text-ink [overflow-wrap:anywhere]">{group.title}</span> to confirm</span>
            <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder={group.title}
              className={cn(DS_INPUT, 'focus:outline-danger')} />
          </label>
          <label className="flex flex-col gap-ds-1">
            <span className={DS_LABEL}>Reason <span className="normal-case tracking-normal font-normal">(optional)</span></span>
            <input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="e.g. Course completed, consolidating classes…"
              className={DS_INPUT} />
          </label>
          {deleteError && (
            <div role="alert" className="rounded-ds-card bw-hair border-danger/40 bg-danger/10 px-ds-3 py-ds-2 text-[14px] leading-5 text-danger">{deleteError}</div>
          )}
        </div>
      </Sheet>

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
    <div className="flex flex-col gap-ds-2">
      <div className={DS_LABEL}>Banner image</div>
      <p className="m-0 text-[13px] leading-[18px] text-ink-muted">
        Shown at the top of your class listing. Build one, or upload your own — {BANNER_W}×{BANNER_H} ({BANNER_W / BANNER_H}:1) works best.
      </p>
      {currentUrl && (
        <div className="h-24 overflow-hidden rounded-ds-card bw-hair border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={currentUrl} alt="Banner" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-ds-3">
        <Link
          href={`/tutor/classes/${groupId}/banner`}
          className="mb-[3px] inline-flex h-10 items-center gap-ds-2 rounded-ds-btn bw-bold border-ink bg-surface-card px-ds-4 font-body text-[14px] font-extrabold text-ink shadow-edge-ink active:translate-y-[2px] active:shadow-edge-ink-active"
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
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? 'Uploading…' : 'Upload image'}
        </Button>

        {currentUrl && (
          <button
            type="button"
            onClick={() => onUploaded('')}
            className="text-[13px] font-extrabold text-ink-muted underline-offset-2 hover:text-danger hover:underline"
          >
            Remove
          </button>
        )}
      </div>
      {warn && <p className="m-0 rounded-ds-sm bg-accent-yellow/20 px-ds-2 py-ds-1 text-[13px] text-ink">{warn}</p>}
      {error && <p role="alert" className="m-0 text-[13px] font-extrabold text-danger">{error}</p>}
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

  return (
    <div className="w-full max-w-xs overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card">
      {/* Banner: the tutor's upload, else the subject colour block used across the app. */}
      <ClassCover image={draft.coverImage || null} subject={draft.subject || draft.title} className="h-24" />
      {/* Body */}
      <div className="flex flex-col gap-ds-3 p-ds-card">
        <div className="flex items-start justify-between gap-ds-2">
          <h3 className="m-0 min-w-0 font-display text-[16px] font-extrabold leading-tight text-ink [overflow-wrap:anywhere]">{draft.title || 'Untitled class'}</h3>
          <Tag tone="warning" className="shrink-0 gap-[3px]">
            <Star className="size-3 fill-current" /> 0.0
          </Tag>
        </div>
        <div className="text-[13px] text-ink-muted">
          {draft.subject || 'Subject'}{draft.level ? ` · ${formatLevel(draft.level)}` : ''}
        </div>
        {draft.description && <p className="m-0 line-clamp-2 text-[13px] leading-[18px] text-ink-muted">{draft.description}</p>}
        <div className="flex flex-wrap gap-[6px]">
          {draft.requireJoinRequests && <Tag tone="outline">Approval required</Tag>}
          {draft.feedbackMode !== 'off' && (
            <Tag tone="brand" className="gap-[3px]">
              <Sparkles className="size-2.5" /> {draft.feedbackMode === 'paid_addon' ? 'Parent feedback' : 'Free parent feedback'}
            </Tag>
          )}
          {isLow && <Tag tone="warning">Only {spotsLeft} spot{spotsLeft !== 1 ? 's' : ''} left</Tag>}
          {isFull && <Tag tone="dark">Class full</Tag>}
        </div>
        {draft.scheduleDisplay && (
          <div className="whitespace-pre-line text-[13px] text-ink-muted">{draft.scheduleDisplay}</div>
        )}
        <div className="flex flex-col gap-ds-1">
          <div className="text-[13px] tabular-nums text-ink-muted">{enrolledCount}/{capacity} enrolled</div>
          <div className="h-2 overflow-hidden rounded-ds-full bg-surface-sunken">
            <div className={cn('h-full rounded-ds-full transition-all', pct > 80 ? 'bg-accent-orange' : 'bg-brand')} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        </div>
        <div className="flex items-center justify-between bw-t-hair border-line-soft pt-ds-2">
          <div>
            {draft.billingModel === 'per-month'
              ? <><span className="font-display text-[16px] font-extrabold tabular-nums text-ink">{draft.pricePerSession ? `TT$${draft.pricePerSession}` : 'Free'}</span><span className="text-[13px] text-ink-muted">/mo</span></>
              : <span className="font-display text-[16px] font-extrabold text-brand-edge">Free</span>}
          </div>
          <span className="text-[13px] font-extrabold text-brand-edge">View →</span>
        </div>
      </div>
    </div>
  );
}
