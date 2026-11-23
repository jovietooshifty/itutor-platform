'use client';

// "Your access was approved — pay now to join."
//
// On a paid class the tutor's approval is permission to pay, not a seat. The
// student (or the parent who pays for them) is emailed when it happens; this is
// the same news on the dashboard, with the button that takes the payment, so an
// approval is never left sitting unseen while the place goes to someone else.
// Renders nothing when there is nothing to pay for.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CreditCard } from 'lucide-react';

type Item = {
  groupId: string;
  className: string;
  priceMonthly: number | null;
  studentId: string;
  studentName: string | null;
};

export default function ApprovedAwaitingPaymentCard({ variant }: { variant: 'student' | 'parent' }) {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/classes/awaiting-payment', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j) => { if (!cancelled) setItems(Array.isArray(j?.items) ? j.items : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const who = variant === 'parent' ? (it.studentName ?? 'Your child') : null;
        const price = it.priceMonthly && it.priceMonthly > 0 ? `TT$${it.priceMonthly.toFixed(0)}/month` : null;
        const href = variant === 'parent' ? `/parent/classes/${it.groupId}` : `/student/explore/${it.groupId}`;
        return (
          <div
            key={`${it.groupId}:${it.studentId}`}
            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4"
          >
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <CheckCircle2 className="size-5 text-emerald-700 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-ink text-sm">
                  {who ? `${who}'s access was approved` : 'Your access was approved'}
                </div>
                <div className="text-xs text-muted-foreground">
                  The tutor accepted the request to join <span className="font-medium text-ink">{it.className}</span>.
                  {' '}Pay now to {who ? 'confirm their place' : 'join the class'}{price ? ` · ${price}` : ''}.
                </div>
              </div>
            </div>
            <Link
              href={href}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 shrink-0"
            >
              <CreditCard className="size-4" /> Pay now
            </Link>
          </div>
        );
      })}
    </div>
  );
}
