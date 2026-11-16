'use client';

/**
 * Tutor Messages, new UI — /tutor/messages and /tutor/messages/[id].
 * Canvas: m14 (inbox), m16 (chat), d05 (desktop three-pane).
 *
 * Built from StudentMessagesV2 (same parts, same behaviour) so the two read as
 * one app. KEPT FROM THE OLD PAGES (app/tutor/messages*, ConversationView):
 * conversation list with unread counts and search over name + last message;
 * mark-as-read on open; realtime INSERT subscription for the open thread; text,
 * file/image and voice-note attachments; the message-request accept/decline
 * states (they only apply between two students, so a tutor never sees them,
 * but they cost nothing to keep).
 *
 * FROM THE DESIGN, ON REAL DATA (/api/tutor/messages/context):
 * - Filters All / Chats / Enquiries / Needs action. An enquiry is a student or
 *   parent with no class, join request or 1:1 booking with this tutor (a
 *   parent counts through a linked child). "Needs action" = a booking request,
 *   a join request, a failed / overdue / pending payment, or a booking waiting
 *   on a parent.
 * - Status chip per row ("New enquiry", "Payment failed", "Awaiting parent"…).
 * - "About <class>" at the top of a thread started from a class page
 *   (conversations.group_context_id).
 * - Desktop from 1280px: a third pane with who the person is, their classes,
 *   the status and a link to act on it.
 *
 * NOT BUILT (owner decision 2026-11-14): the composer "+" and every offer card
 * (m17, m32–m36) — chat offers have no backend yet; the "Offer sent" chip;
 * "Block or report" (blocked people are hidden with the other settings that
 * have no columns). The design's "Your contact details stay hidden" line is not
 * shipped: nothing in messaging hides contact details today.
 *
 * LAYOUT. Phone and tablet: list and thread are separate views; the thread's
 * composer is pinned through the shell's bottomBar. From 1024px list + thread
 * side by side; from 1280px the context pane joins them. The address follows
 * the open thread with history.replaceState, so a refresh reopens it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CaretLeft,
  ChatsCircle,
  MagnifyingGlass,
  Microphone,
  Paperclip,
  PaperPlaneRight,
  X,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import {
  acceptConversationRequest,
  declineConversationRequest,
  getConversations,
  getConversationWithStatus,
  getMessages,
  markMessagesAsRead,
  sendMessage,
  subscribeToMessages,
  type ConversationWithStatus,
} from '@/lib/services/notificationService';
import type { ConversationWithParticipant, Message } from '@/lib/types/notifications';
import { getDisplayName } from '@/lib/utils/displayName';
import { getRelativeTime } from '@/lib/utils/calendar';
import { uploadMessageAttachment } from '@/lib/utils/messageAttachments';
import { useWide } from '@/components/parent/v2/useWide';
import type { MessageContext, MessagePerson } from '@/lib/tutor/messageContext';
import TutorV2Shell from './TutorV2Shell';

const TZ = 'America/Port_of_Spain';
const LIST_PATH = '/tutor/messages';

type Conv = ConversationWithParticipant;
type Filter = 'all' | 'chats' | 'enquiries' | 'action';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chats', label: 'Chats' },
  { id: 'enquiries', label: 'Enquiries' },
  { id: 'action', label: 'Needs action' },
];

/** Where the context pane's action link goes for each status. */
const TAG_ACTION: Record<string, { label: string; href: string }> = {
  'Booking request': { label: 'Review booking requests', href: '/tutor/bookings' },
  'Join request': { label: 'Review join requests', href: '/tutor/classes' },
};

function roleLine(p: MessagePerson | undefined): string | null {
  if (!p?.role) return null;
  const role = p.role.charAt(0).toUpperCase() + p.role.slice(1);
  return p.child && p.role === 'parent' ? `${role} · ${p.child}` : role;
}

function nameOf(c: Conv | undefined): string {
  return c ? getDisplayName(c.other_participant) : '';
}

function firstName(name: string): string {
  return name.split(' ')[0] || name;
}

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-TT', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  });
}

