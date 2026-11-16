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
import { Button, Tag } from '@/components/ui';
import { DS_CARD, DS_INPUT, DS_LABEL, DS_PILL, DS_PILL_ON, DbSubject, LEVEL_OPTIONS, Tab, Subscriber, GroupMember, StreamPost, GroupSession, URL_LINE_RE, GroupDetail, classCapacity, SettingsHead, Toggle, Banner, EmptyState, SideCard, InfoRow, SettCard, SetField, InfoPop, MenuBtn, MomCard, StatCard, ChartCard, formatRelative } from './shared';
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

  const pinned = sorted.filter((p) => p.pinned);

  return (
    <div className="grid min-w-0 gap-ds-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-ds-4">
        <ClassPostComposer group={group} onPosted={(post) => setPosts((prev) => [post, ...prev])} />

        {sorted.length === 0 && <EmptyState icon={Bell} title="No posts yet" body="Start the conversation with an announcement or share a file." />}
        {sorted.map((p) => <StreamCard key={p.id} post={p} onPin={() => togglePin(p.id)} onRemove={() => remove(p.id)} />)}
      </div>

      <aside className="flex min-w-0 flex-col gap-ds-4">
        <SideCard title="Class info">
          <InfoRow label="Subject" value={group.subject} />
          <InfoRow label="Level" value={formatLevel(group.level)} />
          <InfoRow label="Video" value={videoLabel} />
          <InfoRow label="Status" value={group.status} />
        </SideCard>
        <SideCard title="Pinned">
          <ul className="m-0 flex list-none flex-col gap-ds-2 p-0">
            {pinned.map((p) => (
              <li key={p.id} className="flex min-w-0 items-start gap-ds-2 text-[14px]">
                <Pin className="mt-[3px] size-3.5 shrink-0 fill-ink text-ink" />
                <span className="line-clamp-2 min-w-0 font-extrabold text-ink [overflow-wrap:anywhere]">{p.title}</span>
              </li>
            ))}
            {pinned.length === 0 && <li className="text-[13px] text-ink-muted">Nothing pinned yet.</li>}
          </ul>
        </SideCard>
      </aside>
    </div>
  );
}

export type ComposerKind = 'announcement' | 'attachment' | 'link';

