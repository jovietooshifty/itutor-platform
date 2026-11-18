// GET /api/parent/children/classes — every linked child's current classes.
//
// One list, one definition (lib/server/parentChildClasses). Home's class list,
// Classes › Upcoming and the child page all count from this rule, so the same
// child can no longer be "6 classes" on one screen and "2" on the next. Free
// classes are included: they have no billing row, which is why the billing
// feed alone never showed them.

import { NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { loadChildClasses } from '@/lib/server/parentChildClasses';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { admin, parentProfile } = await requireParentContext();

    const { data: links } = await admin
      .from('parent_child_links')
      .select('child_id')
      .eq('parent_id', parentProfile.id);
    const childIds = ((links ?? []) as Array<{ child_id: string }>).map((l) => l.child_id);
    if (childIds.length === 0) return NextResponse.json({ classes: [] });

    const { data: profiles } = await admin
      .from('profiles')
      .select('id, full_name, display_name')
      .in('id', childIds);
    const childName = new Map(
      ((profiles ?? []) as Array<{ id: string; full_name: string | null; display_name: string | null }>).map((p) => [
        p.id,
        p.display_name || p.full_name || 'Child',
      ])
    );

    const byChild = await loadChildClasses(admin, childIds);
    const classes = childIds.flatMap((id) =>
      (byChild.get(id) ?? []).map((c) => ({ ...c, childName: childName.get(id) ?? 'Child' }))
    );

    return NextResponse.json({ classes });
  } catch (err) {
    if (err instanceof ParentAccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[GET /api/parent/children/classes]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
