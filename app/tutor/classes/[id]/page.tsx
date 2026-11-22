'use client';

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
import TutorShell from '@/components/tutor/TutorShell';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import TutorV2Shell from '@/components/tutor/v2/TutorV2Shell';
import TutorClassManageV2 from '@/components/tutor/v2/TutorClassManageV2';
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
import { DbSubject, LEVEL_OPTIONS, Tab, Subscriber, GroupMember, StreamPost, GroupSession, URL_LINE_RE, GroupDetail, classCapacity, SettingsHead, Toggle, Banner, EmptyState, SideCard, InfoRow, SettCard, SetField, InfoPop, MenuBtn, MomCard, StatCard, ChartCard, formatRelative } from '@/components/tutor/classHub/shared';
import { StreamTab, ComposerKind, COMPOSER_THEME, COMPOSER_MAX_MB, ClassPostComposer, StreamCard } from '@/components/tutor/classHub/stream';
import { NO_CLASS_LINK_MESSAGE, SessionRow, SessionsTab } from '@/components/tutor/classHub/sessions';
import { SUB_STATUS_CFG, fmtShortDate, RosterTab, PendingRequestRow, PardonButton, SecuredSpotsSummary, SecuredPayoutInfo, RosterRow } from '@/components/tutor/classHub/roster';
import { SETTINGS_SECTIONS, SettingsSectionId, SettingsTab, ClassBannerUpload, ClassPreviewCard } from '@/components/tutor/classHub/settings';
import { AnalyticsTab } from '@/components/tutor/classHub/analytics';
export default function TutorLessonDetailPage() {
  if (isNewUiEnabled()) {
    return (
      <TutorV2Shell width="wide" title="Class">
        <ClassPageV2 />
      </TutorV2Shell>
    );
  }
  return (
    <TutorShell>
      <ClassHubContent />
    </TutorShell>
  );
}

const HUB_TABS: Tab[] = ['stream', 'sessions', 'roster', 'payments', 'settings', 'analytics'];

/**
 * New UI: the Manage overview (canvas m10/d03) by default; the full class hub
 * whenever the URL asks for something only the hub does — a `?tab=`, the
 * post-create `?schedule=1` pop-up, or the Google/Zoom OAuth return — and for
 * anyone the overview won't serve (an admin entering as tutor).
 */
function ClassPageV2() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const { profile, loading } = useProfile();
  // Live, not captured once: the overview's buttons and the hub's "Class
  // overview" link navigate within this same mounted page. The hub tidies the
  // address bar with history.replaceState, which useSearchParams does not see,
  // so the hub stays up after it strips its own params.
  const wantsHub = ['tab', 'schedule', 'error', 'success'].some((k) => searchParams?.has(k));
  const [overviewFailed, setOverviewFailed] = useState(false);
  const onUnavailable = useMemo(() => () => setOverviewFailed(true), []);

  if (loading || !id) return null;
  const hub = wantsHub || overviewFailed || profile?.role !== 'tutor';
  // The overview keeps its new-design header card and share rail; below them
  // sits the hub's own tab section (Stream / Sessions / Students / Settings /
  // Analytics), embedded rather than reached through a list of links — the
  // old page's layout, in the new style (owner, 2026-11-16).
  if (!hub) {
    return (
      <TutorClassManageV2
        classId={id}
        onUnavailable={onUnavailable}
        renderTabs={(tab, setTab) => <ClassHubContent embedded tab={tab} onTabChange={setTab} />}
      />
    );
  }
  return (
    <div className="flex flex-col gap-ds-3">
      {profile?.role === 'tutor' && !overviewFailed ? (
        <Link href={`/tutor/classes/${id}`} className="w-fit text-[14px] font-extrabold text-ink-muted no-underline hover:text-ink">
          ← Class overview
        </Link>
      ) : null}
      <ClassHubContent />
    </div>
  );
}

