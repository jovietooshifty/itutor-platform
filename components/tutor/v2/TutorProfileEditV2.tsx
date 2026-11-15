'use client';

/**
 * Tutor Edit profile, new UI — /tutor/profile/edit. Canvas m28.
 *
 * Saves what the old Settings › Account / Teaching sections saved for these
 * fields: profiles.display_name and profiles.bio (browser client, own row,
 * RLS). The photo uses the shared avatar uploader the student screen uses.
 *
 * Subjects are shown, not edited, here. A tutor's subject carries an hourly
 * rate (tutor_subjects.price_per_hour_ttd), and the one editor that keeps the
 * two together is Get listed; the row links there.
 *
 * The canvas counts the bio against 60 words. Nothing enforced a limit before
 * and existing bios run longer, so the count is advice: over 60 turns the
 * counter red but does not block the save.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera } from '@phosphor-icons/react';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { notifyCompletionUpdated } from '@/lib/hooks/useTutorCompletion';
import { supabase } from '@/lib/supabase/client';
import { parentInitials } from '@/components/parent/v2/initials';
import type { Area } from '@/lib/utils/imageCrop';
import TutorV2Shell from './TutorV2Shell';

const BIO_WORDS = 60;

const inputCls =
  'w-full rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] font-body text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-brand';

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="font-body text-[15px] font-extrabold text-ink">{label}</span>
      {children}
      {hint ? <span className="font-body text-[13px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

function words(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

export default function TutorProfileEditV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const { uploadAvatar, deleteAvatar, uploading } = useAvatarUpload(profile?.id ?? '');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [subjects, setSubjects] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'tutor') {
      router.push('/login');
      return;
    }
    setDisplayName(profile.display_name || profile.full_name || '');
    setBio(profile.bio || '');
  }, [profile, loading, router]);

  useEffect(() => {
    if (!profile?.id || profile.role !== 'tutor') return;
    let cancelled = false;
    supabase
      .from('tutor_subjects')
      .select('subjects(name, label)')
      .eq('tutor_id', profile.id)
      .then(({ data }) => {
        if (cancelled) return;
        setSubjects(
          (data ?? [])
            .map((r: any) => {
              const s = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
              return (s?.label || s?.name || '') as string;
            })
            .filter(Boolean)
        );
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.role]);

  const save = async () => {
    if (!profile) return;
    setError(null);
    if (!displayName.trim()) return setError('Add the name families will see.');
    setSaving(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: displayName.trim(), bio: bio.trim() || null })
      .eq('id', profile.id);
    setSaving(false);
    if (err) return setError(err.message);
    notifyCompletionUpdated();
    // useProfile caches the row; a full load is how the old screens picked up a change.
    window.location.href = '/tutor/profile';
  };

  const onAvatarUpload = async (imageSrc: string, area: Area) => {
    const r = await uploadAvatar(imageSrc, area);
    if (r.success) {
      setAvatarOpen(false);
      window.location.reload();
    } else setError(r.error || 'Failed to upload photo.');
  };
  const onAvatarRemove = async () => {
    const r = await deleteAvatar();
    if (r.success) {
      setAvatarOpen(false);
      window.location.reload();
    } else setError('Failed to remove photo.');
  };

  const count = words(bio);
  const dirty =
    !!profile &&
    (displayName.trim() !== (profile.display_name || profile.full_name || '').trim() || bio.trim() !== (profile.bio || '').trim());

  return (
    <TutorV2Shell
      title="Edit profile"
      nav={false}
      bottomBar={
        <div className="flex gap-ds-3 lg:hidden">
          <Button block="always" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-ds-4">
        <Link
          href="/tutor/profile"
          className="ds-press -ml-ds-1 inline-flex min-h-[44px] items-center gap-[6px] self-start px-ds-1 font-body text-[15px] font-extrabold text-ink no-underline"
        >
          <ArrowLeft size={20} weight="bold" aria-hidden /> Profile
        </Link>
        <h1 className="ds-page-title m-0">Edit profile</h1>

        {loading || !profile ? (
          <div className="h-[320px] animate-pulse rounded-ds-card bg-surface-sunken" aria-busy />
        ) : (
          <>
            <div className="flex items-center gap-ds-3">
              <span className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-ds-full bg-brand font-display text-[24px] font-extrabold text-ink">
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="size-full object-cover" />
                ) : (
                  parentInitials(profile)
                )}
              </span>
              <div className="flex flex-col gap-[2px]">
                <span className="text-[15px] font-extrabold text-ink">Profile photo</span>
                <button
                  type="button"
                  onClick={() => setAvatarOpen(true)}
                  className="ds-link inline-flex items-center gap-[6px] self-start border-0 bg-transparent p-0 text-[15px] font-extrabold text-brand-edge cursor-pointer"
                >
                  <Camera size={18} weight="bold" aria-hidden /> {profile.avatar_url ? 'Change' : 'Add a photo'}
                </button>
              </div>
            </div>

            <Field label="Display name" hint="Families see this on your profile and classes.">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={cn(inputCls, 'h-[52px]')}
                autoComplete="name"
              />
            </Field>

            <div className="flex flex-col gap-[6px]">
              <span className="font-body text-[15px] font-extrabold text-ink">Subjects</span>
              <div className="flex flex-col gap-ds-2 rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] py-ds-3">
                <span className="text-[15px] text-ink">
                  {subjects === null ? '…' : subjects.length ? subjects.join(', ') : 'No subjects yet'}
                </span>
                <Link href="/tutor/get-listed" className="ds-link self-start text-[14px] font-extrabold text-brand-edge">
                  Change subjects and rates
                </Link>
              </div>
            </div>

            <Field
              label="Bio"
              hint={
                <span className={cn(count > BIO_WORDS && 'font-extrabold text-danger')}>
                  {count} / {BIO_WORDS} words{count > BIO_WORDS ? ' · shorter bios get read' : ''}
                </span>
              }
            >
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={6}
                className={cn(inputCls, 'py-[12px] leading-[22px]')}
                placeholder="What you teach, how you teach it, and who it suits."
              />
            </Field>

            {error ? (
              <p className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-3 text-[14px] font-bold text-ink" role="alert">
                {error}
              </p>
            ) : null}

            <div className="hidden gap-ds-3 lg:flex">
              <Button variant="outline" onClick={() => router.push('/tutor/profile')}>
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </>
        )}
      </div>

      <AvatarUploadModal
        isOpen={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        onUpload={onAvatarUpload}
        uploading={uploading}
        hasAvatar={Boolean(profile?.avatar_url)}
        onRemovePhoto={onAvatarRemove}
      />
    </TutorV2Shell>
  );
}