/** Only render storage URLs we can trust to be a plain https link. */
function safeUrl(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

/** Keep the browser address in step with the open thread without remounting the page. */
function setAddress(path: string) {
  if (typeof window === 'undefined' || window.location.pathname === path) return;
  window.history.replaceState(window.history.state, '', path);
}

function Avatar({ conv, size = 44 }: { conv: Conv; size?: number }) {
  const name = nameOf(conv);
  const src = safeUrl(conv.other_participant?.avatar_url ?? null);
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-surface-sunken font-display text-[14px] font-extrabold text-ink"
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-link flex items-center gap-ds-1 self-start border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink cursor-pointer focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-ink"
    >
      <CaretLeft size={20} weight="bold" aria-hidden />
      {label}
    </button>
  );
}

function CenterNote({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-ds-2 px-ds-4 py-ds-8 text-center">
      {icon ? <span className="text-ink-muted">{icon}</span> : null}
      <p className="font-display text-[16px] font-extrabold text-ink">{title}</p>
      {body ? <p className="max-w-[340px] font-body text-[13px] text-ink-muted">{body}</p> : null}
      {action}
    </div>
  );
}

function Attachment({ m }: { m: Message }) {
  const url = safeUrl(m.attachment_url);
  if (!url) return null;
  if (m.attachment_type === 'image') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={m.attachment_name ?? 'Image'} className="max-h-60 max-w-full rounded-ds-sm object-cover" />
      </a>
    );
  }
  if (m.attachment_type === 'voice') {
    return <audio controls preload="none" src={url} className="h-10 w-[240px] max-w-full" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-ds-2 font-extrabold text-ink underline underline-offset-2"
    >
      <Paperclip size={16} weight="bold" aria-hidden className="shrink-0" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{m.attachment_name || 'Attachment'}</span>
    </a>
  );
}

