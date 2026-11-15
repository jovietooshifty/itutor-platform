'use client';

/**
 * TutorClassNewV2 — "Create a class" in the new UI (canvas m09 / m09b / m09c
 * phone, d04 / d04b desktop).
 *
 * One page instead of the old two steps: class type, level, subject (a sheet
 * with "Your subjects" first and a search over every subject — m09b), name,
 * description with the canvas's 50-word guide, price, seats, end date, and a
 * live "What families will see" card (right rail on desktop, at the foot on a
 * phone).
 *
 * SAME REQUEST AS THE OLD FORM. The body sent to POST /api/groups is the old
 * page's, field for field, including its client-side end-date checks and the
 * venue rule, so a class made here is indistinguishable from one made there.
 *
 * Deliberate departures from the canvas:
 * - Days, start time and length are NOT on this form. They are set straight
 *   after, in the existing scheduling pop-up (?schedule=1), which also creates
 *   the sessions and chooses how students join (Google/Zoom/own link). Copying
 *   that into here would fork the scheduler. PROVISIONAL.
 * - No banner picker: the class page already has the banner builder, and the
 *   class needs to exist before a banner can be stored.
 * - Fields the canvas leaves out but the API needs or tutors use are kept:
 *   end date (required — billing stops on it), visibility, and the old
 *   "Access & policies" / links under "More options".
 * - The level is one control (SEA, Form 1–5, CAPE): `groups.form_level` is a
 *   single field, so the canvas's separate "Level" and "Form / year" collapse.
 * - Price is a plain TT$ input; m09c's scroll wheel is PROVISIONAL-skipped.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Segmented, SubjectTile, Tag } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';
import { subjectCode, subjectColor } from '@/components/parent/v2/subjectTile';
import { parentInitials } from '@/components/parent/v2/initials';
import { useProfile } from '@/lib/hooks/useProfile';
import { useTutorCompletion } from '@/lib/hooks/useTutorCompletion';
import { usePhysicalClasses } from '@/lib/hooks/usePhysicalClasses';
import { supabase } from '@/lib/supabase/client';
import InPersonSection, { type InPersonDraft } from '@/components/tutor/classes/InPersonSection';
import {
  trinidadToday,
  suggestEndDate,
  nextProgression,
  isProgressingLevel,
  schoolYearOf,
  maxClassEndDate,
  shortLevelLabel,
  formatSchoolDate,
  MAX_CLASS_YEARS,
} from '@/lib/classes/academicCalendar';
import { cn } from '@/lib/utils';
import { money } from './classState';
import TutorV2Shell from './TutorV2Shell';

type DbSubject = { id: string; label: string; curriculum: string };
type ClassType = 'group' | '1on1';

const LEVELS: { value: string; label: string }[] = [
  { value: 'SEA', label: 'SEA' },
  { value: 'FORM_1', label: 'Form 1' },
  { value: 'FORM_2', label: 'Form 2' },
  { value: 'FORM_3', label: 'Form 3' },
  { value: 'FORM_4', label: 'Form 4' },
  { value: 'FORM_5', label: 'Form 5' },
  { value: 'CAPE', label: 'CAPE' },
];

/** The exam a level sits, for the suggested class name ("CSEC Mathematics Form 5"). */
function examFor(level: string): string | null {
  if (level === 'FORM_4' || level === 'FORM_5') return 'CSEC';
  if (level === 'CAPE') return 'CAPE';
  if (level === 'SEA') return 'SEA';
  return null;
}

function suggestedName(level: string, subject: string): string {
  if (!subject) return '';
  const exam = examFor(level);
  const form = level.startsWith('FORM_') ? shortLevelLabel(level) : '';
  return [exam && !subject.startsWith(exam) ? exam : null, subject, form || null].filter(Boolean).join(' ');
}

/** "CSEC Additional Mathematics" → "Additional Mathematics": the exam is shown on its own. */
const bareSubject = (label: string) => label.replace(/^(CSEC|CAPE|SEA)\s+/, '');

const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

const inputCls =
  'w-full rounded-ds-btn bw-hair border-border bg-surface-card px-ds-3 py-[10px] font-body text-[16px] text-ink placeholder:text-ink-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink';

