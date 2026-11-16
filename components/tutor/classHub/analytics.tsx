'use client';

// Class hub: analytics. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
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
import { SETTINGS_SECTIONS, SettingsSectionId, SettingsTab, ClassBannerUpload, ClassPreviewCard } from './settings';

export function AnalyticsTab({ group, members }: { group: GroupDetail; members: GroupMember[] }) {
  const activeCount = members.filter((m) => ['active', 'approved'].includes(m.status)).length;
  const collected = group.earningsTtd ?? 0;
  const outstanding = members.reduce((s, m) => s + (m.paymentStatus === 'overdue' ? (m.outstandingTtd ?? 0) : 0), 0);

  // Trailing six months ending with the current one, from the real clock.
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      count: 0,
    };
  });
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  for (const m of members) {
    if (!m.joinedAt) continue;
    const d = new Date(m.joinedAt);
    if (Number.isNaN(d.getTime())) continue;
    const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (bucket) bucket.count += 1;
  }

  const joins = buckets.map((b) => b.count);
  const maxJoins = Math.max(...joins, 1);
  const joinedInWindow = joins.reduce((s, v) => s + v, 0);
  const thisMonth = joins[joins.length - 1];
  const prevMonth = joins[joins.length - 2];
  // A percentage change off a zero baseline is meaningless — show nothing.
  const momE = prevMonth > 0 ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : null;
  // max bar height in px (container is h-40 = 160px; ~28px reserved for label + gap)
  const BAR_MAX_PX = 128;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {momE === null ? (
          <StatCard label="Enrollment MoM" value="—" hint="No joins last month to compare against" />
        ) : (
          <MomCard label="Enrollment MoM" value={`${momE > 0 ? '+' : ''}${momE}%`} positive={momE >= 0} />
        )}
        <StatCard label="Active members" value={`${activeCount}${group.capacity ? ` / ${group.capacity}` : ''}`} />
        <StatCard label="Collected (TTD)" value={fmtTTD(collected)} />
        <StatCard label="Outstanding (TTD)" value={fmtTTD(outstanding)} />
      </div>
      {joinedInWindow === 0 ? (
        <div className="rounded-2xl bg-card border border-border p-8 text-center">
          <div className="font-semibold text-ink">No enrolments yet</div>
          <div className="mt-1 text-sm text-muted-foreground">
            Once students join this class, their sign-ups will show up here month by month.
          </div>
        </div>
      ) : (
        <ChartCard title="New members by month" caption={`${joinedInWindow} in the last 6 months`}>
          {joins.map((v, i) => (
            <div key={buckets[i].key} className="flex-1 self-stretch flex flex-col items-center justify-end gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-brand to-emerald-300"
                style={{ height: `${Math.round((v / maxJoins) * BAR_MAX_PX)}px`, flexShrink: 0 }}
              />
              <div className="text-[10px] text-muted-foreground shrink-0">{buckets[i].label}</div>
            </div>
          ))}
        </ChartCard>
      )}
    </div>
  );
}

/* ----------- Atom components ----------- */
