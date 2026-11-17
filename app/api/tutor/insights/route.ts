import { NextRequest } from 'next/server';
import { authenticateUser, requireTutor } from '@/lib/api/groupAuth';
import { fail, ok } from '@/lib/api/http';
import { getServiceClient } from '@/lib/supabase/server';
import { loadTutorClasses } from '@/lib/tutor/classSummaries';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tutor/insights?period=day|week|month — the new tutor Insights
 * (canvas m21 / d09) for the signed-in tutor only. Service client, so every
 * query is scoped to this tutor's own classes or 1:1 sessions.
 *
 * Periods are calendar periods in AST (UTC-4, no DST): today, this week from
 * Monday, this month from the 1st. Figures use the same definitions as Home:
 * - newStudents: students whose seat in one of the tutor's classes started in
 *   the period (seated enrolments).
 * - lessons: group occurrences that ended in the period and were not
 *   cancelled, plus completed 1:1 sessions that ended in it.
 * - collected: PAID subscription payments (amount_ttd) + 1:1 charges
 *   (charge_amount_ttd) in the period, before fees.
 * - renewals: students who paid for a class in the period and had already
 *   paid for that class before it (the canvas legend's definition).
 *
 * Not produced: "Time saved" (no source; not to ship) and class views (link
 * tracking exists on staging only, not on this branch's base).
 */

const AST_OFFSET_MS = 4 * 60 * 60 * 1000;
type Period = 'day' | 'week' | 'month';

function periodStart(now: Date, period: Period): Date {
  const ast = new Date(now.getTime() - AST_OFFSET_MS);
  const y = ast.getUTCFullYear();
  const m = ast.getUTCMonth();
  const d = ast.getUTCDate();
  let startAst: number;
  if (period === 'day') startAst = Date.UTC(y, m, d);
  else if (period === 'month') startAst = Date.UTC(y, m, 1);
  else startAst = Date.UTC(y, m, d - ((ast.getUTCDay() + 6) % 7));
  return new Date(startAst + AST_OFFSET_MS);
}

/** AST calendar date (YYYY-MM-DD) of an instant. */
function astDay(iso: string): string {
  return new Date(new Date(iso).getTime() - AST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateUser();
    if (!user) return fail('Unauthorized', 401);
    if (!(await requireTutor(user.id))) return fail('Tutor role required', 403);

    const raw = req.nextUrl.searchParams.get('period');
    const period: Period = raw === 'day' || raw === 'month' ? raw : 'week';
    const db = getServiceClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const start = periodStart(now, period);
    const startIso = start.toISOString();

    const { groups, ids, seated } = await loadTutorClasses(db, user.id, now, {
      enrolmentSelect: 'id, group_id, student_id, status, enrolled_at',
    });

    const [{ data: subs }, { data: oneToOne }, groupTaught] = await Promise.all([
      ids.length
        ? db
            .from('subscription_payments')
            .select('group_id, student_id, amount_ttd, paid_at')
            .in('group_id', ids)
            .eq('status', 'PAID')
            .lte('paid_at', nowIso)
        : Promise.resolve({ data: [] as any[] }),
      db
        .from('sessions')
        .select('charge_amount_ttd, status, scheduled_end_at, charged_at')
        .eq('tutor_id', user.id)
        .or(`charged_at.gte.${startIso},scheduled_end_at.gte.${startIso}`),
      ids.length
        ? db
            .from('group_session_occurrences')
            .select('id, session:group_sessions!inner(group_id)', { count: 'exact', head: true })
            .in('session.group_id', ids)
            .is('cancelled_at', null)
            .gte('scheduled_end_at', startIso)
            .lte('scheduled_end_at', nowIso)
            .then((r) => r.count ?? 0)
        : Promise.resolve(0),
    ]);

    const inPeriod = (iso: string | null | undefined) => Boolean(iso && iso >= startIso && iso <= nowIso);

    // Collected, and revenue by class.
    const byClass = new Map<string, number>();
    const periodSubs = (subs ?? []).filter((p: any) => inPeriod(p.paid_at));
    for (const p of periodSubs) {
      byClass.set(p.group_id, (byClass.get(p.group_id) ?? 0) + Number(p.amount_ttd ?? 0));
    }
    const oneToOneCollected = (oneToOne ?? [])
      .filter((s: any) => inPeriod(s.charged_at))
      .reduce((a: number, s: any) => a + Number(s.charge_amount_ttd ?? 0), 0);
    const groupCollected = Array.from(byClass.values()).reduce((a, b) => a + b, 0);
    const collected = groupCollected + oneToOneCollected;

    const nameOf = new Map<string, string>(groups.map((g: any) => [g.id, g.name]));
    const revenue = Array.from(byClass.entries())
      .map(([gid, amount]) => ({ label: nameOf.get(gid) ?? 'Class', amount }))
      .concat(oneToOneCollected > 0 ? [{ label: 'One-on-one lessons', amount: oneToOneCollected }] : [])
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map((r) => ({
        ...r,
        amount: Math.round(r.amount * 100) / 100,
        share: collected > 0 ? Math.round((r.amount / collected) * 100) : 0,
      }));

    // Renewals: paid in the period, and paid for the same class before it.
    const before = new Set(
      (subs ?? []).filter((p: any) => p.paid_at && p.paid_at < startIso).map((p: any) => `${p.group_id}:${p.student_id}`)
    );
    const renewals = new Set(
      periodSubs.filter((p: any) => before.has(`${p.group_id}:${p.student_id}`)).map((p: any) => `${p.group_id}:${p.student_id}`)
    ).size;

    // New students, overall and per AST day.
    const firstSeat = new Map<string, string>();
    for (const e of seated as any[]) {
      if (!inPeriod(e.enrolled_at)) continue;
      const prev = firstSeat.get(e.student_id);
      if (!prev || e.enrolled_at < prev) firstSeat.set(e.student_id, e.enrolled_at);
    }
    const days: { date: string; newStudents: number }[] = [];
    if (period !== 'day') {
      // The whole week (Mon–Sun) or the whole month, later days at zero.
      const first = new Date(astDay(startIso) + 'T00:00:00Z');
      const count =
        period === 'week'
          ? 7
          : new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
      for (let i = 0; i < count; i++) {
        days.push({ date: new Date(first.getTime() + i * 86_400_000).toISOString().slice(0, 10), newStudents: 0 });
      }
      for (const iso of Array.from(firstSeat.values())) {
        const row = days.find((d) => d.date === astDay(iso));
        if (row) row.newStudents += 1;
      }
    }

    const oneToOneTaught = (oneToOne ?? []).filter(
      (s: any) => s.status === 'COMPLETED' && inPeriod(s.scheduled_end_at)
    ).length;

    return ok({
      period,
      start: startIso,
      end: nowIso,
      newStudents: firstSeat.size,
      lessons: { group: groupTaught, oneToOne: oneToOneTaught },
      collected: Math.round(collected * 100) / 100,
      renewals,
      revenue,
      days,
    });
  } catch (error: any) {
    return fail(error?.message ?? 'Internal server error', 500);
  }
}
