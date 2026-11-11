'use client';

/**
 * Help and support, new UI — frames `160:8395` (hub), `160:8462` (Contact
 * support), `160:8481` (Billing help), `160:8498` (Pause or cancel help) and
 * `160:6737` (How iTutor verifies). Settings › "Help and support"; Billing ›
 * "Billing help" opens the billing screen directly.
 *
 * The hub is the frame's four rows. Each opens its own screen under
 * /parent/help/*, with a back link to Help.
 *
 * Deviations from the frames:
 * - Hub: back link reads "Settings"; the frame puts "Help and support" beside
 *   the arrow. The question list that used to be this whole screen stays
 *   below the four rows as "More questions" — PROVISIONAL, no frame — because
 *   it is the only place several rules (credits, self-pay, request window)
 *   are written down for a parent. Its answers are only things the app
 *   enforces; the public /help centre still mentions WiPay, so none of its
 *   copy is used.
 * - Contact support: the frame's button says "Open Payments", a copy-paste
 *   slip on a screen about email. It is "Email support" here and opens a
 *   prefilled mailto (there is no support-ticket backend). The optional
 *   message box is PROVISIONAL. "Within one working day" is not promised,
 *   because nothing enforces it.
 * - Billing help / Pause or cancel help: the frames say "Payments"; the tab
 *   is called Billing, so the copy and buttons say Billing. The frame's child
 *   name is "your child".
 * - How iTutor verifies: the frame lists Identity, Qualifications and
 *   References. Only qualifications are checked today (a tutor uploads a
 *   CSEC/CAPE results slip and a reviewer checks it), so only that step is
 *   shown — the other two would tell parents about checks that do not
 *   happen. Its button goes back to Help, not "Back to teacher".
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, EnvelopeSimple, Pause, SealCheck, type Icon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { Button, DsIcon } from '@/components/ui';
import { DetailScreen } from './DetailScreen';

const SUPPORT = 'support@myitutor.com';

type QA = { q: string; a: string };

const SECTIONS: Array<{ id: string; title: string; items: QA[] }> = [
  {
    id: 'billing-faq',
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
        a: 'Yes. Credits pay for a whole payment: one month of a class, or your next monthly payment on a subscription. They cannot pay part of a payment, and they cannot start a new subscription. Your balance is under Account › Rewards.',
      },
      {
        q: 'Can my child pay for their own classes?',
        a: 'Only if you switch on self-pay on their page (Account › your child). It takes effect immediately, a security email goes to you, and changing your password turns it back off.',
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
        a: 'Account › Feedback. You can ask each of your child’s tutors once a month, and that request is shared with your child. You can message a tutor at any time.',
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
        a: 'Account › Security.',
      },
    ],
  },
];

const TOPICS: Array<{ href: string; icon: Icon; label: string; detail: string }> = [
  { href: '/parent/help/contact', icon: EnvelopeSimple, label: 'Contact support', detail: SUPPORT },
  { href: '/parent/help/verification', icon: SealCheck, label: 'How iTutor verifies teachers', detail: 'What we check' },
  { href: '/parent/help/billing', icon: CreditCard, label: 'Payments and billing', detail: 'Receipts, cards and failed payments' },
  { href: '/parent/help/pause-cancel', icon: Pause, label: 'Cancel or pause a class', detail: 'Manage a subscription' },
];

export default function ParentHelpV2() {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = window.location.hash.replace('#', '');
    if (!id) return;
    // Old links pointed at #billing; that is its own screen now.
    if (id === 'billing') {
      router.replace('/parent/help/billing');
      return;
    }
    const first = SECTIONS.find((s) => s.id === id)?.items[0];
    if (first) setOpen(`${id}:0`);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
  }, [router]);

  return (
    <DetailScreen backLabel="Settings" fallbackHref="/parent/settings" title="How can we help?">
      <div className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card">
        {TOPICS.map((t, i) => {
          const Glyph = t.icon;
          return (
            <button
              key={t.href}
              type="button"
              onClick={() => router.push(t.href)}
              className={cn(
                'flex w-full items-center gap-ds-3 border-x-0 border-b-0 bg-transparent py-ds-3 text-left cursor-pointer',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink',
                i > 0 ? 'bw-t-hair border-line-soft' : 'border-t-0'
              )}
            >
              <span className="shrink-0 text-ink">
                <Glyph size={22} aria-hidden />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-display text-[15px] font-extrabold leading-[19px] text-ink">{t.label}</span>
                <span className="truncate font-body text-[13px] text-ink-muted">{t.detail}</span>
              </span>
              <span className="shrink-0 text-ink">
                <DsIcon name="chevron" size={18} />
              </span>
            </button>
          );
        })}
      </div>

      {/* PROVISIONAL: no frame. The old help screen's questions, kept. */}
      <h2 className="pt-ds-4 font-display text-[20px] font-extrabold text-ink">More questions</h2>
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="flex scroll-mt-ds-4 flex-col gap-ds-2">
          <h3 className="pt-ds-2 font-display text-[16px] font-extrabold text-ink">{s.title}</h3>
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
    </DetailScreen>
  );
}

