'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { User, Bell, Lock, CreditCard, Users, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { supabase } from '@/lib/supabase/client';
import ParentShell from '@/components/parent/ParentShell';
import ParentV2Shell from '@/components/parent/v2/ParentV2Shell';
import ParentSettingsV2 from '@/components/parent/v2/ParentSettingsV2';
import { parentInitials } from '@/components/parent/v2/initials';
import { isNewUiEnabled } from '@/lib/featureFlags/newUi';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import ChildBillingControls from '@/components/parent/ChildBillingControls';
import NotificationPreferences from '@/components/parent/NotificationPreferences';
import BillingSection from '@/components/parent/BillingSection';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'household', label: 'Household', icon: Users },
  // The design kit puts billing INSIDE Settings rather than as its own
  // destination, so subscriptions and transactions live here.
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Lock },
] as const;

type Section = typeof SECTIONS[number]['id'];

/**
 * Settings — frame `160:7981`, and the Account tab's root under the new UI.
 *
 * NEW UI: the hub only, WITH the tab bar (it is a tab root now, QA handoff
 * §1). The old five-section switcher is gone from this path; every row opens
 * its own screen. Old `?section=` deep links are redirected to the screen
 * that replaced each section, so a bookmarked or emailed link still lands.
 *
 * FLAG OFF: unchanged — the old tabbed SettingsContent inside ParentShell.
 */
export default function ParentSettingsPage() {
  if (isNewUiEnabled()) return <SettingsV2Route />;
  return <ParentShell><SettingsContent /></ParentShell>;
}

/** Where each retired section lives now. Unknown sections fall to the hub. */
const SECTION_REDIRECTS: Record<string, string> = {
  profile: '/parent/profile',
  billing: '/parent/billing',
  notifications: '/parent/settings/notifications',
  security: '/parent/settings/security',
  household: '/parent/settings',
};

function SettingsV2Route() {
  // Suspense because useSearchParams opts the page into dynamic rendering
  // and Next asks for a boundary.
  return (
    <Suspense fallback={null}>
      <SettingsV2Inner />
    </Suspense>
  );
}

function SettingsV2Inner() {
  const router = useRouter();
  const { profile } = useProfile();
  const params = useSearchParams();
  const section = params.get('section');
  const target = section ? SECTION_REDIRECTS[section] ?? '/parent/settings' : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (target && target !== '/parent/settings') return null;
  return (
    <ParentV2Shell initials={parentInitials(profile)}>
      <ParentSettingsV2 />
    </ParentV2Shell>
  );
}

