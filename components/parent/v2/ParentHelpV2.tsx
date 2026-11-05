'use client';

/**
 * Help and support, new UI. Settings › "Help and support" and Billing ›
 * "Billing help" (which jumps to #billing).
 *
 * PROVISIONAL VISUALS AND COPY: no Figma frame. The answers are only things
 * the app itself enforces (the request window, the credits rules, self-pay,
 * the feedback quota), worded as the screens that enforce them word them. The
 * public help centre at /help still mentions WiPay and describes the student
 * flow, so none of its copy was carried over.
 */

import { useEffect, useState } from 'react';
import { Button, NavRow } from '@/components/ui';
import { DetailScreen } from './DetailScreen';

const SUPPORT = 'support@myitutor.com';

type QA = { q: string; a: string };

const SECTIONS: Array<{ id: string; title: string; items: QA[] }> = [
  {
    id: 'billing',
    title: 'Billing',
    items: [
      {
        q: 'When am I charged?',
        a: 'A class is paid monthly. Billing shows what each class costs, when the next payment is due, and anything that failed. Every payment has a receipt under Billing › Payment history and receipts.',
      },
      {
        q: 'A payment failed. What now?',
        a: 'Billing marks the class “Payment due” and shows a way to pay it. If anything there looks wrong, email us and include the receipt reference from Payment history.',
      },
      {
        q: 'Can I pay with iTutor credits?',
        a: 'Yes. Credits pay for a whole payment: one month of a class, or your next monthly payment on a subscription. They cannot pay part of a payment, and they cannot start a new subscription. Your balance is under Settings › Rewards.',
      },
      {
        q: 'Can my child pay for their own classes?',
        a: 'Only if you switch on self-pay on their page under Your children. It takes effect immediately, a security email goes to you, and changing your password turns it back off.',
      },
    ],
  },
  {
    id: 'requests',
    title: 'Requests and classes',
    items: [
      {
        q: 'My child asked to join a class. Where do I answer?',
        a: 'Classes › Waiting on you. Tap the request to approve, pay or decline. A reason you give when declining is sent to your child word for word.',
      },
      {
        q: 'Is the place held while I decide?',
        a: 'No. Another student can take the last place while a request waits, and a request for a 1:1 session closes two hours before it starts.',
      },
      {
        q: 'How do I ask a tutor how my child is doing?',
        a: 'Settings › Feedback. You can ask each of your child’s tutors once a month, and that request is shared with your child. You can message a tutor at any time.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    items: [
      {
        q: 'How do I link my child?',
        a: 'Your children › Link your child. Enter the email they use on iTutor; they accept from a link we send them.',
      },
      {
        q: 'How do I change my password?',
        a: 'Settings › Security.',
      },
    ],
  },
];

export default function ParentHelpV2() {
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = window.location.hash.replace('#', '');
    if (!id) return;
    const first = SECTIONS.find((s) => s.id === id)?.items[0];
    if (first) setOpen(`${id}:0`);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
  }, []);

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="Help">
      <section className="flex flex-col gap-ds-3 rounded-ds-card bw-hair border-border bg-surface-card p-ds-card">
        <div className="flex flex-col gap-ds-1">
          <h2 className="font-display text-[18px] font-extrabold text-ink">Talk to the iTutor team</h2>
          <p className="font-body text-[14px] text-ink-muted">
            Email us at {SUPPORT}. Include your child’s name and the class, and we will reply by email.
          </p>
        </div>
        <Button block size="lg" onClick={() => (window.location.href = `mailto:${SUPPORT}`)}>
          Email support
        </Button>
      </section>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="flex scroll-mt-ds-4 flex-col gap-ds-2">
          <h2 className="pt-ds-2 font-display text-[18px] font-extrabold text-ink">{s.title}</h2>
          {s.items.map((item, i) => {
            const key = `${s.id}:${i}`;
            const isOpen = open === key;
            return (
              <div key={key} className="rounded-ds-card bw-hair border-border bg-surface-card">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : key)}
                  className="flex w-full items-center justify-between gap-ds-3 border-0 bg-transparent p-ds-card text-left font-display text-[15px] font-extrabold text-ink cursor-pointer"
                >
                  {item.q}
                  <span className="shrink-0 font-display text-[20px] leading-none">{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen ? (
                  <p className="px-ds-card pb-ds-card font-body text-[14px] leading-[21px] text-ink">{item.a}</p>
                ) : null}
              </div>
            );
          })}
        </section>
      ))}

      <NavRow href="/parent/settings" title="Back to settings" meta="Notifications, security, payment methods" />
    </DetailScreen>
  );
}
