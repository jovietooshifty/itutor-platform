'use client';

// Class hub: stream. Moved out of app/tutor/classes/[id]/page.tsx (2026-11-16) so each
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
import { NO_CLASS_LINK_MESSAGE, SessionRow, SessionsTab } from './sessions';
import { SUB_STATUS_CFG, fmtShortDate, RosterTab, PendingRequestRow, PardonButton, SecuredSpotsSummary, SecuredPayoutInfo, RosterRow } from './roster';
import { SETTINGS_SECTIONS, SettingsSectionId, SettingsTab, ClassBannerUpload, ClassPreviewCard } from './settings';
import { AnalyticsTab } from './analytics';

export function StreamTab({ group, posts, setPosts }: { group: GroupDetail; posts: StreamPost[]; setPosts: React.Dispatch<React.SetStateAction<StreamPost[]>> }) {
  const sorted = [...posts].sort((a, b) => (a.pinned ? -1 : 0) - (b.pinned ? -1 : 0));
  // Generated links come from whichever provider the tutor connected — Zoom
  // for some — so name it when we can tell. (An admin viewer can't, and gets
  // the default.)
  const connection = useVideoConnection(group.classFormat === 'physical' || group.meetingLinkMode === 'custom' ? null : group.tutorId);
  const videoLabel = group.classFormat === 'physical'
    ? 'In person'
    : group.meetingLinkMode === 'custom'
      ? 'Own link'
      : providerLabel(connection.status === 'connected' ? connection.provider : null);

  const togglePin = async (id: string) => {
    const post = posts.find(p => p.id === id);
    if (!post) return;
    const newPinned = !post.pinned;
    try {
      const res = await fetch(`/api/stream/post/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: newPinned }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to pin');
      setPosts(posts.map(p => p.id === id ? { ...p, pinned: newPinned } : p));
    } catch (e: any) {
      alert(e?.message ?? 'Failed to update pin');
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/stream/post/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Failed to delete');
      setPosts(posts.filter(p => p.id !== id));
    } catch (e: any) {
      alert(e?.message ?? 'Failed to delete post');
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr,280px] gap-6">
      <div className="space-y-4">
        <ClassPostComposer group={group} onPosted={(post) => setPosts((prev) => [post, ...prev])} />

        {sorted.length === 0 && <EmptyState icon={Bell} title="No posts yet" body="Start the conversation with an announcement or share a file." />}
        {sorted.map((p) => <StreamCard key={p.id} post={p} onPin={() => togglePin(p.id)} onRemove={() => remove(p.id)} />)}
      </div>

      <aside className="space-y-4">
        <SideCard title="Class info">
          <InfoRow label="Subject" value={group.subject} />
          <InfoRow label="Level" value={formatLevel(group.level)} />
          <InfoRow label="Video" value={videoLabel} />
          <InfoRow label="Status" value={group.status} />
        </SideCard>
        <SideCard title="Pinned">
          <ul className="space-y-2 text-sm">
            {sorted.filter((p) => p.pinned).map((p) => (
              <li key={p.id} className="flex items-start gap-2">
                <Pin className="size-3.5 text-rose-400 mt-0.5" />
                <span className="text-ink line-clamp-2">{p.title}</span>
              </li>
            ))}
            {sorted.filter((p) => p.pinned).length === 0 && <li className="text-xs text-muted-foreground">Nothing pinned yet.</li>}
          </ul>
        </SideCard>
      </aside>
    </div>
  );
}

export type ComposerKind = 'announcement' | 'attachment' | 'link';

export const COMPOSER_THEME: Record<ComposerKind, {
  label: string; icon: any; heading: string; desc: string; cta: string;
  pillActive: string; cardBorder: string; cardBg: string; iconBox: string; button: string; ring: string;
}> = {
  announcement: {
    label: 'Announcement', icon: Bell,
    heading: 'New announcement', desc: 'Broadcast a message to everyone in this class.', cta: 'Post announcement',
    pillActive: 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-200',
    cardBorder: 'border-amber-200', cardBg: 'bg-amber-50/50', iconBox: 'bg-amber-100 text-amber-600',
    button: 'bg-amber-500 hover:bg-amber-600 text-white', ring: 'focus:ring-amber-300',
  },
  attachment: {
    label: 'File attachment', icon: Paperclip,
    heading: 'Share files', desc: 'Drop worksheets, PDFs, or images for your class.', cta: 'Attach',
    pillActive: 'bg-violet-50 text-violet-700 border-violet-300 ring-1 ring-violet-200',
    cardBorder: 'border-violet-200', cardBg: 'bg-violet-50/50', iconBox: 'bg-violet-100 text-violet-600',
    button: 'bg-violet-500 hover:bg-violet-600 text-white', ring: 'focus:ring-violet-300',
  },
  link: {
    label: 'Link', icon: LinkIcon,
    heading: 'Share a link', desc: 'Paste a URL to a video, article, or resource.', cta: 'Share link',
    pillActive: 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-200',
    cardBorder: 'border-blue-200', cardBg: 'bg-blue-50/50', iconBox: 'bg-blue-100 text-blue-600',
    button: 'bg-blue-500 hover:bg-blue-600 text-white', ring: 'focus:ring-blue-300',
  },
};

export const COMPOSER_MAX_MB = 20;

export function ClassPostComposer({ group, onPosted }: { group: GroupDetail; onPosted: (post: StreamPost) => void }) {
  const { profile } = useProfile();
  const [kind, setKind] = useState<ComposerKind>('announcement');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => { setTitle(''); setMessage(''); setFiles([]); setUrl(''); setNote(''); setError(''); };

  const switchKind = (k: ComposerKind) => { setKind(k); setError(''); };

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const maxBytes = COMPOSER_MAX_MB * 1024 * 1024;
    const accepted: File[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      if (f.size > maxBytes) { setError(`${f.name} exceeds ${COMPOSER_MAX_MB} MB`); continue; }
      accepted.push(f);
    }
    if (accepted.length) { setError(''); setFiles((prev) => [...prev, ...accepted]); }
  };

  const canSubmit =
    kind === 'announcement' ? title.trim().length > 0 :
    kind === 'attachment'   ? files.length > 0 :
                              url.trim().length > 0;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      let post_type = 'announcement';
      let message_body = '';
      let attachment_urls: { file_name: string; file_url: string; file_type?: string; file_size_bytes?: number }[] | undefined;

      if (kind === 'announcement') {
        post_type = 'announcement';
        message_body = message.trim() ? `${title.trim()}\n${message.trim()}` : title.trim();
      } else if (kind === 'attachment') {
        if (!profile?.id) { setError('Still loading your account — try again in a moment.'); setSubmitting(false); return; }
        post_type = 'content';
        attachment_urls = [];
        for (const f of files) {
          attachment_urls.push(await uploadStreamAttachment(profile.id, group.id, f));
        }
        message_body = message.trim() || 'Shared files';
      } else {
        post_type = 'content';
        message_body = note.trim() ? `${note.trim()}\n${url.trim()}` : url.trim();
      }

      const res = await fetch(`/api/groups/${group.id}/stream/post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_type, message_body, attachment_urls }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Failed to post');
      const p = json.post;
      const optLines = message_body.split('\n').filter(Boolean).filter((l) => !URL_LINE_RE.test(l.trim()));
      onPosted({
        id: p?.id ?? `tmp-${Date.now()}`,
        kind,
        title: (optLines[0] ?? (kind === 'link' ? 'Shared a link' : '')).slice(0, 80),
        body: optLines.slice(1).join('\n').trim(),
        at: 'Just now',
        pinned: false,
        pendingApproval: false,
        attachmentName: kind === 'attachment' ? (p?.attachments?.[0]?.file_name ?? files[0]?.name) : undefined,
        attachmentUrl: kind === 'attachment' ? p?.attachments?.[0]?.file_url : undefined,
        linkUrl: kind === 'link' ? url.trim() : undefined,
      });
      reset();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to post');
    } finally {
      setSubmitting(false);
    }
  };

  const t = COMPOSER_THEME[kind];
  const HeadingIcon = t.icon;

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <div className="text-xs uppercase tracking-wider font-bold text-muted-foreground">Post to your class</div>

      <div className="flex items-center gap-2 flex-wrap">
        {(['announcement', 'attachment', 'link'] as ComposerKind[]).map((k) => {
          const th = COMPOSER_THEME[k];
          const Icon = th.icon;
          const active = kind === k;
          return (
            <button key={k} type="button" onClick={() => switchKind(k)}
              className={cn('inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition',
                active ? th.pillActive : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
              <Icon className="size-3.5" /> {th.label}
            </button>
          );
        })}
      </div>

      <div className={cn('rounded-xl border p-4 space-y-3', t.cardBorder, t.cardBg)}>
        <div className="flex items-start gap-3">
          <div className={cn('size-9 rounded-lg grid place-items-center shrink-0', t.iconBox)}>
            <HeadingIcon className="size-4" />
          </div>
          <div>
            <div className="font-semibold text-ink">{t.heading}</div>
            <div className="text-sm text-muted-foreground">{t.desc}</div>
          </div>
        </div>

        {kind === 'announcement' && (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title"
              className={cn('w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2', t.ring)} />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message to your students…"
              className={cn('w-full min-h-28 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2', t.ring)} />
          </>
        )}

        {kind === 'attachment' && (
          <>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
              className={cn('rounded-xl border-2 border-dashed grid place-items-center text-center px-4 py-8 cursor-pointer transition',
                dragActive ? 'border-violet-400 bg-violet-50' : 'border-violet-200 hover:border-violet-300 bg-white/40')}>
              <UploadCloud className="size-6 text-violet-500" />
              <div className="mt-2 text-sm font-semibold text-ink">
                Drag &amp; drop files here, or <span className="text-violet-600 underline">browse</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">PDF, DOCX, PNG, JPG up to {COMPOSER_MAX_MB} MB each</div>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <li key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-violet-200 bg-white text-xs">
                    <Paperclip className="size-3 text-violet-500" />
                    <span className="truncate max-w-[160px]">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="text-slate-400 hover:text-rose-500" aria-label="Remove">
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a message to go with these files…"
              className={cn('w-full min-h-20 px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2', t.ring)} />
          </>
        )}

        {kind === 'link' && (
          <>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">URL</label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/resource"
                  className={cn('w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2', t.ring)} />
              </div>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for your students"
              className={cn('w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2', t.ring)} />
          </>
        )}

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <div className="flex justify-end items-center gap-2 pt-1">
          <button type="button" onClick={reset} className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted">Cancel</button>
          <button type="button" onClick={submit} disabled={!canSubmit || submitting}
            className={cn('px-4 py-1.5 rounded-lg text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed', t.button)}>
            {submitting ? 'Posting…' : t.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StreamCard({ post, onPin, onRemove }: { post: StreamPost; onPin: () => void; onRemove: () => void }) {
  const meta: Record<StreamPost['kind'], { icon: any; cls: string; tag: string }> = {
    announcement: { icon: Bell,      cls: 'bg-amber-100 text-amber-700',   tag: 'Announcement' },
    attachment:   { icon: Paperclip, cls: 'bg-violet-100 text-violet-700', tag: 'Attachment' },
    link:         { icon: LinkIcon,  cls: 'bg-blue-100 text-blue-700',     tag: 'Link' },
  };
  const M = meta[post.kind] ?? { icon: Bell, cls: 'bg-muted text-muted-foreground', tag: post.kind };
  const Icon = M.icon;
  return (
    <div className={cn('rounded-2xl bg-card border p-5', post.pinned ? 'border-rose-200 ring-1 ring-rose-100' : 'border-border')}>
      <div className="flex items-start gap-3">
        <div className={cn('size-10 rounded-xl grid place-items-center shrink-0', M.cls)}><Icon className="size-4" /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{M.tag}</span>
            {post.pinned && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-100 text-rose-600">Pinned</span>}
          </div>
          <div className="mt-1 font-semibold text-ink">{post.title}</div>
          {post.body && <p className="text-sm text-muted-foreground mt-1">{post.body}</p>}
          {post.attachmentName && post.attachmentUrl && (
            <a
              href={post.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold hover:bg-muted">
              <Paperclip className="size-3.5" /> {post.attachmentName}
            </a>
          )}
          {post.attachmentName && !post.attachmentUrl && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold">
              <Paperclip className="size-3.5" /> {post.attachmentName}
            </div>
          )}
          {post.linkUrl && (
            <a href={post.linkUrl} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-xs font-semibold text-brand-deep hover:bg-brand/5">
              <ExternalLink className="size-3.5" /> {post.linkUrl}
            </a>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="text-[11px] text-muted-foreground">{post.at}</div>
            <div className="flex items-center gap-1">
              <button onClick={onPin} className="size-7 grid place-items-center rounded-md hover:bg-muted text-muted-foreground" title={post.pinned ? 'Unpin' : 'Pin'}>
                <Pin className={cn('size-3.5', post.pinned && 'fill-rose-400 text-rose-400')} />
              </button>
              <button onClick={onRemove} className="size-7 grid place-items-center rounded-md hover:bg-rose-50 text-rose-500" title="Delete">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------- Sessions ----------- */
// The Add-session form, its preview and its clash check live in
// components/tutor/classes/ScheduleSessionsModal, opened from ClassHubContent.

// Shown when a custom-mode class has no link. The server's 422 for the same
// case carries code 'no_class_link', which is what decides whether to offer
// "Add class link" — not the wording, which is free to change.