function SettingsContent() {
  const { profile } = useProfile();
  // Deep-linkable, so "Billing help" can land on Billing rather than
  // dropping the parent on Profile to find it themselves. Read from
  // window rather than useSearchParams: the latter forces a Suspense
  // boundary on this page for no benefit, since the value is only needed
  // for the first render.
  const [section, setSection] = useState<Section>(() => {
    if (typeof window === 'undefined') return 'profile';
    const want = new URLSearchParams(window.location.search).get('section');
    return SECTIONS.some((s) => s.id === want) ? (want as Section) : 'profile';
  });
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [children, setChildren] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name || profile.full_name || '');
    setPhone((profile as any).phone || '');
    // fetch linked children
    if (profile.id) {
      supabase.from('parent_child_links')
        .select('child_id, child:profiles!parent_child_links_child_id_fkey(id, full_name, display_name)')
        .eq('parent_id', profile.id)
        .then(({ data }) => {
          setChildren((data ?? []).map((l: any) => {
            const c = Array.isArray(l.child) ? l.child[0] : l.child;
            return { id: c?.id, name: c?.display_name || c?.full_name || 'Child' };
          }));
        });
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile?.id) return;
    setSaving(true);
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', profile.id);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogout = async () => {
    localStorage.clear(); sessionStorage.clear();
    await supabase.auth.signOut({ scope: 'local' });
    window.location.href = '/login';
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and household preferences</p>
      </div>

      <div className="grid lg:grid-cols-[220px_1fr] gap-6">
        <nav className="space-y-1">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button key={s.id} onClick={() => setSection(s.id)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition',
                  active ? 'bg-background border border-border text-ink' : 'text-muted-foreground hover:bg-background')}>
                <Icon className="size-4" />
                <span className="flex-1 text-left">{s.label}</span>
                <ChevronRight className={cn('size-3.5', active && 'text-brand-deep')} />
              </button>
            );
          })}
          <button onClick={() => setLogoutOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-coral hover:bg-coral-soft transition mt-2">
            Log out
          </button>
        </nav>

        <div className="rounded-2xl bg-background border border-border p-6 space-y-5">
          {section === 'profile' && (
            <>
              <div className="flex items-center gap-4 pb-5 border-b border-border">
                <div className="size-16 rounded-full bg-gradient-to-br from-brand to-brand-deep grid place-items-center text-[#0d2318] text-xl font-semibold">
                  {displayName.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-ink">{displayName || 'Parent'}</div>
                  <div className="text-sm text-muted-foreground">{profile?.email}</div>
                </div>
              </div>
              <Field label="Display name" value={displayName} onChange={setDisplayName} />
              <Field label="Email" value={profile?.email ?? ''} disabled />
              <Field label="Phone" value={phone} onChange={setPhone} />
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button onClick={handleSave} disabled={saving}
                  className="px-4 py-2 rounded-xl bg-brand text-[#0d2318] text-sm font-semibold hover:bg-brand-deep disabled:opacity-50">
                  {saving ? 'Saving…' : saved ? 'Saved!' : 'Save changes'}
                </button>
              </div>
            </>
          )}

          {section === 'household' && (
            <>
              <p className="text-sm text-muted-foreground">Children linked to your household. Each has their own student login.</p>
              <div className="space-y-2">
                {children.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground text-center">No children linked yet.</div>
                ) : children.map(c => (
                  <div key={c.id} className="p-3 rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-brand-soft text-brand-deep grid place-items-center font-bold text-sm">
                        {c.name.split(' ').map(n => n[0]).join('').slice(0,2)}
                      </div>
                      <div className="flex-1"><div className="font-semibold text-ink text-sm">{c.name}</div></div>
                    </div>
                    {/* §7 and §10.5: the approval gate, the spend limit and the
                        self-pay toggle. These APIs existed with nothing able to
                        reach them until now. */}
                    <ChildBillingControls childId={c.id} childName={c.name} />
                  </div>
                ))}
              </div>
            </>
          )}

          {section === 'billing' && <BillingSection />}

          {section === 'notifications' && (
            /* Replaces a decorative placeholder: four labels and the word
               "Email", with no toggles and nothing persisted. Those four
               categories did not match anything the platform sends either —
               "Monthly feedback reports" and "Suspension alerts" have no channel
               behind them. The real control offers only the six §10.6 categories,
               because a switch a parent turns on and then hears nothing from is
               worse than no switch. */
            <NotificationPreferences />
          )}

          {section === 'security' && (
            <>
              <Field label="Current password" type="password" />
              <Field label="New password" type="password" />
              <Field label="Confirm new password" type="password" />
              <div className="flex justify-end gap-2 pt-4 border-t border-border">
                <button className="px-4 py-2 rounded-xl bg-brand text-[#0d2318] text-sm font-semibold hover:bg-brand-deep">Update password</button>
              </div>
            </>
          )}
        </div>
      </div>

      <LogoutConfirmModal open={logoutOpen} onClose={() => setLogoutOpen(false)} onConfirm={handleLogout} role="parent" />
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', disabled }: { label: string; value?: string; onChange?: (v: string) => void; type?: string; disabled?: boolean }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink mb-1.5 block">{label}</label>
      <input type={type} value={value} onChange={e => onChange?.(e.target.value)} disabled={disabled}
        className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-60 disabled:cursor-not-allowed" />
    </div>
  );
}
