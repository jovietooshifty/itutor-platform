'use client';

/**
 * Email + password log-in, and where the person lands afterwards.
 *
 * Shared by the old /login page and the new-UI LoginV2 screen so the routing
 * rules — admin homes, reviewers, the incomplete-profile bounce, the one-time
 * Finder backfill, `?redirect=` — exist exactly once. Returns where to go, or
 * a message to show; it never navigates itself.
 */

import { setRememberMePreference, createSupabaseClient } from '@/lib/supabase/client';
import { getAdminHomePath, isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';
import { safeRedirectPath } from '@/lib/utils/safeRedirect';

export type PasswordLoginResult =
  | { ok: true; to: string }
  | { ok: false; reason: 'credentials' | 'other'; message: string };

export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') return true;
  if (error instanceof Error && (error.message.includes('network') || error.message.includes('fetch'))) return true;
  return typeof navigator !== 'undefined' ? !navigator.onLine : false;
}

export async function passwordLogin({
  email,
  password,
  rememberMe,
  redirect,
}: {
  email: string;
  password: string;
  rememberMe: boolean;
  /** The raw `?redirect=` value; checked here, same-origin paths only. */
  redirect: string | null;
}): Promise<PasswordLoginResult> {
  try {
    setRememberMePreference(rememberMe);
    const supabaseClient = createSupabaseClient(rememberMe);

    const { data: authData, error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (signInError) {
      if (signInError.message.includes('Email not confirmed') || signInError.message.includes('not confirmed') || signInError.message.includes('verify your email')) {
        return { ok: true, to: `/verify-code?email=${encodeURIComponent(email)}` };
      }
      const isCredentials =
        signInError.message.includes('Invalid login credentials') || signInError.message.includes('credentials');
      return isCredentials
        ? { ok: false, reason: 'credentials', message: 'Incorrect email or password' }
        : { ok: false, reason: 'other', message: signInError.message };
    }

    if (!authData.user) return { ok: false, reason: 'other', message: 'Unable to log in. Please try again.' };

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles').select('*').eq('id', authData.user.id).maybeSingle();

    let profileData = profile;
    if (profileError || !profileData) {
      await fetch('/api/profile/ensure', { method: 'POST' }).catch(() => {});
      const { data: ensured, error: ensuredError } = await supabaseClient
        .from('profiles').select('*').eq('id', authData.user.id).maybeSingle();
      if (ensuredError || !ensured) return { ok: false, reason: 'other', message: 'Unable to fetch user profile.' };
      profileData = ensured;
    }

    if (!profileData.role) return { ok: true, to: '/signup/complete-role' };

    // Same-origin paths only — see lib/utils/safeRedirect. An unchecked
    // `?redirect=` here was an open redirect for anyone who signed in.
    const redirectUrl = safeRedirectPath(redirect);

    if (isEmailManagementOnlyAdmin(profileData.email)) return { ok: true, to: '/admin/emails' };
    if (redirectUrl) return { ok: true, to: redirectUrl };
    if (profileData.role === 'admin') return { ok: true, to: getAdminHomePath(profileData.email) };
    if (profileData.is_reviewer) return { ok: true, to: '/reviewer/dashboard' };

    // The one-time Finder backfill. It sits BELOW the redirect and admin
    // guards on purpose: a stated destination (QR code, deep link) wins.
    // Only asked for accounts never prompted; the gate is decided server-side
    // because FINDER_GATE_MODE must not be readable from the browser.
    const wantsFinder = async () => {
      if (profileData.finder_prompted_at) return false;
      try {
        const res = await fetch('/api/finder/gate');
        if (!res.ok) return false;
        const json = (await res.json()) as { prompt?: boolean };
        return json.prompt === true;
      } catch {
        return false;
      }
    };

    switch (profileData.role) {
      case 'student': {
        if (profileData.billing_mode === 'parent_required') return { ok: true, to: '/student/dashboard' };
        if (!profileData.form_level) return { ok: true, to: '/signup/complete-role' };
        if (await wantsFinder()) return { ok: true, to: '/find?trigger=login_backfill' };
        return { ok: true, to: '/student/dashboard' };
      }
      case 'parent': {
        if (await wantsFinder()) return { ok: true, to: '/find?trigger=login_backfill' };
        return { ok: true, to: '/parent/dashboard' };
      }
      case 'tutor':
        return { ok: true, to: '/tutor/dashboard' };
      default:
        return { ok: false, reason: 'other', message: 'Invalid user role.' };
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'other',
      message: isNetworkError(err) ? 'Connect to the Internet' : 'An unexpected error occurred. Please try again.',
    };
  }
}
