'use client';

// "Your classes" — classes the parent account is enrolled in itself.
//
// A parent who joins through a class's share link is enrolled as themselves.
// The class page (/student/classes/[id]) works for them, but nothing on the
// parent side linked to it, so a paid seat was unreachable. Renders nothing
// for the usual parent, who only enrols children.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, GraduationCap } from 'lucide-react';

type OwnClass = { id: string; name: string; subject: string | null };

export default function ParentOwnClassesCard() {
  const [classes, setClasses] = useState<OwnClass[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/parent/own-classes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { classes: [] }))
      .then((j) => { if (!cancelled) setClasses(Array.isArray(j?.classes) ? j.classes : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (classes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center gap-2 mb-2">
        <GraduationCap className="size-4 text-brand-deep" />
        <h2 className="font-semibold text-ink text-sm">Your classes</h2>
      </div>
      <div className="divide-y divide-border">
        {classes.map((c) => (
          <Link
            key={c.id}
            href={`/student/classes/${c.id}`}
            className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-deep"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink truncate">{c.name}</div>
              {c.subject && <div className="text-xs text-muted-foreground truncate">{c.subject}</div>}
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep shrink-0">
              Open class <ChevronRight className="size-3.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
