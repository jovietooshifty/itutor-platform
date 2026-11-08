'use client';

/**
 * Customise profile, new UI — Figma `2:2466`, file rwytRx6xmRHf4AMzpxAznd.
 * Route: /student/settings/profile. A detail screen: back link to Settings,
 * no tab bar, Cancel / Save changes pinned at the bottom.
 *
 * Saves exactly what the old settings page saved, in one update of the
 * student's own profiles row: display_name, username, bio, school,
 * subjects_of_study — plus form_level, which the old page showed but locked.
 * The values are the seven the signup form stores. Then the same
 * ensureSchoolCommunityAndMembership call, so a new school still joins its
 * community.
 *
 * NOT BUILT: the avatar colour picker. profiles has no column for it; it needs
 * a small migration and was not invented here. "Add photo" is real (the
 * existing AvatarUploadModal).
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, Plus, X } from '@phosphor-icons/react';
import AvatarUploadModal from '@/components/AvatarUploadModal';
import SubjectMultiSelect from '@/components/SubjectMultiSelect';
import { Sheet } from '@/components/parent/v2/Sheet';
import { parentInitials } from '@/components/parent/v2/initials';
import { cn } from '@/lib/utils';
import { useProfile } from '@/lib/hooks/useProfile';
import { useAvatarUpload } from '@/lib/hooks/useAvatarUpload';
import { supabase } from '@/lib/supabase/client';
import { ensureSchoolCommunityAndMembership } from '@/lib/actions/community';
import { FORM_LEVELS } from '@/lib/subject-communities';
import { nonStudentRedirect } from '@/lib/routing/nonStudentRedirect';
import { levelLabel } from './StudentSettingsV2';
import type { Area } from '@/lib/utils/imageCrop';

const DOTS = ['bg-accent-yellow', 'bg-brand-legacy', 'bg-accent-orange', 'bg-ink'];

const inputCls =
  'h-[52px] w-full rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] font-body text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-brand';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="font-body text-[15px] font-extrabold text-ink">{label}</span>
      {children}
      {hint ? <span className="font-body text-[13px] text-ink-muted">{hint}</span> : null}
    </label>
  );
}

export default function StudentProfileEditV2() {
  const router = useRouter();
  const { profile, loading } = useProfile();
  const { uploadAvatar, deleteAvatar, uploading } = useAvatarUpload(profile?.id ?? '');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [level, setLevel] = useState('');
  const [school, setSchool] = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!profile || profile.role !== 'student') {
      router.push(nonStudentRedirect(profile));
      return;
    }
    setDisplayName(profile.display_name || profile.full_name || '');
    setUsername(profile.username || '');
    setBio(profile.bio || '');
    setLevel(profile.form_level || '');
    setSchool(profile.school || '');
    setSubjects((profile.subjects_of_study ?? []) as string[]);
  }, [profile, loading, router]);

  const save = async () => {
    if (!profile) return;
    setError(null);
    const u = username.trim();
    if (!u) return setError('Username is required.');
    if (u !== profile.username && !/^[A-Za-z0-9_-]+$/.test(u)) return setError('Usernames use letters, numbers, _ and - only.');
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({
          username: u,
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          school: school.trim() || null,
          form_level: level || null,
          subjects_of_study: subjects.length > 0 ? subjects : null,
        })
        .eq('id', profile.id);
      if (err) {
        setError(err.code === '23505' ? 'That username is taken.' : err.message);
        return;
      }
      await ensureSchoolCommunityAndMembership(profile.id).catch(() => undefined);
      // useProfile caches; a full load is how the old page picked up the change.
      window.location.href = '/student/settings';
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
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

  const back = (
    <Link href="/student/settings" className="ds-press -ml-ds-1 inline-flex min-h-[44px] items-center gap-[6px] self-start px-ds-1 font-body text-[15px] font-extrabold text-ink no-underline">
      <ArrowLeft size={20} weight="bold" aria-hidden /> Settings
    </Link>
  );

  if (loading || !profile) {
    return (
      <div className="flex flex-col gap-ds-4" aria-busy>
        {back}
        <div className="h-[170px] animate-pulse rounded-ds-card bg-surface-sunken" />
      </div>
    );
  }

  const levelOptions = level && !(FORM_LEVELS as readonly string[]).includes(level) ? [level, ...FORM_LEVELS] : [...FORM_LEVELS];

  return (
    <div className="flex flex-col gap-[22px]">
      {back}
      <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Customise profile</h1>

      <div className="grid items-start gap-[22px] lg:grid-cols-2">
        <div className="flex flex-col gap-[22px]">
          {/* Look — 2:2479 (colour picker not built, see header) */}
          <section className="flex items-center gap-ds-4 rounded-ds-card bw-bold border-ink bg-surface-card px-[18px] py-[20px]" aria-label="Photo">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="size-[88px] shrink-0 rounded-[14px] object-cover" />
            ) : (
              <span className="flex size-[88px] shrink-0 items-center justify-center rounded-[14px] bg-brand font-display text-[30px] font-black text-ink">
                {parentInitials(profile)}
              </span>
            )}
            <div className="flex flex-col gap-ds-2">
              <button
                type="button"
                onClick={() => setAvatarOpen(true)}
                className="ds-press inline-flex h-11 items-center gap-ds-2 self-start rounded-ds-sm bw-bold border-ink bg-surface-card px-[14px] font-body text-[15px] font-extrabold text-ink shadow-[0_3px_0_#0d2318] cursor-pointer"
              >
                <Camera size={18} weight="bold" aria-hidden /> {profile.avatar_url ? 'Change photo' : 'Add photo'}
              </button>
              <span className="font-body text-[13px] text-ink-muted">Your tutors see this</span>
            </div>
          </section>

          {/* About you — 2:2502 */}
          <section className="flex flex-col gap-[14px]">
            <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">About you</h2>
            <Field label="Display name" hint="Everyone sees this">
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" className={inputCls} />
            </Field>
            <Field label="Username" hint="Letters, numbers, _ and -">
              <span className="flex h-[52px] items-center rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] focus-within:ring-2 focus-within:ring-brand">
                <span className="font-body text-[16px] font-extrabold text-ink-muted">@</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent px-[2px] font-body text-[16px] text-ink focus:outline-none"
                />
              </span>
            </Field>
            <Field label="Bio">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full resize-none rounded-ds-sm bw-hair border-border-strong bg-surface-card px-[15px] py-ds-3 font-body text-[16px] leading-[22.4px] text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </Field>
          </section>
        </div>

        {/* Learning — 2:2532 */}
        <section className="flex flex-col gap-[14px]">
          <h2 className="m-0 font-display text-[18px] font-extrabold text-ink">Learning</h2>
          <Field label="Level">
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={cn(inputCls, 'h-[50px] pl-ds-4')}>
              <option value="">Choose your level</option>
              {levelOptions.map((l) => (
                <option key={l} value={l}>
                  {levelLabel(l)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="School">
            <input value={school} onChange={(e) => setSchool(e.target.value)} autoComplete="organization" className={inputCls} />
          </Field>
          <div className="flex flex-col gap-ds-2">
            <span className="font-body text-[15px] font-extrabold text-ink">Subjects</span>
            <div className="flex flex-wrap gap-ds-2">
              {subjects.map((s, i) => (
                <span key={s} className="inline-flex h-[46px] items-center gap-ds-2 rounded-[6px] bw-hair border-border bg-surface-card pl-[13px] pr-[7px]">
                  <span className={cn('size-2.5 rounded-[2px]', DOTS[i % DOTS.length])} aria-hidden />
                  <span className="font-body text-[15px] font-bold text-ink">{s}</span>
                  <button
                    type="button"
                    onClick={() => setSubjects((prev) => prev.filter((x) => x !== s))}
                    aria-label={`Remove ${s}`}
                    className="flex size-8 items-center justify-center rounded-[4px] border-0 bg-transparent text-ink cursor-pointer"
                  >
                    <X size={16} weight="bold" aria-hidden />
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={() => setSubjectsOpen(true)}
                className="ds-press inline-flex h-11 items-center gap-[6px] rounded-[6px] bw-hair bw-dashed border-[#879489] bg-transparent px-[14px] font-body text-[15px] font-bold text-ink cursor-pointer"
              >
                <Plus size={16} weight="bold" aria-hidden /> Add subject
              </button>
            </div>
          </div>
        </section>
      </div>

      {error ? (
        <p role="alert" className="m-0 rounded-ds-card bw-hair border-danger bg-danger-soft p-ds-3 font-body text-[15px] font-bold text-ink">
          {error}
        </p>
      ) : null}

      {/* Bottom bar — 2:2568. Sticky in the flow so it sits above nothing. */}
      <div className="sticky bottom-0 -mx-ds-4 flex gap-[10px] bw-t-hair border-border bg-surface-card px-ds-4 pb-ds-4 pt-[13px] md:static md:mx-0 md:rounded-ds-card md:bw-hair lg:max-w-[520px]">
        <Link
          href="/student/settings"
          className="ds-press flex h-[54px] items-center justify-center rounded-ds-sm bw-bold border-ink bg-surface-card px-[22px] font-body text-[16px] font-extrabold text-ink no-underline"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="ds-press h-[50px] min-w-0 flex-1 self-center rounded-ds-sm border-0 bg-[#13804a] font-body text-[16px] font-extrabold text-white shadow-[0_4px_0_#0d4f2d] cursor-pointer disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>

      <Sheet
        open={subjectsOpen}
        onClose={() => setSubjectsOpen(false)}
        title="Add a subject"
        footer={
          <button
            type="button"
            onClick={() => setSubjectsOpen(false)}
            className="ds-press h-[50px] w-full rounded-ds-sm border-0 bg-brand font-body text-[16px] font-extrabold text-ink cursor-pointer"
          >
            Done
          </button>
        }
      >
        <SubjectMultiSelect selectedSubjects={subjects} onChange={setSubjects} />
      </Sheet>

      <AvatarUploadModal
        isOpen={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        onUpload={onAvatarUpload}
        uploading={uploading}
        hasAvatar={Boolean(profile.avatar_url)}
        onRemovePhoto={onAvatarRemove}
      />
    </div>
  );
}