/** One help article: back to Help, a title, a paragraph, one action. */
function HelpArticle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <DetailScreen backLabel="Help" fallbackHref="/parent/help" title={title}>
      {children}
    </DetailScreen>
  );
}

const body = 'font-body text-[15px] leading-[24px] text-ink';

/** Contact support — frame `160:8462`. A prefilled mailto; no backend. */
export function ParentHelpContactV2() {
  const { profile } = useProfile();
  const [message, setMessage] = useState('');

  const send = () => {
    const name = profile?.display_name || profile?.full_name || '';
    const lines = [
      message.trim(),
      '',
      '---',
      name ? `Parent: ${name}` : null,
      profile?.email ? `Account email: ${profile.email}` : null,
    ].filter((l): l is string => l !== null);
    const subject = encodeURIComponent('Help with my iTutor parent account');
    window.location.href = `mailto:${SUPPORT}?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`;
  };

  return (
    <HelpArticle title="Contact support">
      <p className={body}>
        Email {SUPPORT} and the iTutor team will reply by email. Include your child’s name and the class.
      </p>
      {/* PROVISIONAL: no frame. Goes into the email body; nothing is stored. */}
      <label className="flex flex-col gap-[2px] rounded-ds-card bw-hair border-ink bg-surface-card px-ds-card py-ds-2">
        <span className="font-body text-[11px] font-extrabold uppercase tracking-[0.55px] text-ink-muted">
          Your message (optional)
        </span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="w-full resize-y border-0 bg-transparent p-0 font-body text-[15px] text-ink focus:outline-none"
        />
      </label>
      <Button size="lg" block="always" onClick={send}>
        Email support
      </Button>
    </HelpArticle>
  );
}

/** Billing help — frame `160:8481`. */
export function ParentHelpBillingV2() {
  const router = useRouter();
  return (
    <HelpArticle title="Payments and billing">
      <p className={body}>
        Classes are billed monthly. If a payment fails, you’ll see it on Home and Billing. Tap Fix payment to retry
        that class only. Receipts are in Payment history.
      </p>
      <Button size="lg" block="always" onClick={() => router.push('/parent/billing')}>
        Go to Billing
      </Button>
    </HelpArticle>
  );
}

/** Pause or cancel help — frame `160:8498`. */
export function ParentHelpPauseCancelV2() {
  const router = useRouter();
  return (
    <HelpArticle title="Cancel or pause a class">
      <p className={body}>
        Open Billing, choose the class and tap Pause or cancel. Pausing stops the next charge and you can resume any
        time. Cancelling stops all future payments and your child keeps access to the end of the paid month.
      </p>
      <Button size="lg" block="always" onClick={() => router.push('/parent/billing')}>
        Go to Billing
      </Button>
    </HelpArticle>
  );
}

/** How iTutor verifies — frame `160:6737`, trimmed to what is true (see header). */
export function ParentHelpVerifyV2() {
  const router = useRouter();
  return (
    <HelpArticle title="How we verify teachers">
      <ol className="flex flex-col rounded-ds-card bw-hair border-border bg-surface-card px-ds-card">
        <li className="flex items-start gap-ds-3 py-ds-3">
          <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[5px] bg-brand font-display text-[12px] font-extrabold text-ink">
            1
          </span>
          <span className="flex flex-col gap-[2px]">
            <span className="font-display text-[15px] font-extrabold text-ink">Qualifications</span>
            <span className="font-body text-[13px] leading-[19px] text-ink-muted">
              Tutors upload their CSEC or CAPE results slip, and an iTutor reviewer checks it before a subject shows
              as verified.
            </span>
          </span>
        </li>
      </ol>
      <Button size="lg" block="always" onClick={() => router.push('/parent/help')}>
        Back to help
      </Button>
    </HelpArticle>
  );
}
