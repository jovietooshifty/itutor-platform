'use client';

/**
 * Review a child's request, as a bottom sheet over the Classes tab. Opened by
 * tapping a "Waiting on you" row, or by `/parent/my-classes?request=<id>` from
 * Home's "Review & pay" and from old /parent/approvals links (which redirect).
 *
 * This replaces the old /parent/approvals cards (the "Price as listed" box,
 * the yellow warning panel, the Review & pay / Decline buttons). The frames
 * draw this step as a bottom sheet; the layout here is PROVISIONAL because the
 * sheet's frame could not be re-read this pass.
 *
 * THE ACTIONS ARE THE OLD PAGE'S, UNCHANGED:
 * - 1:1 session: POST /api/parent/approvals/:id/approve → `free` (done) or
 *   `checkoutUrl` (go pay). `expired` → the two-hour message. Decline posts a
 *   reason that reaches the child word for word.
 * - Group class, free: POST /api/parent/class-requests/:id/approve. When the
 *   tutor also gates joins, the reply says so (`awaitingTutor`).
 * - Group class, priced: there is no "approve" that grants a paid seat (the
 *   server refuses it), so the button goes to the class page to choose the
 *   child and pay, exactly as before. `payment_required` from the server does
 *   the same.
 *
 * THE SEAT NOTICE. "No place is held" and the closing time always appear
 * together, on every pending-request surface. Never one without the other.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, SummaryRow, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { Sheet } from './Sheet';

export type SessionRequest = {
  kind: 'session';
  id: string;
  childName: string;
  tutorId?: string;
  tutorName: string;
  when: string;
  minutes?: number;
  priceWhenRequested: number;
  isFree: boolean;
  closesAt: string | null;
  closed: boolean;
};

export type ClassRequest = {
  kind: 'class';
  id: string;
  groupId: string;
  className: string;
  tutorName: string;
  childName: string;
  priceTtd: number;
  isFree: boolean;
  scheduleLabel: string | null;
  requiresTutorApproval?: boolean;
};

export type AnyRequest = SessionRequest | ClassRequest;

const TT = new Intl.NumberFormat('en-TT', { maximumFractionDigits: 2 });
const money = (n: number) => `TT$${TT.format(n)}`;

export function ParentRequestSheet({
  request,
  onClose,
  onSettled,
}: {
  request: AnyRequest | null;
  onClose: () => void;
  /** Called after an answer went through, with what to tell the parent. */
  onSettled: (message: string) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setDeclining(false);
    setReason('');
    setError(null);
    onClose();
  };

  if (!request) return null;

  const first = request.childName.split(' ')[0];
  const isSession = request.kind === 'session';
  const free = request.isFree;
  const price = isSession ? request.priceWhenRequested : request.priceTtd;
  const closed = isSession && request.closed;

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      if (request.kind === 'session') {
        const res = await fetch(`/api/parent/approvals/${request.id}/approve`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) {
          setError(
            json.message ??
              (json.error === 'expired'
                ? 'This request closed two hours before the session.'
                : 'That could not be approved.')
          );
          return;
        }
        if (json.free) {
          onSettled(json.message ?? 'Approved. No payment was involved.');
          close();
          return;
        }
        if (json.checkoutUrl) window.location.href = json.checkoutUrl as string;
        return;
      }

      if (!free) {
        router.push(`/parent/classes/${request.groupId}`);
        return;
      }
      const res = await fetch(`/api/parent/class-requests/${request.id}/approve`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.reason === 'payment_required' && json.groupId) {
          router.push(`/parent/classes/${json.groupId}`);
          return;
        }
        setError(json.error ?? 'That could not be answered.');
        return;
      }
      onSettled(
        json.awaitingTutor
          ? 'Approved. The tutor accepts who joins this class, so it is with them now.'
          : `Approved. ${first} is in the class.`
      );
      close();
    } catch {
      setError('Something went wrong. Nothing was charged.');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    setError(null);
    try {
      const url =
        request.kind === 'session'
          ? `/api/parent/approvals/${request.id}/decline`
          : `/api/parent/class-requests/${request.id}/decline`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          request.kind === 'session'
            ? json.error === 'expired'
              ? 'This request already closed.'
              : 'Could not decline that.'
            : json.error ?? 'That could not be answered.'
        );
        return;
      }
      onSettled(json.message ?? 'Declined.');
      close();
    } catch {
      setError('Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const title = isSession
    ? `${first} asked for a session with ${request.tutorName}`
    : `${first} wants to join ${request.className}`;

  const approveLabel = busy
    ? 'Working…'
    : free
      ? 'Approve'
      : isSession
        ? `Approve and pay ${money(price)}`
        : 'Choose and pay';

  return (
    <Sheet
      open
      onClose={close}
      title={title}
      footer={
        closed ? (
          <Button variant="outline" block size="lg" onClick={close}>
            Close
          </Button>
        ) : declining ? (
          <>
            <Button variant="danger" block size="lg" disabled={busy} onClick={decline}>
              {busy ? 'Sending…' : 'Send decline'}
            </Button>
            <Button variant="outline" block size="lg" onClick={() => { setDeclining(false); setReason(''); }}>
              Keep it waiting
            </Button>
          </>
        ) : (
          <>
            <Button block size="lg" disabled={busy} onClick={approve}>
              {approveLabel}
            </Button>
            <Button variant="outline" block size="lg" disabled={busy} onClick={() => setDeclining(true)}>
              Decline
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-wrap gap-ds-2">
        <Tag tone="outline">{isSession ? '1:1 session' : 'Group class'}</Tag>
        {closed ? <Tag tone="danger">Closed</Tag> : null}
      </div>

      <div className="flex flex-col rounded-ds-card bw-hair border-border px-ds-card py-ds-2">
        <SummaryRow label="For" value={request.childName} />
        <SummaryRow label="Tutor" value={request.tutorName} />
        {isSession ? (
          <SummaryRow
            label="When"
            value={request.minutes ? `${request.when} · ${request.minutes} min` : request.when}
          />
        ) : request.scheduleLabel ? (
          <SummaryRow label="Next session" value={request.scheduleLabel} />
        ) : null}
        <SummaryRow
          label={isSession && !free ? 'Price when asked' : 'Price'}
          value={free ? 'Free' : isSession ? money(price) : `${money(price)} /month`}
        />
      </div>

      <p className="font-body text-[14px] text-ink">
        {free
          ? 'No payment is involved. You are approving the enrolment itself.'
          : isSession
            ? 'Approving takes you to payment. The tutor’s current price may differ from when it was asked.'
            : 'You choose the child and pay on the class page. Nothing is charged until then.'}
      </p>

      {/* The seat notice: both halves, together. */}
      <div className="rounded-ds-card bg-surface-sunken p-ds-3">
        <p className="font-display text-[14px] font-extrabold text-ink">No place is held while you decide</p>
        <p className="font-body text-[13px] text-ink-muted">
          Another student can take the last place.
          {isSession
            ? request.closesAt
              ? ` The request closes ${request.closesAt}, two hours before the class starts.`
              : ' The request closes two hours before the class starts.'
            : ''}
          {!isSession && request.requiresTutorApproval
            ? ' The tutor also approves who joins, so your approval sends it on to them.'
            : ''}
        </p>
      </div>

      {closed ? (
        <p className="font-body text-[14px] text-ink-muted">
          This request closed before it was answered, so it can no longer be approved.
        </p>
      ) : null}

      {declining ? (
        <label
          className={cn(
            'flex flex-col gap-[2px] rounded-ds-card bw-hair border-border bg-surface-card px-ds-card py-ds-2',
            'focus-within:border-ink'
          )}
        >
          <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
            Reason (optional, sent to {first} word for word)
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Let’s talk about this one first."
            className="w-full border-0 bg-transparent p-0 font-body text-[15px] text-ink placeholder:text-ink-muted focus:outline-none"
          />
        </label>
      ) : null}

      {isSession && request.tutorId ? (
        <a
          href={`/parent/tutors/${request.tutorId}`}
          className="self-start font-display text-[14px] font-extrabold text-ink underline underline-offset-4"
        >
          See {request.tutorName}’s profile
        </a>
      ) : !isSession && free ? (
        <a
          href={`/parent/classes/${request.groupId}`}
          className="self-start font-display text-[14px] font-extrabold text-ink underline underline-offset-4"
        >
          See the class
        </a>
      ) : null}

      {error ? (
        <p role="alert" className="font-body text-[13px] font-extrabold text-danger">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}

export default ParentRequestSheet;