// Copy and icon per composer mode. The per-mode colour classes the old UI
// carried (amber / violet / blue) are gone: in the design system every mode
// uses the same card, inputs and button.
export const COMPOSER_THEME: Record<ComposerKind, {
  label: string; icon: any; heading: string; desc: string; cta: string;
}> = {
  announcement: {
    label: 'Announcement', icon: Bell,
    heading: 'New announcement', desc: 'Broadcast a message to everyone in this class.', cta: 'Post announcement',
  },
  attachment: {
    label: 'File attachment', icon: Paperclip,
    heading: 'Share files', desc: 'Drop worksheets, PDFs, or images for your class.', cta: 'Attach',
  },
  link: {
    label: 'Link', icon: LinkIcon,
    heading: 'Share a link', desc: 'Paste a URL to a video, article, or resource.', cta: 'Share link',
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
    <section className={cn(DS_CARD, 'flex min-w-0 flex-col gap-ds-4')}>
      <div className="flex flex-col gap-ds-3">
        <h3 className="m-0 font-display text-[17px] font-extrabold text-ink">Post to your class</h3>
        <div role="tablist" aria-label="Post type" className="flex flex-wrap items-center gap-ds-2">
          {(['announcement', 'attachment', 'link'] as ComposerKind[]).map((k) => {
            const th = COMPOSER_THEME[k];
            const Icon = th.icon;
            const active = kind === k;
            return (
              <button key={k} type="button" role="tab" aria-selected={active} onClick={() => switchKind(k)}
                className={cn(DS_PILL, active && DS_PILL_ON)}>
                <Icon className="size-3.5" /> {th.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-ds-3 bw-t-hair border-line-soft pt-ds-4">
        <div className="flex items-start gap-ds-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-ds-btn bg-surface-sunken text-ink">
            <HeadingIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-extrabold text-ink">{t.heading}</div>
            <div className="text-[14px] leading-5 text-ink-muted">{t.desc}</div>
          </div>
        </div>

        {kind === 'announcement' && (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title"
              aria-label="Announcement title" className={DS_INPUT} />
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a message to your students…"
              aria-label="Message" className={cn(DS_INPUT, 'min-h-28 resize-y')} />
          </>
        )}

        {kind === 'attachment' && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); addFiles(e.dataTransfer.files); }}
              className={cn('grid cursor-pointer place-items-center rounded-ds-card bw-bold bw-dashed px-ds-4 py-ds-8 text-center transition-colors',
                dragActive ? 'border-ink bg-brand/10' : 'border-border bg-surface-sunken hover:border-ink')}>
              <UploadCloud className="size-6 text-ink" />
              <div className="mt-ds-2 text-[14px] font-extrabold text-ink">
                Drag &amp; drop files here, or <span className="text-brand-edge underline">browse</span>
              </div>
              <div className="mt-ds-1 text-[13px] text-ink-muted">PDF, DOCX, PNG, JPG up to {COMPOSER_MAX_MB} MB each</div>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,image/*,application/pdf"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            {files.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-ds-2 p-0">
                {files.map((f, i) => (
                  <li key={i} className="inline-flex min-w-0 max-w-full items-center gap-[6px] rounded-ds-full bw-hair border-border bg-surface-card py-[4px] pl-ds-3 pr-[6px] text-[13px] font-extrabold text-ink">
                    <Paperclip className="size-3 shrink-0" />
                    <span className="min-w-0 max-w-[180px] truncate">{f.name}</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      className="grid size-6 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${f.name}`}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a message to go with these files…"
              aria-label="Message" className={cn(DS_INPUT, 'min-h-20 resize-y')} />
          </>
        )}

        {kind === 'link' && (
          <>
            <label className="flex flex-col gap-ds-1">
              <span className={DS_LABEL}>URL</span>
              <span className="relative block">
                <LinkIcon className="pointer-events-none absolute left-ds-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/resource"
                  inputMode="url" className={cn(DS_INPUT, 'pl-9')} />
              </span>
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for your students"
              aria-label="Note" className={DS_INPUT} />
          </>
        )}

        {error && <p role="alert" className="m-0 text-[13px] font-extrabold text-danger [overflow-wrap:anywhere]">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-ds-2 pt-ds-1">
          <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? 'Posting…' : t.cta}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function StreamCard({ post, onPin, onRemove }: { post: StreamPost; onPin: () => void; onRemove: () => void }) {
  const meta: Record<StreamPost['kind'], { icon: any; tag: string }> = {
    announcement: { icon: Bell,      tag: 'Announcement' },
    attachment:   { icon: Paperclip, tag: 'Attachment' },
    link:         { icon: LinkIcon,  tag: 'Link' },
  };
  const M = meta[post.kind] ?? { icon: Bell, tag: post.kind };
  const Icon = M.icon;
  const chip = 'mt-ds-3 inline-flex min-w-0 max-w-full items-center gap-ds-2 rounded-ds-btn bw-hair border-border bg-surface-sunken px-ds-3 py-[6px] text-[13px] font-extrabold text-ink';
  return (
    <article className={cn('rounded-ds-card bg-surface-card p-ds-card', post.pinned ? 'bw-bold border-ink' : 'bw-hair border-border')}>
      <div className="flex items-start gap-ds-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-ds-btn bg-surface-sunken text-ink"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-ds-2">
            <Tag tone="outline">{M.tag}</Tag>
            {post.pinned && <Tag tone="dark">Pinned</Tag>}
          </div>
          <div className="mt-ds-2 font-display text-[16px] font-extrabold leading-snug text-ink [overflow-wrap:anywhere]">{post.title}</div>
          {post.body && <p className="m-0 mt-ds-1 whitespace-pre-line text-[14px] leading-5 text-ink-muted [overflow-wrap:anywhere]">{post.body}</p>}
          {post.attachmentName && post.attachmentUrl && (
            <a
              href={post.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(chip, 'hover:border-ink')}>
              <Paperclip className="size-3.5 shrink-0" /> <span className="min-w-0 truncate">{post.attachmentName}</span>
            </a>
          )}
          {post.attachmentName && !post.attachmentUrl && (
            <div className={chip}>
              <Paperclip className="size-3.5 shrink-0" /> <span className="min-w-0 truncate">{post.attachmentName}</span>
            </div>
          )}
          {post.linkUrl && (
            <a href={post.linkUrl} target="_blank" rel="noreferrer"
              className={cn(chip, 'text-brand-edge hover:border-ink')}>
              <ExternalLink className="size-3.5 shrink-0" /> <span className="min-w-0 [overflow-wrap:anywhere]">{post.linkUrl}</span>
            </a>
          )}
          <div className="mt-ds-3 flex items-center justify-between gap-ds-2">
            <div className="text-[12px] font-bold text-ink-muted">{post.at}</div>
            <div className="flex items-center gap-ds-1">
              <button type="button" onClick={onPin} aria-pressed={!!post.pinned}
                className="grid size-9 place-items-center rounded-ds-sm text-ink hover:bg-surface-sunken"
                title={post.pinned ? 'Unpin' : 'Pin'} aria-label={post.pinned ? 'Unpin' : 'Pin'}>
                <Pin className={cn('size-4', post.pinned && 'fill-ink')} />
              </button>
              <button type="button" onClick={onRemove}
                className="grid size-9 place-items-center rounded-ds-sm text-danger hover:bg-danger/10"
                title="Delete" aria-label="Delete post">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ----------- Sessions ----------- */
// The Add-session form, its preview and its clash check live in
// components/tutor/classes/ScheduleSessionsModal, opened from ClassHubContent.

// Shown when a custom-mode class has no link. The server's 422 for the same
// case carries code 'no_class_link', which is what decides whether to offer
// "Add class link" — not the wording, which is free to change.