export default function TutorClassNewV2() {
  const router = useRouter();
  const { profile } = useProfile();
  const completion = useTutorCompletion(profile);
  const physicalClasses = usePhysicalClasses();

  const [type, setType] = useState<ClassType>('group');
  const [level, setLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [subjectOpen, setSubjectOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [bio, setBio] = useState('');
  const [price, setPrice] = useState(120);
  const [seats, setSeats] = useState(8);
  const [endDate, setEndDate] = useState('');
  // See the old form: until the tutor picks a date, a level change swaps in
  // that level's suggested end date; once they choose, it is theirs.
  const [endDateTouched, setEndDateTouched] = useState(false);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [moreOpen, setMoreOpen] = useState(false);
  const [memberFee, setMemberFee] = useState(0);
  const [joinRequests, setJoinRequests] = useState(false);
  const [autoSuspend, setAutoSuspend] = useState(true);
  const [graceDays, setGraceDays] = useState(7);
  const [whatsapp, setWhatsapp] = useState('');
  const [classroom, setClassroom] = useState('');
  const [inPerson, setInPerson] = useState<InPersonDraft>({
    classFormat: 'online',
    venueId: null,
    venueVisibility: 'after_enrolment',
    maxStudentsOnline: null,
    maxStudentsPhysical: null,
    priceOnlineTtd: null,
    pricePhysicalTtd: null,
    acceptsCash: false,
  });
  const [submitting, setSubmitting] = useState<'PUBLISHED' | 'DRAFT' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The name follows level + subject until the tutor types their own.
  useEffect(() => {
    if (!titleTouched) setTitle(suggestedName(level, subject));
  }, [level, subject, titleTouched]);

  const today = trinidadToday();
  const maxEndDate = maxClassEndDate(today);
  const suggestion = suggestEndDate(level || null, today);
  const progression = nextProgression(level || null, schoolYearOf(today), endDate || null);

  const chooseLevel = (next: string) => {
    setLevel(next);
    if (!endDateTouched) setEndDate(suggestEndDate(next || null, trinidadToday())?.date ?? '');
  };

  const isGroup = type === 'group';
  const words = wordCount(bio);
  const canSave = Boolean(profile?.id && title.trim() && endDate) && !submitting;

  /** Same body, same checks, same destination as the old create page. */
  const submit = async (status: 'PUBLISHED' | 'DRAFT') => {
    if (!profile?.id || !title.trim() || !endDate) return;
    const todayYmd = trinidadToday();
    const latestYmd = maxClassEndDate(todayYmd);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? new Date(`${endDate}T00:00:00Z`) : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== endDate) {
      setSaveError('The class end date isn’t a valid date. Pick one from the calendar.');
      return;
    }
    if (endDate < todayYmd) {
      setSaveError('The class end date can’t be in the past. Pick today or a later date.');
      return;
    }
    if (endDate > latestYmd) {
      setSaveError(`The class end date can be at most ${MAX_CLASS_YEARS} years away — the latest is ${formatSchoolDate(latestYmd)}.`);
      return;
    }
    if (isGroup && inPerson.classFormat !== 'online' && !inPerson.venueId) {
      setSaveError('Choose a venue before setting this class to meet in person.');
      return;
    }
    setSubmitting(status);
    setSaveError(null);
    let leaving = false;
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          tutorId: profile.id,
          name: title,
          subject,
          formLevel: level || null,
          form_level: level || null,
          description: bio,
          maxStudents: isGroup ? seats : 1,
          price_monthly: price,
          end_date: endDate,
          member_service_fee: memberFee,
          pricing_model: 'MONTHLY',
          isPublic: visibility === 'public',
          require_join_requests: joinRequests,
          auto_suspend_missed_payment: autoSuspend,
          grace_period_days: graceDays,
          whatsapp_url: whatsapp,
          google_classroom_link: classroom,
          class_format: isGroup ? inPerson.classFormat : 'online',
          venue_id: isGroup && inPerson.classFormat !== 'online' ? inPerson.venueId : null,
          venue_visibility: inPerson.venueVisibility,
          max_students_online: isGroup && inPerson.classFormat !== 'physical' ? inPerson.maxStudentsOnline : null,
          max_students_physical: isGroup && inPerson.classFormat !== 'online' ? inPerson.maxStudentsPhysical : null,
          price_online_ttd: isGroup && inPerson.classFormat !== 'physical' ? inPerson.priceOnlineTtd : null,
          price_physical_ttd: isGroup && inPerson.classFormat !== 'online' ? inPerson.pricePhysicalTtd : null,
          accepts_cash: isGroup && inPerson.classFormat !== 'online' ? inPerson.acceptsCash : false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newId: string | undefined = data.group?.id ?? data.id;
        leaving = true;
        // Straight to the scheduling pop-up; replace so Back can't resubmit.
        router.replace(newId ? `/tutor/classes/${newId}?schedule=1` : '/tutor/classes');
        return;
      }
      const json = await res.json().catch(() => ({}));
      setSaveError(json.error ?? 'We could not save this class — please try again.');
    } catch {
      setSaveError('We could not save this class — please check your connection and try again.');
    } finally {
      if (!leaving) setSubmitting(null);
    }
  };

  const preview = (
    <PreviewCard
      level={level}
      subject={subject}
      title={title}
      teacher={profile?.display_name || profile?.full_name || 'You'}
      initials={parentInitials(profile) || '?'}
      format={isGroup ? inPerson.classFormat : 'online'}
      price={price}
      seats={isGroup ? seats : 1}
    />
  );

  const notes = (
    <div className="flex flex-col gap-ds-2 text-[13px] leading-[18px] text-ink-muted">
      <p className="m-0">
        {completion.avatar && completion.bio
          ? 'Publishing needs a photo and bio on your profile. Both are done.'
          : 'Publishing needs a photo and bio on your profile. Add them from Profile before families can find this class.'}
      </p>
      <p className="m-0">
        Next you set the days and times. A class with no future session is flagged, so no one pays for a class that isn&rsquo;t running.
      </p>
    </div>
  );

  // Phone action bar (m09: Save draft · Publish), docked above the tab bar.
  const phoneBar = (
    <div className="flex gap-ds-2 bw-t-hair border-line-soft bg-surface-card px-ds-4 py-ds-3 lg:hidden">
      <Button variant="outline" size="md" className="flex-1" disabled={!canSave} onClick={() => submit('DRAFT')}>
        {submitting === 'DRAFT' ? 'Saving…' : 'Save draft'}
      </Button>
      <Button variant="primary" size="md" className="flex-1" disabled={!canSave} onClick={() => submit('PUBLISHED')}>
        {submitting === 'PUBLISHED' ? 'Publishing…' : 'Publish'}
      </Button>
    </div>
  );

  return (
    <TutorV2Shell width="wide" title="Create a class" bottomBar={phoneBar}>
    <div className="flex flex-col gap-ds-4">
      <div className="flex flex-col gap-ds-2">
        <button
          type="button"
          onClick={() => router.push('/tutor/classes')}
          className="w-fit border-0 bg-transparent p-0 font-body text-[14px] font-extrabold text-ink-muted cursor-pointer hover:text-ink"
        >
          ← Classes
        </button>
        <h1 className="ds-page-title m-0 font-display font-extrabold text-ink">Create a class</h1>
      </div>

      <div className="flex flex-col gap-ds-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-ds-5">
        <div className="flex min-w-0 flex-col gap-ds-4">
          <Segmented<ClassType>
            label="Class type"
            options={[
              { id: 'group', label: 'Group class' },
              { id: '1on1', label: 'Recurring 1:1' },
            ]}
            value={type}
            onChange={setType}
          />

          <Card className="gap-ds-4">
            <Field label="Level">
              <div className="flex flex-wrap gap-ds-2" role="radiogroup" aria-label="Level">
                {LEVELS.map((l) => (
                  <Chip key={l.value} on={level === l.value} onClick={() => chooseLevel(level === l.value ? '' : l.value)}>
                    {l.label}
                  </Chip>
                ))}
              </div>
              {isProgressingLevel(level) ? (
                <Hint>
                  Form 1–4 classes move up a level each 1 July.{' '}
                  {progression
                    ? `This class becomes ${shortLevelLabel(progression.toLevel)} on ${formatSchoolDate(progression.on)}.`
                    : `This class ends before then, so it stays ${shortLevelLabel(level)}.`}
                </Hint>
              ) : null}
            </Field>

            <Field label="Subject">
              <button
                type="button"
                onClick={() => setSubjectOpen(true)}
                className={cn(inputCls, 'ds-press flex items-center justify-between text-left cursor-pointer', !subject && 'text-ink-muted')}
              >
                <span className="truncate">{subject || 'Choose a subject'}</span>
                <span aria-hidden className="text-ink-muted">▾</span>
              </button>
            </Field>

            <Field label="Class name">
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(e.target.value !== '');
                }}
                placeholder="e.g. CSEC Mathematics Form 5"
                className={inputCls}
              />
            </Field>

            <Field label="Description" aside={<span className={cn(words > 50 && 'text-danger font-bold')}>{words} / 50 words</span>}>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                placeholder="What the class covers, who it's for, and what they'll achieve."
                className={cn(inputCls, 'resize-y')}
              />
            </Field>
          </Card>

          <Card className="gap-ds-4">
            <div className={cn('grid gap-ds-3', isGroup && 'grid-cols-2')}>
              <Field label="Price per month">
                <div className="relative">
                  <span className="pointer-events-none absolute left-ds-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-ink-muted">TT$</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={price}
                    onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
                    className={cn(inputCls, 'pl-[52px] tabular-nums')}
                  />
                </div>
              </Field>
              {isGroup ? (
                <Field label="Class size">
                  <Stepper value={seats} min={2} max={500} unit="seats" onChange={setSeats} />
                </Field>
              ) : null}
            </div>
            <Hint>Billed monthly. {price > 0 ? `Families pay ${money(price)} a month.` : 'A free class charges nobody.'}</Hint>

            <Field label="Class ends on">
              <input
                type="date"
                value={endDate}
                min={today}
                max={maxEndDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setEndDateTouched(e.target.value !== '');
                }}
                className={inputCls}
              />
              {suggestion ? (
                <Hint>
                  Suggested for {shortLevelLabel(level)}: <b className="text-ink">{formatSchoolDate(suggestion.date)}</b>, {suggestion.reason}.{' '}
                  {endDate !== suggestion.date ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEndDate(suggestion.date);
                        setEndDateTouched(false);
                      }}
                      className="border-0 bg-transparent p-0 font-body text-[13px] font-extrabold text-ink underline cursor-pointer"
                    >
                      Use suggested date
                    </button>
                  ) : null}
                </Hint>
              ) : (
                <Hint>Billing stops after this date.{!level ? ' Choose a level and we’ll suggest one.' : ''}</Hint>
              )}
            </Field>

            <Field label="Who can find it">
              <Segmented<'public' | 'private'>
                label="Visibility"
                options={[
                  { id: 'public', label: 'Everyone' },
                  { id: 'private', label: 'Invite only' },
                ]}
                value={visibility}
                onChange={setVisibility}
              />
              <Hint>
                {visibility === 'public'
                  ? 'Listed on the marketplace once it has a schedule.'
                  : 'Not listed. Families join with the link you share.'}
              </Hint>
            </Field>
          </Card>

          {isGroup && physicalClasses ? (
            <Card title="Delivery" className="gap-ds-3">
              {/* The existing in-person editor (venues, per-seat caps, cash).
                  Old styling inside the new card: PROVISIONAL. */}
              <InPersonSection
                draft={inPerson}
                onChange={(patch: Partial<InPersonDraft>) => setInPerson((prev) => ({ ...prev, ...patch }))}
                enrolledOnline={0}
                enrolledPhysical={0}
              />
            </Card>
          ) : null}

          <Card className="gap-ds-3">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
              className="flex w-full items-center justify-between border-0 bg-transparent p-0 font-body text-[16px] font-extrabold text-ink cursor-pointer"
            >
              More options
              <span aria-hidden className="text-ink-muted">{moreOpen ? '−' : '+'}</span>
            </button>
            {moreOpen ? (
              <div className="flex flex-col gap-ds-4">
                <Toggle label="Ask before joining" hint="Families request a place and you approve them." value={joinRequests} onChange={setJoinRequests} />
                <Toggle
                  label="Pause access on a missed payment"
                  hint="Access stops after the grace window if a payment fails."
                  value={autoSuspend}
                  onChange={setAutoSuspend}
                />
                {autoSuspend ? (
                  <Field label="Grace window (days)">
                    <input type="number" min={0} value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))} className={cn(inputCls, 'w-32')} />
                  </Field>
                ) : null}
                <Field label="Per-member service fee (TT$)">
                  <input type="number" min={0} value={memberFee} onChange={(e) => setMemberFee(Number(e.target.value))} className={cn(inputCls, 'w-32')} />
                  <Hint>A flat fee added to each member&rsquo;s bill, for materials or admin.</Hint>
                </Field>
                <Field label="WhatsApp group link">
                  <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="https://chat.whatsapp.com/…" className={inputCls} />
                </Field>
                <Field label="Google Classroom link">
                  <input value={classroom} onChange={(e) => setClassroom(e.target.value)} placeholder="https://classroom.google.com/c/…" className={inputCls} />
                </Field>
              </div>
            ) : null}
          </Card>

          <div className="flex flex-col gap-ds-3 lg:hidden">
            {preview}
            {notes}
          </div>

          {saveError ? <Card tone="alert" body={saveError} /> : null}

          {/* Desktop actions sit under the form; phones get a pinned bar. */}
          <div className="hidden items-center justify-end gap-ds-2 lg:flex">
            <Button variant="outline" size="md" disabled={!canSave} onClick={() => submit('DRAFT')}>
              {submitting === 'DRAFT' ? 'Saving…' : 'Save draft'}
            </Button>
            <Button variant="primary" size="md" disabled={!canSave} onClick={() => submit('PUBLISHED')}>
              {submitting === 'PUBLISHED' ? 'Publishing…' : 'Publish'}
            </Button>
          </div>
        </div>

        <aside className="hidden lg:flex lg:flex-col lg:gap-ds-3">
          {preview}
          {notes}
        </aside>
      </div>

      <SubjectSheet
        open={subjectOpen}
        level={level}
        tutorId={profile?.id ?? null}
        current={subject}
        onClose={() => setSubjectOpen(false)}
        onPick={(label) => {
          setSubject(label);
          setSubjectOpen(false);
        }}
      />
    </div>
    </TutorV2Shell>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function Field({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-ds-2">
      <div className="flex items-baseline justify-between gap-ds-2">
        <span className="text-[14px] font-extrabold text-ink">{label}</span>
        {aside ? <span className="text-[12px] text-ink-muted">{aside}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[13px] leading-[18px] text-ink-muted">{children}</p>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'ds-press rounded-full bw-hair px-ds-3 py-[7px] font-body text-[14px] font-extrabold cursor-pointer',
        on ? 'border-ink bg-ink text-on-ink' : 'border-border bg-surface-card text-ink'
      )}
    >
      {children}
    </button>
  );
}

