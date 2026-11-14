'use client';

/**
 * Messages, new UI — the parent's OWN thread with each tutor who teaches one of
 * their children (decision 19 / decision 24: separate from the child's thread,
 * which the parent reads read-only on the child page).
 *
 * PROVISIONAL VISUALS: there is no Figma frame for Messages. Built from system
 * parts (DetailScreen's back link, NavRow, Button) so it reads as the same app.
 *
 * NAVIGATION. Messages lives under Account, so the list's back link goes to
 * Settings. On a phone a thread replaces the list, and its back link returns to
 * the list (QA 10 Nov: the thread had no way back). From lg up the list and the
 * thread sit side by side and only the Settings link is needed.
 *
 * WHO A PARENT CAN MESSAGE. Only tutors who teach one of their children
 * (/api/parent/tutors — "a parent cannot open a thread with an arbitrary
 * tutor"). Row-level security on `conversations` would let any account open a
 * conversation with anyone; the relationship rule is the product's, enforced
 * here and on the tutor profile, which no longer offers "Message" to a tutor
 * with no relationship. A deep link (?tutor=) to such a tutor says why rather
 * than leaving "Pick a tutor" on screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useProfile } from '@/lib/hooks/useProfile';
import { getMessages, getOrCreateConversation, sendMessage } from '@/lib/services/notificationService';
import { Button, NavRow } from '@/components/ui';
import { DsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import ParentV2Shell from './ParentV2Shell';
import { parentInitials } from './initials';
import { EmptyCard } from './DetailScreen';
import { useWide } from './useWide';

type Tutor = {
  id: string;
  name: string;
  avatar: string | null;
  verified: boolean;
  teaches: string[];
  via: string;
};
type Msg = { id: string; content: string; sender_id: string; created_at: string };

const TZ = 'America/Port_of_Spain';

function Avatar({ tutor, size = 44 }: { tutor: Tutor; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-surface-sunken font-display text-[15px] font-extrabold text-ink"
    >
      {tutor.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={tutor.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        tutor.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ds-link flex items-center gap-ds-2 self-start border-0 bg-transparent p-0 font-display text-[16px] font-extrabold text-ink cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
    >
      <span className="rotate-180">
        <DsIcon name="chevron" size={20} />
      </span>
      {label}
    </button>
  );
}

export default function ParentMessagesV2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile } = useProfile();
  const wide = useWide();
  const [tutors, setTutors] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTutor, setOpenTutor] = useState<Tutor | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/parent/tutors', { cache: 'no-store' });
        if (res.ok) setTutors((await res.json()).tutors ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openThread = useCallback(
    async (tutor: Tutor) => {
      if (!profile?.id) return;
      setOpenTutor(tutor);
      setThreadLoading(true);
      setThreadError(null);
      setMessages([]);
      setConversationId(null);
      try {
        // Created on first open, not up front: a parent who never writes to a
        // tutor should not accumulate empty conversations.
        const convId = await getOrCreateConversation(profile.id, tutor.id);
        setConversationId(convId);
        setMessages((await getMessages(convId, profile.id)) as unknown as Msg[]);
      } catch {
        setThreadError('This conversation could not be opened. Try again.');
      } finally {
        setThreadLoading(false);
      }
    },
    [profile?.id]
  );

  // ?tutor=<id> opens that thread directly ("Message tutor" on a profile, or
  // the link under a child's read-only thread).
  const deepLinkTutor = searchParams.get('tutor');
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !deepLinkTutor || loading || !profile?.id) return;
    deepLinked.current = true;
    const match = tutors.find((t) => t.id === deepLinkTutor);
    if (match) void openThread(match);
    else setUnreachable(deepLinkTutor);
  }, [deepLinkTutor, tutors, loading, profile?.id, openThread]);

  // From lg up, open the first thread so the right pane is never blank.
  useEffect(() => {
    if (wide && !openTutor && !deepLinkTutor && tutors.length > 0 && profile?.id) void openThread(tutors[0]);
  }, [wide, openTutor, deepLinkTutor, tutors, profile?.id, openThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !conversationId || !profile?.id) return;
    setSending(true);
    setThreadError(null);
    try {
      await sendMessage(conversationId, profile.id, text);
      setMessages((await getMessages(conversationId, profile.id)) as unknown as Msg[]);
      setDraft('');
    } catch (e) {
      setThreadError(e instanceof Error && e.message ? e.message : 'That did not send. Try again.');
    } finally {
      setSending(false);
    }
  };

  const backToList = () => {
    setOpenTutor(null);
    setConversationId(null);
    setMessages([]);
    // Drop ?tutor= so a refresh lands on the list, not back in the thread.
    if (deepLinkTutor) router.replace('/parent/messages');
  };

  const showThreadOnly = !wide && openTutor !== null;

  const list = (
    <div className="flex min-w-0 flex-col gap-ds-2">
      {unreachable ? (
        <EmptyCard
          title="You can’t message this tutor yet"
          body="You can message a tutor once one of your children is taught by them. Until then, your child can ask them anything from their own account."
        />
      ) : null}
      {tutors.length === 0 ? (
        <EmptyCard
          title="No tutors yet"
          body="Once one of your children is taught by a tutor, you can message them here."
        />
      ) : (
        tutors.map((t) => (
          <NavRow
            key={t.id}
            onClick={() => {
              setUnreachable(null);
              void openThread(t);
            }}
            chevron={!wide}
            className={cn(wide && openTutor?.id === t.id && 'border-ink shadow-edge-ink')}
            tile={<Avatar tutor={t} />}
            title={t.name}
            meta={t.teaches.length > 0 ? `Teaches ${t.teaches.join(', ')}` : t.via}
          />
        ))
      )}
    </div>
  );

  const thread = openTutor ? (
    <div className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card">
      <div className="flex items-center gap-ds-3 bw-b-hair border-line-soft p-ds-card">
        <Avatar tutor={openTutor} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-extrabold text-ink">{openTutor.name}</p>
          <p className="truncate font-body text-[13px] text-ink-muted">
            {openTutor.teaches.length > 0 ? `Teaches ${openTutor.teaches.join(', ')}` : openTutor.via}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => router.push(`/parent/tutors/${openTutor.id}`)}>
          Profile
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-ds-2 overflow-y-auto bg-surface-page p-ds-card">
        {threadLoading ? (
          <div className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" aria-busy />
        ) : messages.length === 0 ? (
          <p className="py-ds-8 text-center font-body text-[13px] text-ink-muted">
            No messages yet. Anything you send here goes to {openTutor.name.split(' ')[0]} only. Your child does not
            see this thread.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === profile?.id;
            return (
              <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className="max-w-[82%]">
                  <div
                    className={cn(
                      'whitespace-pre-line rounded-ds-card px-ds-3 py-ds-2 font-body text-[14px] leading-[20px] text-ink',
                      mine ? 'bg-brand' : 'bw-hair border-border bg-surface-card'
                    )}
                  >
                    {m.content}
                  </div>
                  <p className={cn('mt-[2px] font-body text-[12px] text-ink-muted', mine ? 'text-right' : 'text-left')}>
                    {new Date(m.created_at).toLocaleString('en-TT', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: TZ,
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {threadError ? (
        <p role="alert" className="px-ds-card pt-ds-2 font-body text-[13px] font-extrabold text-danger">
          {threadError}
        </p>
      ) : null}
      <form
        className="flex items-end gap-ds-2 bw-t-hair border-line-soft p-ds-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="parent-message-draft">
          Message {openTutor.name.split(' ')[0]}
        </label>
        <input
          id="parent-message-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${openTutor.name.split(' ')[0]}…`}
          className="min-w-0 flex-1 rounded-ds-card bw-hair border-border bg-surface-card px-ds-3 py-ds-2 font-body text-[15px] text-ink placeholder:text-ink-muted focus:outline focus:outline-2 focus:outline-ink"
        />
        <Button type="submit" size="md" variant="primary" disabled={sending || !draft.trim() || !conversationId}>
          {sending ? 'Sending…' : 'Send'}
        </Button>
      </form>
    </div>
  ) : wide ? (
    <EmptyCard title="Pick a tutor" body="Choose a conversation on the left." />
  ) : null;

  return (
    <ParentV2Shell initials={parentInitials(profile)} nav={false} width="wide" title="Messages">
      <div className="flex flex-col gap-ds-4">
        {showThreadOnly ? (
          <BackLink label="Messages" onClick={backToList} />
        ) : (
          <BackLink label="Settings" onClick={() => router.push('/parent/settings')} />
        )}
        {!showThreadOnly ? <h1 className="ds-page-title">Messages</h1> : null}
        {!showThreadOnly ? (
          <p className="-mt-ds-2 font-body text-[13px] text-ink-muted">
            Your own conversation with each tutor. Your child’s conversations are on their page, to read only.
          </p>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-ds-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-ds-card bg-surface-sunken" />
            ))}
          </div>
        ) : wide ? (
          <div className="grid grid-cols-[minmax(0,360px)_minmax(0,1fr)] items-start gap-ds-5">
            {list}
            {thread}
          </div>
        ) : showThreadOnly ? (
          thread
        ) : (
          list
        )}
      </div>
    </ParentV2Shell>
  );
}