function fmtSecs(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function TutorMessagesV2({ initialConversationId }: { initialConversationId?: string }) {
  const router = useRouter();
  const { profile, loading: profileLoading } = useProfile();
  const wide = useWide();
  const me = profile?.id ?? null;

  const [conversations, setConversations] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [context, setContext] = useState<MessageContext | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ConversationWithStatus | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recSend = useRef(false);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const threadReq = useRef(0);

  // Tutors only, as the old pages enforced.
  useEffect(() => {
    if (profileLoading) return;
    if (!profile || profile.role !== 'tutor') router.push('/login');
  }, [profile, profileLoading, router]);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getConversations(me);
        if (!cancelled) setConversations(data);
      } catch (err) {
        console.error('Error loading conversations:', err);
        if (!cancelled) setListError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tutor/messages/context', { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: MessageContext };
        if (!cancelled && json.data) setContext(json.data);
      } catch {
        // Fail silent: without context the inbox still works, minus chips,
        // filter counts and the "About" line.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openThread = useCallback(
    async (id: string) => {
      if (!me) return;
      const req = ++threadReq.current;
      setOpenId(id);
      setAddress(`${LIST_PATH}/${id}`);
      setThreadLoading(true);
      setThreadError(null);
      setSendError(null);
      setMessages([]);
      setStatus(null);
      setDraft('');
      setFile(null);
      try {
        const [conv, msgs] = await Promise.all([getConversationWithStatus(id), getMessages(id, me)]);
        if (req !== threadReq.current) return;
        if (!conv || (conv.participant_1_id !== me && conv.participant_2_id !== me)) {
          setThreadError('This conversation could not be opened.');
          return;
        }
        setStatus(conv);
        setMessages(msgs);
        void markMessagesAsRead(id, me);
        setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
      } catch {
        if (req === threadReq.current) setThreadError('This conversation could not be opened. Try again.');
      } finally {
        if (req === threadReq.current) setThreadLoading(false);
      }
    },
    [me]
  );

  // Deep link (/tutor/messages/<id>) opens that thread once the list is in.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !initialConversationId || loading || !me) return;
    deepLinked.current = true;
    void openThread(initialConversationId);
  }, [initialConversationId, loading, me, openThread]);

  // From 1024px, open the newest thread so the right pane is not blank (the old
  // page also selected the first conversation).
  useEffect(() => {
    if (wide && !openId && !initialConversationId && !loading && conversations.length > 0) {
      void openThread(conversations[0].id);
    }
  }, [wide, openId, initialConversationId, loading, conversations, openThread]);

  // Realtime: new rows in the open thread.
  useEffect(() => {
    if (!openId || !me) return;
    const sub = subscribeToMessages(openId, (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === openId
            ? { ...c, last_message_at: m.created_at, last_message_preview: m.content || c.last_message_preview }
            : c
        )
      );
      if (m.sender_id !== me) void markMessagesAsRead(openId, me);
    });
    return () => {
      sub.unsubscribe();
    };
  }, [openId, me]);

  // Wide: scroll the thread pane only, so the page itself does not jump.
  // Phone: the thread is the page, so scroll the window to the last message.
  useEffect(() => {
    const pane = paneRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
    else bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, openId, threadLoading]);

  // Stop a recording (and its mic) if the tutor leaves the page mid-note.
  useEffect(
    () => () => {
      if (recTimer.current) clearInterval(recTimer.current);
      recSend.current = false;
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    },
    []
  );

  const refreshStatus = async (id: string) => {
    const conv = await getConversationWithStatus(id);
    if (conv && id === openId) setStatus(conv);
  };

  const deliver = async (text: string, attachment?: { blob: File | Blob; kind: 'image' | 'file' | 'voice' }) => {
    if (!openId || !me || sending) return;
    const id = openId;
    setSending(true);
    setSendError(null);
    try {
      let opts: Parameters<typeof sendMessage>[3];
      if (attachment) {
        const { url, name } = await uploadMessageAttachment(
          me,
          attachment.blob,
          attachment.kind,
          attachment.blob instanceof File ? attachment.blob.name : undefined
        );
        opts = { attachmentUrl: url, attachmentType: attachment.kind, attachmentName: name };
      }
      const row = await sendMessage(id, me, text, opts);
      setMessages((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
      const preview = text || (attachment?.kind === 'voice' ? '🎤 Voice note' : '📎 Attachment');
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === id ? { ...c, last_message_at: row.created_at, last_message_preview: preview } : c
        );
        return [...next].sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
      });
      if (!attachment || attachment.kind !== 'voice') {
        setDraft('');
        setFile(null);
      }
      await refreshStatus(id);
    } catch (e) {
      setSendError(e instanceof Error && e.message ? e.message : 'That did not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text && !file) return;
    void deliver(text, file ? { blob: file, kind: file.type.startsWith('image/') ? 'image' : 'file' } : undefined);
  };

  const startRecording = async () => {
    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunks.current = [];
      recSend.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size) recChunks.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimer.current) clearInterval(recTimer.current);
        setRecording(false);
        const blob = new Blob(recChunks.current, { type: 'audio/webm' });
        if (recSend.current && blob.size > 0) void deliver('', { blob, kind: 'voice' });
      };
      recorderRef.current = rec;
      rec.start();
      setRecSecs(0);
      setRecording(true);
      recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch {
      setSendError('Your microphone is not available. Check the browser’s permission and try again.');
    }
  };

  const stopRecording = (andSend: boolean) => {
    recSend.current = andSend;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const answerRequest = async (accept: boolean) => {
    if (!openId || !me) return;
    setRequestBusy(true);
    setSendError(null);
    try {
      if (accept) await acceptConversationRequest(openId, me);
      else await declineConversationRequest(openId, me);
      await refreshStatus(openId);
    } catch (e) {
      setSendError(e instanceof Error && e.message ? e.message : 'That did not work. Try again.');
    } finally {
      setRequestBusy(false);
    }
  };

  const backToList = () => {
    threadReq.current++;
    if (recording) stopRecording(false);
    setOpenId(null);
    setMessages([]);
    setStatus(null);
    setThreadError(null);
    setAddress(LIST_PATH);
  };

  const personOf = useCallback(
    (c: Conv | undefined): MessagePerson | undefined =>
      c?.other_participant?.id ? context?.people[c.other_participant.id] : undefined,
    [context]
  );

  const inFilter = useCallback(
    (c: Conv, f: Filter) => {
      if (f === 'all') return true;
      const p = personOf(c);
      if (f === 'enquiries') return Boolean(p?.enquiry);
      if (f === 'action') return Boolean(p?.needsAction);
      return !p?.enquiry; // chats: everyone who is not a first enquiry
    },
    [personOf]
  );

  const counts = useMemo(() => {
    const out = {} as Record<Filter, number>;
    for (const f of FILTERS) out[f.id] = conversations.filter((c) => inFilter(c, f.id)).length;
    return out;
  }, [conversations, inFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter(
      (c) =>
        inFilter(c, filter) &&
        (!q || nameOf(c).toLowerCase().includes(q) || (c.last_message_preview || '').toLowerCase().includes(q))
    );
  }, [conversations, query, filter, inFilter]);

  const openConv = conversations.find((c) => c.id === openId);
  const openPerson = personOf(openConv);
  const otherName = nameOf(openConv) || 'them';
  const otherRole =
    roleLine(openPerson) ??
    (status ? (status.participant_1_id === me ? status.participant_2_role : status.participant_1_role) : null);
  const aboutClass = openId ? context?.about[openId] ?? null : null;

  // Student↔student message requests (same rules as ConversationView).
  const isStudentPair =
    status?.status === 'PENDING' &&
    (status.participant_1_role ?? '').toLowerCase() === 'student' &&
    (status.participant_2_role ?? '').toLowerCase() === 'student';
  const amInitiator = status?.initiated_by_id === me;
  const showAccept = isStudentPair && !amInitiator;
  const showWaiting = isStudentPair && amInitiator;
  const declined = status?.status === 'DECLINED';
  const canChat = !threadError && !threadLoading && status !== null && (status.status == null || status.status === 'ACCEPTED');

  const threadOnly = !wide && openId !== null;

  /* ---------- pieces ---------- */

  const searchBox = (
    <label className="relative block">
      <span className="sr-only">Search messages</span>
      <MagnifyingGlass
        size={18}
        weight="bold"
        aria-hidden
        className="pointer-events-none absolute left-ds-3 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search messages"
        className="h-11 w-full rounded-ds-card bw-hair border-border bg-surface-card pl-[40px] pr-ds-3 font-body text-[15px] text-ink placeholder:text-ink-muted focus:[outline-style:solid] focus:outline-2 focus:outline-ink"
      />
    </label>
  );

  // m14 / d05: All · Chats · Enquiries · Needs action. Scrolls sideways on a
  // narrow phone; wraps in the narrow desktop list column. Counts appear once the context is in.
  const filterPills = (
    <div
      role="tablist"
      aria-label="Filter conversations"
      className="-mx-ds-1 flex gap-ds-2 overflow-x-auto px-ds-1 pb-[2px] [scrollbar-width:none] lg:flex-wrap lg:overflow-visible"
    >
      {FILTERS.map((f) => {
        const on = f.id === filter;
        const n = context ? counts[f.id] : null;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => setFilter(f.id)}
            className={cn(
              'ds-press inline-flex shrink-0 items-center gap-[6px] rounded-full bw-hair px-ds-3 py-[6px] font-body text-[13px] font-extrabold cursor-pointer',
              'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
              on ? 'border-ink bg-ink text-on-ink' : 'border-border bg-surface-card text-ink'
            )}
          >
            {f.label}
            {n !== null && (f.id === 'all' || n > 0) ? (
              <span className={cn('tabular-nums', on ? 'text-brand' : 'text-ink-muted')}>{n}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );

  const emptyFilter =
    filter === 'enquiries'
      ? 'No new enquiries. Students and parents who message you before joining a class or booking show up here.'
      : filter === 'action'
        ? 'Nothing needs you right now.'
        : filter === 'chats'
          ? 'No conversations with your students or their parents yet.'
          : 'No conversations.';

  const rows =
    filtered.length === 0 ? (
      <p className="px-ds-1 py-ds-4 font-body text-[13px] text-ink-muted">
        {query.trim() ? <>No conversations match “{query.trim()}”.</> : emptyFilter}
      </p>
    ) : (
      <ul className="flex flex-col gap-ds-2">
        {filtered.map((c) => {
          const unread = c.unread_count > 0;
          const active = wide && c.id === openId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void openThread(c.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'ds-press flex w-full items-center gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-3 text-left cursor-pointer',
                  'focus-visible:[outline-style:solid] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                  active && 'border-ink shadow-edge-ink'
                )}
              >
                <Avatar conv={c} />
                <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="flex items-baseline justify-between gap-ds-2">
                    <span className="min-w-0 truncate font-display text-[15px] font-extrabold text-ink">{nameOf(c)}</span>
                    {c.last_message_at ? (
                      <span className="shrink-0 font-body text-[12px] text-ink-muted">
                        {getRelativeTime(c.last_message_at)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center justify-between gap-ds-2">
                    <span
                      className={cn(
                        'min-w-0 truncate font-body text-[13px]',
                        unread ? 'font-extrabold text-ink' : 'text-ink-muted'
                      )}
                    >
                      {c.last_message_preview || 'No messages yet'}
                    </span>
                    {unread ? (
                      <span
                        className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-ds-full bg-danger px-[6px] font-body text-[11px] font-extrabold tabular-nums text-on-ink"
                        aria-label={`${c.unread_count} unread`}
                      >
                        {c.unread_count > 9 ? '9+' : c.unread_count}
                      </span>
                    ) : null}
                  </span>
                  {/* No status chip on the row (owner, 2026-11-16). The status
                      still drives the Needs action filter. */}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );

  const noConversations = (
    <div className="rounded-ds-card bw-hair border-border bg-surface-card">
      <CenterNote
        icon={<ChatsCircle size={36} weight="bold" aria-hidden />}
        title="No messages yet"
        body="When a student or parent messages you, the conversation shows up here. Share a class to get the first one."
        action={
          <Button className="mt-ds-2" variant="primary" onClick={() => router.push('/tutor/classes')}>
            Go to your classes
          </Button>
        }
      />
    </div>
  );

  const bubbles = (
    <>
      {threadLoading ? (
        <div className="flex flex-col gap-ds-2" aria-busy>
          <div className="h-12 w-3/5 animate-pulse rounded-ds-card bg-surface-sunken" />
          <div className="ml-auto h-12 w-1/2 animate-pulse rounded-ds-card bg-surface-sunken" />
          <div className="h-12 w-2/5 animate-pulse rounded-ds-card bg-surface-sunken" />
        </div>
      ) : threadError ? (
        <CenterNote title="Can’t open this conversation" body={threadError} />
      ) : messages.length === 0 ? (
        <CenterNote
          icon={<ChatsCircle size={32} weight="bold" aria-hidden />}
          title="No messages yet"
          body={`Say hello to ${firstName(otherName)}.`}
        />
      ) : (
        <ol className="flex flex-col gap-ds-2">
          {messages.map((m) => {
            const mine = m.sender_id === me;
            return (
              <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('flex max-w-[82%] min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'flex min-w-0 max-w-full flex-col gap-ds-2 rounded-ds-card px-ds-3 py-ds-2 font-body text-[14px] leading-[20px] text-ink',
                      mine ? 'rounded-br-ds-sm bg-brand' : 'rounded-bl-ds-sm bw-hair border-border bg-surface-card'
                    )}
                  >
                    <Attachment m={m} />
                    {m.content ? (
                      <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
                    ) : null}
                  </div>
                  <p className="mt-[2px] px-[2px] font-body text-[12px] text-ink-muted">{stamp(m.created_at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={bottomRef} />
    </>
  );

  const composer = !openId ? null : showAccept ? (
    <div className="flex flex-col gap-ds-2 p-ds-3">
      <p className="font-body text-[14px] text-ink">
        {firstName(otherName)} wants to message you. Accept to start chatting.
      </p>
      <div className="flex gap-ds-2">
        <Button size="sm" variant="primary" disabled={requestBusy} onClick={() => void answerRequest(true)}>
          Accept
        </Button>
        <Button size="sm" variant="outline" disabled={requestBusy} onClick={() => void answerRequest(false)}>
          Decline
        </Button>
      </div>
    </div>
  ) : showWaiting ? (
    <p className="p-ds-3 font-body text-[14px] text-ink-muted">
      Waiting for {firstName(otherName)} to accept your message request.
    </p>
  ) : declined ? (
    <p className="p-ds-3 font-body text-[14px] text-ink-muted">This message request was declined.</p>
  ) : !canChat ? null : recording ? (
    <div className="flex items-center gap-ds-2 p-ds-3">
      <button
        type="button"
        onClick={() => stopRecording(false)}
        aria-label="Discard voice note"
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-ds-full border-0 bg-surface-sunken text-ink cursor-pointer"
      >
        <X size={18} weight="bold" aria-hidden />
      </button>
      <p className="flex min-w-0 flex-1 items-center gap-ds-2 font-body text-[14px] font-extrabold text-ink" aria-live="polite">
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-ds-full bg-danger" aria-hidden />
        Recording {fmtSecs(recSecs)}
      </p>
      <Button size="md" variant="primary" onClick={() => stopRecording(true)}>
        <PaperPlaneRight size={18} weight="bold" aria-hidden />
        Send
      </Button>
    </div>
  ) : (
    <form
      className="flex flex-col gap-ds-2 p-ds-3"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {file ? (
        <div className="flex items-center gap-ds-2 self-start rounded-ds-sm bg-surface-sunken px-ds-2 py-ds-1 font-body text-[13px] text-ink">
          <Paperclip size={14} weight="bold" aria-hidden className="shrink-0" />
          <span className="max-w-[220px] truncate">{file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            aria-label="Remove attachment"
            className="flex border-0 bg-transparent p-0 text-ink cursor-pointer"
          >
            <X size={14} weight="bold" aria-hidden />
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-ds-2">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={sending}
          aria-label="Attach a file"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-ds-full border-0 bg-transparent text-ink cursor-pointer hover:bg-surface-sunken disabled:opacity-45"
        >
          <Paperclip size={20} weight="bold" aria-hidden />
        </button>
        <label className="sr-only" htmlFor="tutor-message-draft">
          Message {firstName(otherName)}
        </label>
        <textarea
          id="tutor-message-draft"
          rows={1}
          value={draft}
          disabled={sending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a new line. Never mid-IME composition.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Message ${firstName(otherName)}…`}
          className="max-h-32 min-h-[42px] min-w-0 flex-1 resize-none rounded-ds-card bw-hair border-border bg-surface-card px-ds-3 py-[10px] font-body text-[15px] leading-[20px] text-ink placeholder:text-ink-muted focus:[outline-style:solid] focus:outline-2 focus:outline-ink disabled:opacity-60"
        />
        {draft.trim() || file ? (
          <Button type="submit" size="md" variant="primary" disabled={sending} className="shrink-0 px-ds-3">
            <PaperPlaneRight size={18} weight="bold" aria-hidden />
            <span className="sr-only sm:not-sr-only">{sending ? 'Sending…' : 'Send'}</span>
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => void startRecording()}
            disabled={sending}
            aria-label="Record a voice note"
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-ds-full border-0 bg-transparent text-ink cursor-pointer hover:bg-surface-sunken disabled:opacity-45"
          >
            <Microphone size={20} weight="bold" aria-hidden />
          </button>
        )}
      </div>
    </form>
  );

  const sendErrorLine = sendError ? (
    <p role="alert" className="px-ds-3 pt-ds-2 font-body text-[13px] font-extrabold text-danger">
      {sendError}
    </p>
  ) : null;

  const threadHeader = openConv ? (
    <div className="flex min-w-0 items-center gap-ds-3">
      <Avatar conv={openConv} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[16px] font-extrabold text-ink">{otherName}</p>
        {otherRole ? (
          <p className="truncate font-body text-[13px] capitalize text-ink-muted">{otherRole}</p>
        ) : null}
      </div>
    </div>
  ) : null;

  // m16: "About <class>" when the thread was started from a class page, and a
  // plain note when this is someone's first contact.
  const aboutNote =
    openConv && (aboutClass || openPerson?.enquiry) ? (
      <div className="rounded-ds-card bg-surface-sunken px-ds-3 py-ds-2 font-body text-[13px] leading-[18px] text-ink">
        {aboutClass ? (
          <p>
            <span className="text-ink-muted">About </span>
            <span className="font-extrabold">{aboutClass}</span>
          </p>
        ) : null}
        {openPerson?.enquiry ? (
          <p className="text-ink-muted">Not in any of your classes or bookings yet.</p>
        ) : null}
      </div>
    ) : null;

  // d05 right pane (from 1280px): who this is and what, if anything, is pending.
  const tagAction = openPerson?.tag ? TAG_ACTION[openPerson.tag.label] : undefined;
  const contextPane = openConv ? (
    <aside
      aria-label={`About ${otherName}`}
      className="hidden min-h-0 min-w-0 flex-col gap-ds-4 overflow-y-auto rounded-ds-card bw-hair border-border bg-surface-card p-ds-card xl:flex"
    >
      <div className="flex flex-col items-center gap-ds-2 text-center">
        <Avatar conv={openConv} size={64} />
        <div className="min-w-0">
          <p className="font-display text-[17px] font-extrabold text-ink [overflow-wrap:anywhere]">{otherName}</p>
          {otherRole ? <p className="font-body text-[13px] capitalize text-ink-muted">{otherRole}</p> : null}
        </div>
      </div>
      <dl className="flex flex-col gap-ds-3 bw-t-hair border-line-soft pt-ds-4 font-body text-[14px]">
        <div className="flex flex-col gap-[2px]">
          <dt className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">
            {openPerson && openPerson.classes.length > 1 ? 'Classes' : 'Class'}
          </dt>
          <dd className="text-ink">
            {openPerson?.classes.length ? (
              openPerson.classes.map((n) => (
                <span key={n} className="block [overflow-wrap:anywhere]">
                  {n}
                </span>
              ))
            ) : (
              <span className="text-ink-muted">{context ? 'None yet' : '—'}</span>
            )}
          </dd>
        </div>
      </dl>
      {tagAction ? (
        <Link
          href={tagAction.href}
          className="ds-link self-start font-body text-[14px] font-extrabold text-ink underline underline-offset-2"
        >
          {tagAction.label}
        </Link>
      ) : null}
      <p className="mt-auto rounded-ds-card bg-surface-sunken p-ds-3 font-body text-[13px] leading-[18px] text-ink-muted">
        Keep bookings and payments on iTutor.
      </p>
    </aside>
  ) : null;

  /* ---------- layouts ---------- */

  const listSkeleton = (
    <div className="flex flex-col gap-ds-2" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" />
      ))}
    </div>
  );

  const listError_ = (
    <div className="rounded-ds-card bw-hair border-border bg-surface-card">
      <CenterNote title="Messages didn’t load" body="Check your connection and refresh the page." />
    </div>
  );

  let body: ReactNode;
  if (profileLoading || !profile || loading) {
    body = listSkeleton;
  } else if (listError) {
    body = listError_;
  } else if (threadOnly) {
    // Phone / tablet thread. The composer lives in the shell's bottomBar.
    body = (
      <div className="flex min-w-0 flex-col gap-ds-4">
        <BackLink label="Messages" onClick={backToList} />
        {threadHeader}
        {aboutNote}
        <div className="min-w-0">{bubbles}</div>
      </div>
    );
  } else if (conversations.length === 0) {
    body = (
      <div className="flex flex-col gap-ds-4">
        <h1 className="ds-page-title">Messages</h1>
        {noConversations}
      </div>
    );
  } else if (wide) {
    body = (
      <div className="flex flex-col gap-ds-4">
        <h1 className="ds-page-title">Messages</h1>
        <div className="grid h-[calc(100dvh-230px)] min-h-[520px] grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-ds-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,260px)]">
          <div className="flex min-h-0 min-w-0 flex-col gap-ds-3">
            {searchBox}
            {filterPills}
            <div className="min-h-0 flex-1 overflow-y-auto pb-ds-2 pr-[2px]">{rows}</div>
          </div>
          <section
            aria-label={openConv ? `Conversation with ${otherName}` : 'Conversation'}
            className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card"
          >
            {openId ? (
              <>
                <div className="bw-b-hair border-line-soft p-ds-card">
                  {threadHeader ?? <div className="h-10" />}
                </div>
                <div ref={paneRef} className="flex min-h-0 flex-1 flex-col gap-ds-3 overflow-y-auto bg-surface-page p-ds-card">
                  {aboutNote}
                  <div className="min-w-0">{bubbles}</div>
                </div>
                {sendErrorLine}
                {composer ? <div className="bw-t-hair border-line-soft">{composer}</div> : null}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <CenterNote
                  icon={<ChatsCircle size={36} weight="bold" aria-hidden />}
                  title="Pick a conversation"
                  body="Choose someone on the left to read and reply."
                />
              </div>
            )}
          </section>
          {contextPane ?? <div className="hidden xl:block" />}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex min-w-0 flex-col gap-ds-4">
        <h1 className="ds-page-title">Messages</h1>
        {searchBox}
        {filterPills}
        {rows}
      </div>
    );
  }

  const bottomBar =
    threadOnly && (composer || sendError) ? (
      <div className="bw-t-hair border-line-soft bg-surface-card pb-[env(safe-area-inset-bottom)]">
        {sendErrorLine}
        {composer}
      </div>
    ) : undefined;

  return (
    <TutorV2Shell width="wide" title="Messages" nav={!threadOnly} bottomBar={bottomBar}>
      {body}
    </TutorV2Shell>
  );
}