function Stepper({ value, min, max, unit, onChange }: { value: number; min: number; max: number; unit: string; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
  const btn = 'ds-press flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-ds-btn bw-hair border-border bg-surface-card font-body text-[20px] font-extrabold text-ink cursor-pointer';
  return (
    <div className="flex items-center gap-ds-2">
      <button type="button" aria-label={`Fewer ${unit}`} className={btn} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={unit}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className={cn(inputCls, 'min-w-0 text-center tabular-nums')}
      />
      <button type="button" aria-label={`More ${unit}`} className={btn} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-ds-3">
      <div className="min-w-0">
        <div className="text-[15px] font-extrabold text-ink">{label}</div>
        {hint ? <Hint>{hint}</Hint> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn('relative h-[28px] w-[48px] shrink-0 rounded-full border-0 p-0 cursor-pointer transition-colors', value ? 'bg-brand' : 'bg-surface-sunken')}
      >
        <span className={cn('absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-full bg-surface-card shadow transition-transform', value && 'translate-x-[20px]')} />
      </button>
    </div>
  );
}

function PreviewCard({
  level,
  subject,
  title,
  teacher,
  initials,
  format,
  price,
  seats,
}: {
  level: string;
  subject: string;
  title: string;
  teacher: string;
  initials: string;
  format: string;
  price: number;
  seats: number;
}) {
  const label = bareSubject(subject) || title || 'Class';
  const exam = examFor(level);
  return (
    <Card eyebrow="What families will see" className="gap-ds-3">
      <div className="flex items-center gap-ds-3">
        <SubjectTile code={subjectCode(label)} color={subjectColor(label)} size={48} className="text-[15px] font-black" />
        <div className="min-w-0 flex flex-wrap gap-ds-1">
          {exam ? <Tag tone="outline">{exam}</Tag> : null}
          {subject ? <Tag tone="outline">{bareSubject(subject)}</Tag> : null}
        </div>
      </div>
      <div className="font-display text-[18px] font-extrabold leading-6 text-ink">{title || 'Your class name'}</div>
      <div className="flex items-center gap-ds-2 text-[13px] text-ink-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand font-display text-[11px] font-extrabold text-ink">{initials}</span>
        <span className="font-bold text-ink">{teacher}</span>
      </div>
      <div className="text-[13px] text-ink-muted">
        {format === 'physical' ? 'In person' : format === 'hybrid' ? 'Online & in person' : 'Online'} · days and times set next
      </div>
      <div className="flex items-baseline gap-ds-1 bw-t-hair border-line-soft pt-ds-3">
        <span className="font-display text-[20px] font-extrabold tabular-nums text-ink">{price > 0 ? money(price) : 'Free'}</span>
        <span className="text-[13px] text-ink-muted">
          {price > 0 ? 'per month · ' : ''}
          {seats} {seats === 1 ? 'seat' : 'seats'}
        </span>
      </div>
    </Card>
  );
}

/** m09b / d04b: "Your subjects" first, then everything, searchable. */
function SubjectSheet({
  open,
  level,
  tutorId,
  current,
  onClose,
  onPick,
}: {
  open: boolean;
  level: string;
  tutorId: string | null;
  current: string;
  onClose: () => void;
  onPick: (label: string) => void;
}) {
  const [all, setAll] = useState<DbSubject[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open || all.length) return;
    supabase
      .from('subjects')
      .select('id, name, label, curriculum')
      .order('curriculum', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) =>
        setAll((data ?? []).map((s: any) => ({ id: s.id, label: s.label || s.name, curriculum: s.curriculum || '' })))
      );
  }, [open, all.length]);

  useEffect(() => {
    if (!open || !tutorId) return;
    supabase
      .from('tutor_subjects')
      .select('subject_id')
      .eq('tutor_id', tutorId)
      .then(({ data }) => setMine(new Set((data ?? []).map((r: any) => r.subject_id))));
  }, [open, tutorId]);

  const exam = examFor(level);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of all) c[s.curriculum] = (c[s.curriculum] ?? 0) + 1;
    return c;
  }, [all]);

  const needle = q.trim().toLowerCase();
  const matches = needle ? all.filter((s) => s.label.toLowerCase().includes(needle)) : [];
  // With no search, show the tutor's own subjects, then the level's curriculum.
  const yours = all.filter((s) => mine.has(s.id));
  const forLevel = exam ? all.filter((s) => s.curriculum === exam && !mine.has(s.id)) : [];

  const row = (s: DbSubject) => (
    <li key={s.id}>
      <button
        type="button"
        onClick={() => onPick(s.label)}
        className={cn(
          'ds-press flex w-full items-center justify-between gap-ds-2 rounded-ds-sm border-0 bg-transparent px-ds-2 py-[10px] text-left font-body text-[15px] text-ink cursor-pointer',
          current === s.label && 'bg-surface-sunken font-extrabold'
        )}
      >
        <span>{bareSubject(s.label)}</span>
        {s.curriculum ? <span className="text-[12px] font-bold text-ink-muted">{s.curriculum}</span> : null}
      </button>
    </li>
  );
  const group = (title: string, list: DbSubject[]) =>
    list.length ? (
      <div className="flex flex-col gap-ds-1">
        <div className="text-[12px] font-extrabold uppercase tracking-[0.04em] text-ink-muted">{title}</div>
        <ul className="m-0 list-none p-0">{list.map(row)}</ul>
      </div>
    ) : null;

  return (
    <Sheet open={open} onClose={onClose} title="Choose a subject">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search all subjects"
        className={inputCls}
        aria-label="Search subjects"
      />
      {needle ? (
        matches.length ? (
          <ul className="m-0 list-none p-0">{matches.slice(0, 60).map(row)}</ul>
        ) : (
          <Hint>No subject matches &ldquo;{q.trim()}&rdquo;.</Hint>
        )
      ) : (
        <>
          {group('Your subjects', yours)}
          {group(exam ? `${exam} subjects` : 'All subjects', exam ? forLevel : all.filter((s) => !mine.has(s.id)).slice(0, 40))}
          <Hint>
            Type to search all{' '}
            {['CSEC', 'CAPE', 'SEA']
              .filter((k) => counts[k])
              .map((k) => `${counts[k]} ${k}`)
              .join(', ')}{' '}
            subjects.
          </Hint>
        </>
      )}
    </Sheet>
  );
}
