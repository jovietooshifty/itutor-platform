'use client';

/**
 * Tutor Settings, new UI — /tutor/settings. Canvas d12 (desktop) and m30
 * (notification settings, phone). One screen serves both.
 *
 * ONLY SWITCHES THAT DO SOMETHING. What reaches a tutor today:
 * - Push on this device: a real browser subscription (browserPushService),
 *   the same calls as BrowserPushToggle.
 * - Tips and offers: profiles.marketing_consent via /api/account/marketing-
 *   consent (Customer.io reads it). Hidden if the environment lacks it.
 * - Email: lesson reminders, bookings and payments always go out. No tutor
 *   email is gated by a preference (the notification_preferences categories
 *   are parent-side, and the reminder opt-out skips students only), so this
 *   is a statement, not a switch. The old screen's six email switches wrote
 *   profiles.email_* columns that do not exist; none of them ever saved.
 *
 * Hidden by decision (2026-11-14), no columns behind them: WhatsApp, quiet
 * hours, "I usually reply", the availability note, who can contact you,
 * blocked people.
 *
 * Account rows open the existing sections (?section=profile / security)
 * inside the new shell; they keep their old look until redrawn. PROVISIONAL.
 */

import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bank, CaretRight, IdentificationCard, LockKey, SignOut, VideoCamera } from '@phosphor-icons/react';
import { Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import { Switch } from '@/components/parent/v2/accountKit';
import {
  isPushNotificationSupported,
  isPushSubscribed,
  requestNotificationPermission,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/lib/services/browserPushService';
import TutorV2Shell from './TutorV2Shell';
import { TutorAccountDetailsV2, TutorSecurityV2 } from './TutorAccountV2';
import { TutorShellEmbedded } from '@/components/tutor/TutorShell';

export default function TutorSettingsV2({ legacy }: { legacy: ReactNode }) {
  return (
    <Suspense fallback={<TutorV2Shell title="Settings">{null}</TutorV2Shell>}>
      <SettingsSwitch legacy={legacy} />
    </Suspense>
  );
}

function SettingsSwitch({ legacy }: { legacy: ReactNode }) {
  const section = useSearchParams()?.get('section');
  // Redrawn in the new UI (2026-11-16). Other sections keep the old look.
  if (section === 'profile') return <TutorAccountDetailsV2 />;
  if (section === 'security') return <TutorSecurityV2 />;
  if (section) {
    return (
      <TutorV2Shell title="Settings" width="wide">
        <div className="flex flex-col gap-ds-4">
          <Link
            href="/tutor/settings"
            className="ds-press -ml-ds-1 inline-flex min-h-[44px] items-center gap-[6px] self-start px-ds-1 font-body text-[15px] font-extrabold text-ink no-underline"
          >
            <span className="rotate-180" aria-hidden>
              <CaretRight size={18} weight="bold" />
            </span>
            Settings
          </Link>
          <TutorShellEmbedded.Provider value>{legacy}</TutorShellEmbedded.Provider>
        </div>
      </TutorV2Shell>
    );
  }
  return (
    <TutorV2Shell title="Settings">
      <SettingsBody />
    </TutorV2Shell>
  );
}

function SettingsBody() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const [push, setPush] = useState<{ supported: boolean; on: boolean; denied: boolean } | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [marketing, setMarketing] = useState<boolean | null>(null);
  const [marketingBusy, setMarketingBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') router.push('/login');
  }, [profile, loading, router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isPushNotificationSupported()) {
        if (!cancelled) setPush({ supported: false, on: false, denied: false });
        return;
      }
      const on = await isPushSubscribed().catch(() => false);
      if (!cancelled)
        setPush({
          supported: true,
          on,
          denied: typeof Notification !== 'undefined' && Notification.permission === 'denied',
        });
    })();
    fetch('/api/account/marketing-consent', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { marketing: null }))
      .then((j) => {
        if (!cancelled) setMarketing(typeof j.marketing === 'boolean' ? j.marketing : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const flash = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(null), 5000);
  }, []);

  const togglePush = async () => {
    if (!push?.supported || !profile?.id) return;
    setPushBusy(true);
    try {
      if (!push.on) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          setPush({ ...push, denied: typeof Notification !== 'undefined' && Notification.permission === 'denied' });
          flash('Notifications are blocked for this site. Allow them in your browser settings, then try again.');
          return;
        }
        const sub = await subscribeToPushNotifications(profile.id);
        setPush({ ...push, on: Boolean(sub), denied: false });
        if (!sub) flash('Could not register this device. Refresh and try again.');
      } else {
        await unsubscribeFromPushNotifications(profile.id);
        setPush({ ...push, on: false });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const toggleMarketing = async () => {
    if (marketing === null) return;
    const next = !marketing;
    setMarketingBusy(true);
    setMarketing(next);
    const res = await fetch('/api/account/marketing-consent', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketing: next }),
    }).catch(() => null);
    setMarketingBusy(false);
    if (!res?.ok) {
      setMarketing(!next);
      flash('That did not save. Try again.');
    }
  };

  const logout = async () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      /* storage can be blocked; signing out still works */
    }
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  return (
    <div className="flex flex-col gap-ds-5">
      <h1 className="ds-page-title m-0">Settings</h1>

      {notice ? (
        <p className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-3 text-[14px] font-bold text-ink" role="status">
          {notice}
        </p>
      ) : null}

      <Section title="Notifications">
        <SettingRow
          first
          title="Push notifications"
          detail={
            push === null
              ? '…'
              : !push.supported
                ? 'This browser cannot receive push. Use Chrome, Edge or Firefox, or install iTutor on iOS 16.4+.'
                : push.denied
                  ? 'Blocked in your browser settings for this site.'
                  : 'On this device only'
          }
        >
          {push?.supported ? (
            <Switch on={push.on} onToggle={() => void togglePush()} label="Push notifications on this device" busy={pushBusy || push.denied} />
          ) : null}
        </SettingRow>
        <SettingRow title="Email" detail={profile?.email ? `Lesson reminders, bookings and payments go to ${profile.email}` : 'Lesson reminders, bookings and payments'}>
          <Tag tone="outline">Always on</Tag>
        </SettingRow>
        {marketing !== null ? (
          <SettingRow title="Tips and offers" detail="Occasional news and offers from iTutor by email">
            <Switch on={marketing} onToggle={() => void toggleMarketing()} label="Tips and offers email" busy={marketingBusy} />
          </SettingRow>
        ) : null}
        <p className="m-0 bw-t-hair border-line-soft px-ds-card py-ds-3 text-[13px] text-ink-muted">
          Payment and booking changes are always on. Everything also appears in{' '}
          <Link href="/tutor/notifications" className="ds-link font-extrabold text-ink">
            your notifications
          </Link>
          .
        </p>
      </Section>

      <p className="m-0 text-[13px] text-ink-muted">
        Your contact details stay hidden from families. Keep bookings and payments on iTutor. Lesson links and resources are fine to share.
      </p>

      <Section title="Account">
        <LinkRow first href="/tutor/wallet?payout=1" icon={<Bank size={20} weight="bold" />} title="Payout account" detail="Where your earnings are sent" />
        <LinkRow href="/tutor/settings?section=profile" icon={<IdentificationCard size={20} weight="bold" />} title="Account details" detail="Username, email, school and country" />
        <LinkRow href="/tutor/settings?section=security" icon={<LockKey size={20} weight="bold" />} title="Password and security" detail="Change your password or delete your account" />
        <LinkRow href="/tutor/video-setup" icon={<VideoCamera size={20} weight="bold" />} title="Video setup" detail="Zoom or Google Meet for your lessons" />
        <button
          type="button"
          onClick={() => void logout()}
          className="ds-press flex min-h-[56px] w-full items-center gap-ds-3 bw-t-hair border-line-soft bg-transparent px-ds-card text-left cursor-pointer"
        >
          <span className="text-danger" aria-hidden>
            <SignOut size={20} weight="bold" />
          </span>
          <span className="flex-1 text-[15px] font-extrabold text-danger">Log out</span>
        </button>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-ds-2">
      <h2 className="m-0 text-[12px] font-extrabold uppercase tracking-[1.2px] text-ink-muted">{title}</h2>
      <div className="flex flex-col overflow-hidden rounded-ds-card bw-hair border-border bg-surface-card">{children}</div>
    </section>
  );
}

function SettingRow({ title, detail, children, first }: { title: string; detail?: string; children?: ReactNode; first?: boolean }) {
  return (
    <div className={cn('flex min-h-[64px] items-center gap-ds-3 px-ds-card py-ds-3', !first && 'bw-t-hair border-line-soft')}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-extrabold text-ink">{title}</div>
        {detail ? <div className="break-words text-[13px] text-ink-muted">{detail}</div> : null}
      </div>
      {children}
    </div>
  );
}

function LinkRow({ href, icon, title, detail, first }: { href: string; icon: ReactNode; title: string; detail?: string; first?: boolean }) {
  return (
    <Link
      href={href}
      className={cn('ds-press flex min-h-[56px] items-center gap-ds-3 px-ds-card py-ds-3 text-ink no-underline', !first && 'bw-t-hair border-line-soft')}
    >
      <span aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold">{title}</span>
        {detail ? <span className="block text-[13px] text-ink-muted">{detail}</span> : null}
      </span>
      <CaretRight size={16} weight="bold" className="shrink-0" aria-hidden />
    </Link>
  );
}
