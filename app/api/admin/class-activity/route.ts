// /api/admin/class-activity — the keep-active rules, for admins (21 Nov 2026 sprint).
//
//   GET     classes in a warning now, classes the rules archived in the last
//           30 days, and every exemption — with names, so an admin can step
//           in before a good class disappears.
//   POST    { groupId } | { tutorId } | { tutorEmail }, optional { reason }:
//           exempt one class or every class of a teacher.
//   DELETE  ?id=<exemption id>: remove an exemption.
//
// Exempt classes never get notices and are never auto-archived, by either
// the 30-day or the 90-day rule (lib/server/classActivity.ts).

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import { isClassActivityLive, isMissingTable, warningDeadline } from '@/lib/server/classActivity';

export const dynamic = 'force-dynamic';

const RECENT_DAYS = 30;

function tableMissing() {
  return NextResponse.json(
    { error: 'Migration 280 (class activity rules) has not been applied to this database yet.' },
    { status: 503 }
  );
}

export async function GET() {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;
  const db = getServiceClient();

  const [{ data: warnRows, error: wErr }, { data: exRows, error: eErr }] = await Promise.all([
    db.from('class_activity_state').select('group_id, warning_rule, warned_at, reminded_at').not('warning_rule', 'is', null),
    db.from('class_activity_exemptions').select('id, tutor_id, group_id, reason, created_at, created_by').order('created_at', { ascending: false }),
  ]);
  if ((wErr && isMissingTable(wErr)) || (eErr && isMissingTable(eErr))) return tableMissing();
  if (wErr || eErr) return NextResponse.json({ error: (wErr ?? eErr)!.message }, { status: 500 });

  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  const { data: archRows, error: aErr } = await db
    .from('groups')
    .select('id, name, subject, tutor_id, archived_at, archived_reason, visibility')
    .gte('archived_at', since)
    .in('archived_reason', ['auto_no_students', 'auto_inactive'])
    .order('archived_at', { ascending: false });
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 });

  const groupIds = [
    ...new Set([...(warnRows ?? []).map((w: any) => w.group_id), ...(exRows ?? []).map((e: any) => e.group_id).filter(Boolean)]),
  ];
  const groups = new Map<string, any>();
  if (groupIds.length) {
    const { data } = await db.from('groups').select('id, name, subject, tutor_id, visibility, status').in('id', groupIds);
    for (const g of data ?? []) groups.set(g.id, g);
  }
  for (const g of archRows ?? []) groups.set(g.id, { ...groups.get(g.id), ...g });

  const tutorIds = [
    ...new Set([...[...groups.values()].map((g) => g.tutor_id), ...(exRows ?? []).map((e: any) => e.tutor_id)].filter(Boolean)),
  ];
  const tutors = new Map<string, { name: string; email: string | null }>();
  if (tutorIds.length) {
    const { data } = await db.from('profiles').select('id, full_name, display_name, email').in('id', tutorIds);
    for (const p of data ?? []) tutors.set(p.id, { name: p.display_name || p.full_name || 'Unnamed', email: p.email ?? null });
  }

  const exemptGroups = new Set((exRows ?? []).map((e: any) => e.group_id).filter(Boolean));
  const exemptTutors = new Set((exRows ?? []).map((e: any) => e.tutor_id).filter(Boolean));
  const classRow = (id: string) => {
    const g = groups.get(id) ?? {};
    return {
      groupId: id,
      name: g.name ?? 'Untitled class',
      subject: g.subject ?? null,
      tutorId: g.tutor_id ?? null,
      tutorName: tutors.get(g.tutor_id)?.name ?? null,
      tutorEmail: tutors.get(g.tutor_id)?.email ?? null,
      visibility: g.visibility ?? null,
      exempt: exemptGroups.has(id) || exemptTutors.has(g.tutor_id),
    };
  };

  return NextResponse.json({
    mode: isClassActivityLive() ? 'live' : 'dry_run',
    warnings: (warnRows ?? [])
      .filter((w: any) => w.warned_at)
      .map((w: any) => ({
        ...classRow(w.group_id),
        rule: w.warning_rule,
        warnedAt: w.warned_at,
        reminded: Boolean(w.reminded_at),
        archiveOn: warningDeadline(w.warned_at).toISOString(),
      }))
      .sort((a: any, b: any) => a.archiveOn.localeCompare(b.archiveOn)),
    archived: (archRows ?? []).map((g: any) => ({
      ...classRow(g.id),
      archivedAt: g.archived_at,
      rule: g.archived_reason === 'auto_no_students' ? 'no_students' : 'inactive',
    })),
    exemptions: (exRows ?? []).map((e: any) => ({
      id: e.id,
      kind: e.group_id ? 'class' : 'teacher',
      groupId: e.group_id,
      className: e.group_id ? groups.get(e.group_id)?.name ?? 'Deleted class' : null,
      tutorId: e.tutor_id ?? groups.get(e.group_id)?.tutor_id ?? null,
      tutorName: tutors.get(e.tutor_id ?? groups.get(e.group_id)?.tutor_id)?.name ?? null,
      reason: e.reason,
      createdAt: e.created_at,
    })),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;
  const db = getServiceClient();
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) || null : null;

  let groupId: string | null = typeof body.groupId === 'string' ? body.groupId.trim() : null;
  let tutorId: string | null = typeof body.tutorId === 'string' ? body.tutorId.trim() : null;
  // A pasted class URL works too: take the last UUID in it.
  if (groupId) groupId = groupId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)?.pop() ?? groupId;
  if (!groupId && !tutorId && typeof body.tutorEmail === 'string' && body.tutorEmail.trim()) {
    const { data } = await db.from('profiles').select('id, role').ilike('email', body.tutorEmail.trim()).limit(2);
    if (!data?.length) return NextResponse.json({ error: 'No account with that email.' }, { status: 404 });
    if (data.length > 1) return NextResponse.json({ error: 'More than one account matches that email.' }, { status: 409 });
    tutorId = data[0].id;
  }
  if (!groupId === !tutorId) return NextResponse.json({ error: 'Give a class or a teacher.' }, { status: 400 });

  let label = '';
  if (groupId) {
    const { data: g } = await db.from('groups').select('id, name').eq('id', groupId).maybeSingle();
    if (!g) return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
    label = g.name ?? groupId;
  } else {
    const { data: p } = await db.from('profiles').select('id, full_name, display_name').eq('id', tutorId!).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Teacher not found.' }, { status: 404 });
    label = p.display_name || p.full_name || tutorId!;
  }

  const { data: row, error } = await db
    .from('class_activity_exemptions')
    .insert({ group_id: groupId, tutor_id: groupId ? null : tutorId, reason, created_by: auth.profile?.id ?? null })
    .select('id')
    .single();
  if (error) {
    if (isMissingTable(error)) return tableMissing();
    if (error.code === '23505') return NextResponse.json({ error: 'Already exempt.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Drop any warning in progress so the class leaves the watch list now,
  // not at the next cron run.
  if (groupId) {
    await db.from('class_activity_state').update({ warning_rule: null, warned_at: null, reminded_at: null, request_nudged_at: null }).eq('group_id', groupId);
  } else {
    const { data: own } = await db.from('groups').select('id').eq('tutor_id', tutorId!);
    const ids = (own ?? []).map((g: any) => g.id);
    if (ids.length) {
      await db.from('class_activity_state').update({ warning_rule: null, warned_at: null, reminded_at: null, request_nudged_at: null }).in('group_id', ids);
    }
  }

  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: 'class_activity.exempt',
      targetType: groupId ? 'class' : 'user',
      targetId: (groupId ?? tutorId)!,
      targetLabel: label,
      details: { reason, scope: groupId ? 'class' : 'teacher' },
    }
  );
  return NextResponse.json({ ok: true, id: row.id });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin('full');
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const db = getServiceClient();

  const { data: row, error } = await db.from('class_activity_exemptions').delete().eq('id', id).select('id, tutor_id, group_id').maybeSingle();
  if (error) {
    if (isMissingTable(error)) return tableMissing();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'Exemption not found' }, { status: 404 });

  await logAdminAction(
    { id: auth.profile?.id, email: auth.profile?.email },
    {
      action: 'class_activity.unexempt',
      targetType: row.group_id ? 'class' : 'user',
      targetId: (row.group_id ?? row.tutor_id)!,
      targetLabel: (row.group_id ?? row.tutor_id)!,
      details: {},
    }
  );
  return NextResponse.json({ ok: true });
}
