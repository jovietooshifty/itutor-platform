/**
 * Save a learner's subjects (user_subjects) from the names the Finder uses.
 *
 * The Finder offers `subjects.name` ("Biology"), which is NOT unique: CSEC and
 * CAPE both have a "Biology". setUserSubjects matches on `label` ("CSEC
 * Biology") and so finds nothing for these names. This resolves each name to
 * one row, preferring the curriculum the learner's year implies, and also
 * accepts a full label (class inventory names such as "CAPE Accounting").
 *
 * Client-side, under the learner's own session, like setUserSubjects. Never
 * throws: a failure costs the "You study this" badge, not the signup.
 */
import { supabase } from '@/lib/supabase/client';

type Row = { id: string; name: string | null; label: string | null; curriculum: string | null };

function curriculumFor(year: string): string {
  if (year === 'SEA') return 'SEA';
  if (year === 'Lower 6' || year === 'Upper 6') return 'CAPE';
  return 'CSEC';
}

export async function saveLearnerSubjects(userId: string, names: string[], year: string): Promise<void> {
  const wanted = names.map((n) => n.trim()).filter(Boolean);
  if (!userId || wanted.length === 0) return;
  try {
    const [byName, byLabel] = await Promise.all([
      supabase.from('subjects').select('id, name, label, curriculum').in('name', wanted),
      supabase.from('subjects').select('id, name, label, curriculum').in('label', wanted),
    ]);
    const rows = [...((byName.data ?? []) as Row[]), ...((byLabel.data ?? []) as Row[])];
    const cur = curriculumFor(year);
    const ids = new Set<string>();
    for (const n of wanted) {
      const key = n.toLowerCase();
      const label = rows.find((r) => (r.label ?? '').toLowerCase() === key);
      const named = rows.filter((r) => (r.name ?? '').toLowerCase() === key);
      const pick =
        label ??
        named.find((r) => (r.curriculum ?? '').toUpperCase().startsWith(cur)) ??
        named[0];
      if (pick) ids.add(pick.id);
    }
    if (ids.size === 0) return;
    const { error } = await supabase
      .from('user_subjects')
      .insert([...ids].map((subject_id) => ({ user_id: userId, subject_id })));
    if (error) console.warn('[saveLearnerSubjects] insert failed:', error.message);
  } catch (err) {
    console.warn('[saveLearnerSubjects] failed:', err);
  }
}