function ClassHubContent({ embedded = false, tab: controlledTab, onTabChange }: {
  /** Inside the Manage overview: no hero, no banner prompt, new-style tab bar. */
  embedded?: boolean;
  /** Controlled tab, so the overview's own buttons can switch it. */
  tab?: Tab;
  onTabChange?: (t: Tab) => void;
} = {}) {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string | undefined;
  const { profile, loading } = useProfile();
  const reconnectedFromOAuth = searchParams?.get('success') === 'true';

  // What the URL asked for on arrival, read ONCE. The params are stripped from
  // the address bar below so a refresh doesn't reopen the pop-up, and nothing
  // may re-derive state from them afterwards.
  //   ?schedule=1    the create page, straight after a class is made
  //   ?tab=sessions  the Google / Zoom OAuth callback coming back to this class
  //   ?error=…       that callback, when the connection didn't go through
  const [arrival] = useState(() => ({
    schedule: searchParams?.get('schedule') === '1',
    sessionsTab: searchParams?.get('tab') === 'sessions',
    // The new UI's Manage overview opens the hub at a given tab.
    tab: HUB_TABS.find((t) => t === searchParams?.get('tab')) ?? null,
    oauthError: searchParams?.get('error') ?? null,
  }));

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [sessions, setSessions] = useState<GroupSession[]>([]);
  const [posts, setPosts] = useState<StreamPost[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [localTab, setLocalTab] = useState<Tab>(() => (arrival.schedule || arrival.sessionsTab ? 'sessions' : arrival.tab ?? 'stream'));
  const tab = controlledTab ?? localTab;
  const setTab = (t: Tab) => { if (onTabChange) onTabChange(t); else setLocalTab(t); };
  const [settingsDirty, setSettingsDirty] = useState(false);

  // The scheduling pop-up lives here rather than in SessionsTab so it outlives
  // anything that remounts the tab. `afterCreate` = it opened by itself after
  // the class was made, so a backdrop click must not dismiss it.
  const [scheduleModal, setScheduleModal] = useState<{ linkOnly: boolean; afterCreate: boolean } | null>(
    () => (arrival.schedule ? { linkOnly: false, afterCreate: true } : null),
  );
  const [oauthError, setOauthError] = useState<string | null>(arrival.oauthError);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of ['schedule', 'tab', 'error', 'detail']) {
        if (url.searchParams.has(key)) { url.searchParams.delete(key); changed = true; }
      }
      // Passing window.history.state through keeps the App Router's own entry,
      // and because it carries __NA, Next's patched replaceState skips its URL
      // sync. So this only tidies the address bar: useSearchParams keeps its
      // arrival values (?success=true still labels Join "Generate") and
      // nothing re-renders. `error`/`detail` go too, or a refresh would show
      // the OAuth failure again after it was dismissed.
      if (changed) window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* cosmetic — the modal state above is already captured */ }
  }, []);

  // Admin "Enter as Tutor" mode. null = undetermined (still resolving), false =
  // real tutor viewing their own class, true = a superadmin acting as tutor.
  // The browser can't read SUPERADMIN_EMAILS, so mode is established by probing
  // the server (which also returns the group row, working for archived classes
  // the RLS client can't read directly).
  const [adminMode, setAdminMode] = useState<boolean | null>(null);
  const [adminGroupRow, setAdminGroupRow] = useState<any>(null);

  const switchTab = (next: Tab) => {
    if (tab === 'settings' && settingsDirty) {
      if (!window.confirm('You have unsaved changes in Settings. Leave anyway?')) return;
      setSettingsDirty(false);
    }
    setTab(next);
  };

  useEffect(() => {
    if (loading) return;
    if (!profile) { router.replace('/login'); return; }
    // Real tutor: unchanged path, and never touch the admin probe (regression-safe).
    if (profile.role === 'tutor') { setAdminMode(false); return; }
    // Non-tutor: only a superadmin may view. Probe the server, which authorizes
    // and returns the group row. Anyone else is bounced to /login.
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/classes/${id}/access`);
        if (cancelled) return;
        if (res.ok) {
          const j = await res.json();
          setAdminGroupRow(j.group);
          setAdminMode(true);
        } else {
          router.replace('/login');
        }
      } catch {
        if (!cancelled) router.replace('/login');
      }
    })();
    return () => { cancelled = true; };
  }, [loading, profile, id, router]);

  useEffect(() => {
    if (!id || adminMode === null) return;
    fetchAll(id);

    // Realtime: re-fetch members whenever a join request arrives for this group
    const channel = supabase
      .channel(`class-members-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_members', filter: `group_id=eq.${id}` },
        () => { fetchAll(id); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_members', filter: `group_id=eq.${id}` },
        () => { fetchAll(id); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, adminMode]);

  // Only the FIRST load shows the spinner. After that every fetchAll — the
  // realtime member events below, the roster's refresh — runs in the
  // background. Setting dataLoading again unmounted the whole hub, which threw
  // away an open scheduling pop-up and any unsaved Settings draft every time a
  // join request arrived.
  const loadedOnceRef = useRef(false);
  // Realtime INSERT + UPDATE often land together; only the newest fetch may
  // write state, or an older, slower one could overwrite fresher results.
  const fetchSeqRef = useRef(0);

  async function fetchAll(groupId: string) {
    const seq = ++fetchSeqRef.current;
    const superseded = () => seq !== fetchSeqRef.current;
    if (!loadedOnceRef.current) setDataLoading(true);
    try {
      // Fetch group + active promotion in parallel. In admin mode the group row
      // comes from the server probe (service client) — the browser's RLS client
      // can't read archived/private groups the admin doesn't own. A background
      // refresh re-probes: reusing the arrival row would put back a class link
      // the admin had just changed. For the same reason a failed re-probe
      // yields no row at all, which leaves the group state as it is — the
      // arrival row is only good for the first load.
      const [groupRes, { data: promoRows }] = await Promise.all([
        adminMode
          ? loadedOnceRef.current
            ? fetch(`/api/admin/classes/${groupId}/access`)
                .then((r) => (r.ok ? r.json() : null))
                .then((j) => ({ data: j?.group ?? null }))
                .catch(() => ({ data: null }))
            : Promise.resolve({ data: adminGroupRow })
          : supabase.from('groups').select('*').eq('id', groupId).single(),
        // `.is('user_id', null)` keeps this to class-level promotions. Personal
        // coupons (migration 231) belong to one attendee; with `.limit(1)` here
        // an unfiltered read could return a coupon instead of the real class
        // promotion and misreport the class's own discount to its tutor.
        supabase.from('group_promotions').select('*').eq('group_id', groupId).eq('active', true).is('user_id', null).limit(1),
      ]);
      if (superseded()) return;
      const g = (groupRes as { data: any }).data;
      if (g) {
        const pricingModel = g.pricing_model ?? 'FREE';
        const billingModel: GroupDetail['billingModel'] = 'per-month'; // Only monthly billing supported
        const visibilityVal: GroupDetail['visibility'] =
          g.visibility === 'private' ? 'private' : 'public';
        const activePromotion = (promoRows && promoRows.length > 0) ? promoRows[0] : null;

        setGroup({
          id: g.id,
          title: g.name || 'Untitled class',
          subject: g.subject || '—',
          level: g.form_level || '—',
          description: g.description || g.bio || '',
          coverImage: g.cover_image ?? '',
          scheduleDisplay: g.schedule_display ?? '',
          scheduleData: (() => { try { return g.schedule_data ? JSON.parse(g.schedule_data) : []; } catch { return []; } })(),
          capacity: classCapacity(
            (g.class_format ?? 'online') as ClassFormat,
            g.max_students_online ?? null,
            g.max_students_physical ?? null,
            g.max_students ?? 20,
          ),
          enrolled: 0,
          // Absent on any environment without migration 242, which is why every
          // one of these falls back rather than being read straight through.
          classFormat: (g.class_format ?? 'online') as ClassFormat,
          venueId: g.venue_id ?? null,
          venueVisibility: (g.venue_visibility ?? 'after_enrolment') as GroupDetail['venueVisibility'],
          maxStudentsOnline: g.max_students_online ?? null,
          maxStudentsPhysical: g.max_students_physical ?? null,
          priceOnlineTtd: g.price_online_ttd ?? null,
          pricePhysicalTtd: g.price_physical_ttd ?? null,
          acceptsCash: g.accepts_cash === true,
          pricePerSession: billingModel === 'per-month'
            ? (g.price_monthly ?? g.price_per_session ?? null)
            : (g.price_per_session ?? null),
          memberServiceFee: g.member_service_fee ?? 0,
          billingModel,
          status: g.status ?? 'DRAFT',
          visibility: visibilityVal,
          isPublic: visibilityVal === 'public',
          requireJoinRequests: g.require_join_requests ?? false,
          secureSpotEnabled: g.secure_spot_enabled === true,
          autoSuspendMissedPayment: g.auto_suspend_missed_payment ?? false,
          gracePeriodDays: g.grace_period_days ?? 7,
          primaryChannel: (g.primary_channel ?? 'native') as GroupDetail['primaryChannel'],
          googleClassroomLink: g.google_classroom_link ?? '',
          feedbackMode: (g.feedback_mode ?? 'off') as GroupDetail['feedbackMode'],
          parentFeedbackPrice: g.parent_feedback_price ?? 0,
          recurrenceRule: g.recurrence_rule,
          earningsTtd: 0,
          totalSessionsRun: 0,
          // whatsapp_link is what Settings saves (PATCH /api/classes/[id]/settings);
          // reading the legacy whatsapp_url first showed a stale link after a save.
          whatsappLink: g.whatsapp_link || g.whatsapp_url || '',
          tutorId: g.tutor_id ?? null,
          endDate: typeof g.end_date === 'string' && g.end_date ? g.end_date.slice(0, 10) : null,
          meetingLink: g.meeting_link ?? '',
          meetingLinkMode: g.meeting_link_mode === 'custom' ? 'custom' : 'generated',
          meetingLinkGeneratedAt: g.meeting_link_generated_at ?? null,
          // select('*') simply has no such key where migration 262 isn't applied.
          linkModeAvailable: 'meeting_link_mode' in g,
          // Likewise 263. Both the tutor's select and the admin probe are '*'.
          meetingLinkSetAt: typeof g.meeting_link_set_at === 'string' ? g.meeting_link_set_at : null,
          linkSetAtAvailable: 'meeting_link_set_at' in g,
          rating: null,
          reviewCount: 0,
          activePromotion,
        });
      }

      // Fetch members + subscribers in parallel (service client bypasses RLS)
      let rawMembers: any[] = [];
      let subMap = new Map<string, any>(); // studentId → subscription enrollment
      try {
        const [mRes, sRes] = await Promise.all([
          fetch(`/api/groups/${groupId}/members`),
          fetch(`/api/groups/${groupId}/subscribers`),
        ]);
        if (mRes.ok) rawMembers = (await mRes.json()).members ?? [];
        if (sRes.ok) {
          const subs: any[] = (await sRes.json()).subscribers ?? [];
          // /subscribers returns newest-enrolled_at first, and a student can
          // now legitimately hold two SUBSCRIPTION rows for this class: a
          // released "Secure your spot" hold left CANCELLED, and the live
          // enrolment they made afterwards (lib/payments/staleSecureSpotHold).
          // Keep the newest row we see per student, not the last one written
          // — the loop order below used to overwrite the live row with the
          // older CANCELLED one and show a paid, active student as cancelled.
          for (const s of subs) {
            if (!subMap.has(s.student_id)) subMap.set(s.student_id, s);
          }
        }
      } catch { /* leave empty */ }
      if (superseded()) return;

      const now = new Date();
      function derivePaymentStatus(sub: any): 'paid' | 'pending' | 'overdue' | 'secured' {
        if (!sub) return 'pending';
        // Held money reads as neither paid nor pending: the student has paid,
        // the tutor has not been paid. Checked first — a SECURED enrolment has
        // no current period and would otherwise fall through to 'pending'.
        if (sub.status === 'SECURED') return 'secured';
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
        // Active subscription within a current paid period → paid.
        // Use status='ACTIVE' as the primary signal; payment_status is a secondary
        // check but we don't gate on it because activate_subscription sets both
        // atomically and payment_status can be stale if DB state drifts.
        if (sub.status === 'ACTIVE' && periodEnd && periodEnd > now) return 'paid';
        if (sub.status === 'GRACE' || sub.payment_status === 'OVERDUE') return 'overdue';
        if (sub.status === 'SUSPENDED') return 'overdue';
        return 'pending';
      }

      setMembers(rawMembers.map((m: any): GroupMember => {
        const sub = (subMap.get(m.user_id) ?? null) as Subscriber | null;
        return {
          id: m.id,
          studentId: m.user_id,
          name: m.profile?.full_name || m.profile?.display_name || 'Student',
          paymentStatus: derivePaymentStatus(sub),
          status: m.status ?? 'active',
          joinedAt: m.joined_at ?? null,
          seatType: sub?.seat_type === 'physical' ? 'physical' : 'online',
          paymentMethod: sub?.billing_provider === 'cash' ? 'cash' : 'card',
          email: m.profile?.email ?? null,
          subscription: sub,
          outstandingTtd: sub?.plan_price_ttd ?? 0,
        };
      }));
      if (g) setGroup((prev) => prev ? { ...prev, enrolled: rawMembers.filter((m: any) => ['approved', 'active'].includes(m.status)).length } : prev);

      // Fetch sessions via API (it handles occurrences)
      try {
        const sRes = await fetch(`/api/groups/${groupId}/sessions`);
        if (sRes.ok) {
          const sJson = await sRes.json();
          if (superseded()) return;
          setSessions((sJson.sessions ?? []).flatMap((s: any): GroupSession[] => {
            const durationMin = s.duration_minutes ?? s.duration_min ?? s.duration ?? 60;
            // If occurrences exist, use them as individual entries
            const occs: any[] = s.occurrences ?? [];
            if (occs.length > 0) {
              return occs.map((o: any) => {
                const dt = o.scheduled_start_at ?? o.scheduled_at;
                return {
                  id: o.id ?? s.id,
                  venueId: o.venue_id ?? null,
                  date: dt,
                  durationMin,
                  status: dt && new Date(dt) > new Date() ? 'upcoming' : 'past',
                  attendanceStatus: o.attendance_status,
                  paymentStatus: o.payment_status,
                };
              });
            }
            // Fallback: build datetime from starts_on + start_time
            const dateStr = s.starts_on ?? s.date;
            const timeStr = s.start_time ?? '00:00';
            const dt = dateStr ? `${dateStr}T${timeStr}:00` : null;
            return [{
              id: s.id,
              date: dt ?? new Date().toISOString(),
              durationMin,
              status: dt && new Date(dt) > new Date() ? 'upcoming' : 'past',
              attendanceStatus: s.attendance_status,
              paymentStatus: s.payment_status,
            }];
          }));
        }
      } catch { /* sessions non-critical */ }

      // Fetch stream posts via API
      try {
        const pRes = await fetch(`/api/groups/${groupId}/stream`);
        if (pRes.ok) {
          const pJson = await pRes.json();
          if (superseded()) return;
          setPosts((pJson.posts ?? []).map((p: any): StreamPost => {
            const msgBody: string = p.message_body ?? p.body ?? p.content ?? '';
            const rawLines = msgBody.split('\n').filter(Boolean);
            // Link posts have no dedicated link_url column — the composer writes
            // the raw URL as its own line in message_body. Pull that line out so
            // it renders ONLY as the clickable chip, not also as body text.
            const urlLine = rawLines.find((l: string) => URL_LINE_RE.test(l.trim()));
            const derivedLinkUrl = p.link_url ?? (urlLine ? urlLine.trim() : undefined);
            const textLines = rawLines.filter((l: string) => !URL_LINE_RE.test(l.trim()));
            const derivedTitle = (textLines[0] ?? (derivedLinkUrl ? 'Shared a link' : '')).slice(0, 80);
            const derivedBody = textLines.slice(1).join('\n').trim();
            const derivedAttachmentName = p.attachments?.[0]?.file_name ?? p.attachment_name;
            // post_type is 'content' for BOTH attachment and link posts (and
            // 'announcement' for announcements) — it can't distinguish
            // attachment from link, so derive the display kind from what the
            // post actually contains instead of trusting post_type directly.
            const derivedKind: StreamPost['kind'] = derivedAttachmentName
              ? 'attachment'
              : derivedLinkUrl
              ? 'link'
              : 'announcement';
            return {
              id: p.id,
              kind: derivedKind,
              title: derivedTitle,
              body: derivedBody,
              at: formatRelative(p.created_at),
              pinned: !!(p.pinned_at ?? p.is_pinned ?? p.pinned),
              pendingApproval: p.pending_approval ?? false,
              attachmentName: derivedAttachmentName,
              attachmentUrl: p.attachments?.[0]?.file_url ?? p.attachment_url,
              linkUrl: derivedLinkUrl,
            };
          }));
        }
      } catch { /* stream non-critical */ }

    } catch {
      // keep empty state
    } finally {
      // A superseded first load leaves the spinner to the fetch that replaced it.
      if (!superseded()) {
        loadedOnceRef.current = true;
        setDataLoading(false);
      }
    }
  }

  // The pop-up hands back the server's own occurrence rows, so the cards carry
  // real ids at once (Join, Attendance and Cancel all key on them). An older
  // server that returns none gets a quiet refetch instead of invented ids.
  const handleSessionsCreated = (occurrences: CreatedOccurrence[], durationMin: number) => {
    if (!group) return;
    if (occurrences.length === 0) { fetchAll(group.id); return; }
    // A background fetchAll still in flight may have read the sessions before
    // this insert; landing after the merge it would replace the list, drop the
    // new cards and bring back "No schedule yet". Bumping the sequence makes it
    // discard its result, and the refetch at the end restores whatever else
    // (members, posts) it was bringing.
    fetchSeqRef.current++;
    const now = Date.now();
    const created: GroupSession[] = occurrences.map((o) => ({
      id: o.id,
      date: o.scheduled_start_at,
      durationMin,
      status: new Date(o.scheduled_start_at).getTime() > now ? 'upcoming' : 'past',
      venueId: null,
    }));
    setSessions((prev) => {
      // A GET answered after the insert already holds these rows. Appending
      // them again would show each card twice, under duplicate React keys.
      const known = new Set(prev.map((s) => s.id));
      return [...prev, ...created.filter((s) => !known.has(s.id))]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    // The insert has committed, so this read already includes the new rows.
    fetchAll(group.id);
  };

  // Saved from the pop-up, the Sessions strip or Settings. A new generated
  // link is minted on the next Join, so its timestamp resets whenever the mode
  // changes or the link is the tutor's own. setAt is the server's, so a
  // rotated link takes the month-end banner down at once; it only means
  // anything for the tutor's own link.
  const handleLinkSaved = (mode: MeetingLinkMode, url: string, setAt: string | null) =>
    setGroup((g) => g ? {
      ...g,
      meetingLinkMode: mode,
      meetingLink: url,
      meetingLinkGeneratedAt: mode === 'custom' || mode !== g.meetingLinkMode ? null : g.meetingLinkGeneratedAt,
      meetingLinkSetAt: mode === 'custom' ? setAt : null,
    } : g);

  const OAUTH_ERRORS: Record<string, string> = {
    auth_failed: "Connecting your video account didn't finish. Please try again.",
    connection_failed: "We couldn't save your video connection. Please try again.",
    server_config: "Video connections aren't set up on this server. Please contact support.",
  };

  if (loading || dataLoading || !group) {
    return <div className="min-h-[400px] flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand" /></div>;
  }

  const isOneOnOne = group.capacity === 1;
  const enrolledCount = members.filter((m) => m.status !== 'removed').length;
  const atCapacity = enrolledCount >= group.capacity;
  const seatCounts = {
    physical: members.filter((m) => m.status !== 'removed' && m.seatType === 'physical').length,
    online: members.filter((m) => m.status !== 'removed' && m.seatType !== 'physical').length,
  };

  const newUi = isNewUiEnabled();
  const tabs: { key: Tab; label: string }[] = [
    { key: 'stream', label: 'Stream' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'roster', label: 'Students' },
    { key: 'settings', label: 'Settings' },
    ...(isOneOnOne ? [] : [{ key: 'analytics' as Tab, label: 'Analytics' }]),
  ];

  return (
    // The bleed margins undo TutorShell's padding; the new shell has none to
    // undo, and bleeding there pulls the hero over the "Class overview" link.
    // Rounded on the hero itself, not via overflow-hidden here, which would
    // stop the sticky admin banner from sticking.
    <div className={newUi ? undefined : '-mx-4 lg:-mx-8 -mt-6 lg:-mt-8'}>
      {/* Admin "acting as tutor" banner — mandatory, never ambiguous. */}
      {adminMode && (
        <div className="sticky top-0 z-30 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-amber-950">
          <ShieldAlert className="size-4 shrink-0" />
          <span>Viewing as admin — you are acting as the tutor. Every change is logged.</span>
        </div>
      )}
      {/* Banner header — the Manage overview has its own header card. */}
      {/* 176px could not hold chips + title + the stacked price boxes on a
          phone; the new UI gives it room. The old UI is left as it was. */}
      {!embedded && (
      <div className={cn('relative', newUi ? 'h-64 rounded-ds-card lg:h-52' : 'h-44 lg:h-52', !group.coverImage && (group.thumbnailGradient ?? 'from-brand to-emerald-400'), !group.coverImage && 'bg-gradient-to-br')}
        style={group.coverImage ? { backgroundImage: `url(${group.coverImage})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        {group.coverImage && (
          <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
        )}
        <Link href={adminMode ? '/admin/classes' : '/tutor/classes'} className="absolute top-4 left-4 inline-flex items-center gap-1 text-xs font-semibold text-white/95 bg-black/30 hover:bg-black/40 px-3 py-1.5 rounded-full backdrop-blur">
          <ArrowLeft className="size-3.5" /> {adminMode ? 'Class Admin' : 'All Classes'}
        </Link>
        <div className="absolute inset-x-0 bottom-0">
          <div className="px-4 lg:px-8 pb-5 text-white flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/90 text-ink">
                  {isOneOnOne ? '1:1' : 'Group'}
                </span>
                <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/20 border border-white/30 inline-flex items-center gap-1')}>
                  {group.isPublic ? <Globe className="size-3" /> : <Lock className="size-3" />}
                  {group.isPublic ? 'public' : 'private'}
                </span>
                {atCapacity && !isOneOnOne && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500 text-white">At capacity</span>
                )}
              </div>
              <h1 className="mt-2 text-2xl lg:text-3xl font-bold truncate">{group.title}</h1>
              <div className="mt-1 text-sm text-white/85">{group.subject} · {formatLevel(group.level)}{group.recurrenceRule ? ` · ${group.recurrenceRule}` : ''}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white/95 text-ink px-4 py-2 text-right">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{group.billingModel === 'per-month' ? 'per month' : 'per session'}</div>
                {group.activePromotion ? (
                  <>
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-sm font-bold px-2.5 py-1 rounded-full bg-amber-400 text-amber-900">{group.activePromotion.discount}% off</span>
                      <span className="text-lg font-bold text-brand-deep">TTD {Math.round((group.pricePerSession ?? 0) * (1 - group.activePromotion.discount / 100))}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground line-through">TTD {group.pricePerSession ?? 0}</div>
                  </>
                ) : (
                  <div className="text-lg font-bold">TTD {group.pricePerSession ?? 0}</div>
                )}
              </div>
              {!isOneOnOne && (
                <div className="rounded-xl bg-white/95 text-ink px-4 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Members</div>
                  <div className="text-lg font-bold tabular-nums">{enrolledCount}/{group.capacity}</div>
                  {/* The class total is a DERIVED sum of the two seat caps, and
                      it COALESCEs an unlimited cap to 0 — so on a class with
                      seats of both kinds it is the least trustworthy number on
                      the screen. The per-seat counts below are what actually
                      gate enrolment, so they are shown beside it. */}
                  {group.classFormat !== 'online' && (
                    <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                      {seatCounts.physical} in person{group.maxStudentsPhysical != null ? `/${group.maxStudentsPhysical}` : ''}
                      {group.classFormat === 'hybrid' && (
                        <> · {seatCounts.online} online{group.maxStudentsOnline != null ? `/${group.maxStudentsOnline}` : ''}</>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      <div className={embedded ? 'pb-12' : 'px-4 lg:px-8 pb-12'}>
        {!embedded && !group.coverImage && !adminMode && (
          <Link href={`/tutor/classes/${group.id}/banner`}
            className="mt-6 flex items-center gap-3 rounded-2xl border border-dashed border-brand/40 bg-brand-soft/40 px-4 py-3 transition hover:bg-brand-soft/70">
            <div className="size-9 rounded-xl bg-brand text-white grid place-items-center shrink-0"><UploadCloud className="size-4" /></div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink">Build your class banner</div>
              <div className="text-xs text-muted-foreground">Give this class a cover in under a minute — a finished default is ready for you.</div>
            </div>
            <span className="ml-auto shrink-0 text-xs font-semibold text-brand-deep">Open builder →</span>
          </Link>
        )}
        {embedded ? (
          <div role="tablist" aria-label="Class sections" className="flex gap-ds-2 overflow-x-auto pb-ds-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => switchTab(t.key)}
                className={cn(
                  // Compact (21 Nov 2026 sprint): the pills were taller and
                  // bolder than every button around them, so "Sessions" and
                  // its neighbours stood out of the layout.
                  'ds-press inline-flex h-9 shrink-0 items-center rounded-ds-full bw-hair px-ds-3 font-body text-[14px] font-extrabold whitespace-nowrap cursor-pointer',
                  tab === t.key ? 'border-ink bg-ink text-on-ink' : 'border-ink/15 bg-surface-card text-ink hover:border-ink/40'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
        <div className="border-b border-border mt-6 flex items-center gap-6 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={cn('relative pb-3 text-sm font-semibold capitalize whitespace-nowrap transition',
                tab === t.key ? 'text-brand-deep' : 'text-muted-foreground hover:text-ink')}>
              {t.label}
              {tab === t.key && <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-brand" />}
            </button>
          ))}
        </div>
        )}

        {oauthError && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <AlertTriangle className="size-4 mt-0.5 shrink-0" />
            <span className="flex-1 min-w-0">
              {OAUTH_ERRORS[oauthError] ?? "Something went wrong connecting your video account. Please try again."}
              <span className="ml-1 text-xs text-amber-700/80">({oauthError})</span>
            </span>
            <button onClick={() => setOauthError(null)} aria-label="Dismiss" className="shrink-0 size-6 grid place-items-center rounded-md hover:bg-amber-100">
              <X className="size-3.5" />
            </button>
          </div>
        )}

        <div className="mt-6">
          {tab === 'stream'    && <StreamTab group={group} posts={posts} setPosts={setPosts} />}
          {tab === 'sessions'  && (
            <SessionsTab
              sessions={sessions}
              groupId={group.id}
              setSessions={setSessions}
              reconnected={reconnectedFromOAuth}
              group={group}
              onOpenSchedule={(linkOnly) => setScheduleModal({ linkOnly, afterCreate: false })}
              onLinkSaved={handleLinkSaved}
            />
          )}
          {tab === 'roster'    && <RosterTab members={members} setMembers={setMembers} group={group} isOneOnOne={isOneOnOne} atCapacity={atCapacity} onRefresh={() => fetchAll(group.id)} />}
          {tab === 'payments'  && <PaymentsGrid groupId={group.id} />}
          {tab === 'settings'  && <SettingsTab group={group} setGroup={setGroup} isOneOnOne={isOneOnOne} onDirtyChange={setSettingsDirty} enrolledCount={enrolledCount} />}
          {tab === 'analytics' && !isOneOnOne && <AnalyticsTab group={group} members={members} />}
        </div>
      </div>

      {scheduleModal && (
        <ScheduleSessionsModal
          groupId={group.id}
          tutorId={group.tutorId}
          classEndDate={group.endDate}
          classFormat={group.classFormat}
          existing={sessions.map((s) => ({ date: s.date, durationMin: s.durationMin }))}
          linkMode={group.meetingLinkMode}
          link={group.meetingLink}
          linkModeAvailable={group.linkModeAvailable}
          linkOnly={scheduleModal.linkOnly}
          dismissOnBackdrop={!scheduleModal.afterCreate}
          onClose={() => {
            const afterCreate = scheduleModal.afterCreate;
            setScheduleModal(null);
            // New UI: a class just made goes on to its Manage overview, which
            // shows "Your class is live" (m11) when it is published and now
            // has a session, and the fix card when it doesn't.
            if (newUi && afterCreate && !adminMode) router.replace(`/tutor/classes/${group.id}?created=1`);
          }}
          onLinkSaved={handleLinkSaved}
          onSessionsCreated={handleSessionsCreated}
        />
      )}
    </div>
  );
}

/* ----------- Stream ----------- */