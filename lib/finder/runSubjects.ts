/**
 * The subjects a Finder run picked. Shared by /api/finder/answers (the wizard
 * repopulating itself) and /api/finder/prefill (signup's subject step).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

function isSchemaMismatch(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  const code = String(err?.code ?? '');
  const message = String(err?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    message.includes('does not exist') ||
    message.includes('could not find')
  );
}

/**
 * The run's subjects, in the order picked.
 *
 * THIS WAS THE "We could not save your answers" BUG ON A SECOND SUBMIT. The
 * route returned every answer except the subject, so going back from the
 * results into the wizard rebuilt the form with no subject, and the resubmit
 * was rejected by validateAnswers. Each subject has its own demand_signals row
 * (subject_text, or subject_id for rows written before that column); the run's
 * own subject_id is the last resort.
 */
export async function subjectsForRun(
  service: SupabaseClient,
  runId: string,
  runSubjectId: string | null
): Promise<string[]> {
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = (s ?? '').trim();
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  const tiers = ['subject_text, subjects(name), created_at', 'subjects(name), created_at'];
  for (const columns of tiers) {
    const { data, error } = await service
      .from('demand_signals')
      .select(columns)
      .eq('request_id', runId)
      .order('created_at', { ascending: true });
    if (error) {
      if (isSchemaMismatch(error)) continue;
      break;
    }
    for (const r of (data ?? []) as unknown as Array<{ subject_text?: string | null; subjects?: { name?: string | null } | null }>) {
      push(r.subject_text ?? r.subjects?.name ?? null);
    }
    break;
  }
  if (out.length === 0 && runSubjectId) {
    const { data } = await service.from('subjects').select('name').eq('id', runSubjectId).maybeSingle();
    push((data as { name?: string | null } | null)?.name ?? null);
  }
  return out;
}

