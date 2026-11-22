'use client';

// Admin → Class activity (21 Nov 2026 sprint, item 4).
// Classes in the keep-active warning period, classes the rules archived in the
// last 30 days, and exemptions (a teacher or a single class). "Exempt" labels
// say why a class was skipped.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import AdminBreadcrumb from '@/components/admin/AdminBreadcrumb';
import { isEmailManagementOnlyAdmin } from '@/lib/auth/adminAccess';

type Rule = 'no_students' | 'inactive';
type ClassRow = {
  groupId: string;
  name: string;
  subject: string | null;
  tutorId: string | null;
  tutorName: string | null;
  tutorEmail: string | null;
  visibility: string | null;
  exempt: boolean;
};
type Warning = ClassRow & { rule: Rule; warnedAt: string; reminded: boolean; archiveOn: string };
type Archived = ClassRow & { rule: Rule; archivedAt: string };
type Exemption = {
  id: string;
  kind: 'class' | 'teacher';
  groupId: string | null;
  className: string | null;
  tutorId: string | null;
  tutorName: string | null;
  reason: string | null;
  createdAt: string;
};
type Payload = { mode: 'live' | 'dry_run'; warnings: Warning[]; archived: Archived[]; exemptions: Exemption[] };

const RULE_LABEL: Record<Rule, string> = { no_students: 'No students (30 days)', inactive: 'No activity (90 days)' };

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Port_of_Spain' });
}

export default function AdminClassActivityPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ target: '', kind: 'class' as 'class' | 'teacher', reason: '' });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).single();
      if (profile?.role !== 'admin') { router.push('/login'); return; }
      if (isEmailManagementOnlyAdmin(profile.email)) { router.replace('/admin/emails'); return; }
      setAuthLoading(false);
    })();
  }, [router]);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/admin/class-activity', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json as Payload);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  async function exempt(body: Record<string, string>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/class-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not exempt');
      await load();
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function removeExemption(id: string) {
    if (!confirm('Remove this exemption? The class(es) will follow the keep-active rules again from the next daily run.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/class-activity?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not remove');
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    const t = form.target.trim();
    if (!t) return;
    const body: Record<string, string> = { reason: form.reason };
    if (form.kind === 'class') body.groupId = t;
    else if (t.includes('@')) body.tutorEmail = t;
    else body.tutorId = t;
    if (await exempt(body)) setForm({ target: '', kind: form.kind, reason: '' });
  }

  if (authLoading) {
    return (
      <DashboardLayout role="admin" userName="Admin">
        <div className="flex items-center justify-center py-20 text-gray-400">Loading…</div>
      </DashboardLayout>
    );
  }

  const ExemptBadge = () => (
    <span className="ml-2 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">Exempt</span>
  );

  const rowActions = (r: ClassRow) =>
    r.exempt ? null : (
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => exempt({ groupId: r.groupId, reason: '' })}
          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          Exempt class
        </button>
        {r.tutorId ? (
          <button disabled={busy} onClick={() => exempt({ tutorId: r.tutorId!, reason: '' })}
            className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Exempt teacher
          </button>
        ) : null}
      </div>
    );

  return (
    <DashboardLayout role="admin" userName="Admin">
      <div className="max-w-6xl mx-auto">
        <AdminBreadcrumb items={[{ label: 'System' }, { label: 'Class Activity' }]} />
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Class Activity</h1>
          <p className="mt-1 text-sm text-gray-600">
            Classes with no students after 30 days, or no activity for 90 days, get a notice, a reminder 7 days later, and are archived 7 days after that.
            Nothing is deleted; teachers reactivate in one tap. Exempt classes are skipped by both rules.
          </p>
          {data?.mode === 'dry_run' ? (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <strong>Dry run.</strong> CLASS_ACTIVITY_RULE_ENABLED is not on, so the daily job sends nothing and archives nothing (including the old 90-day rule).
            </p>
          ) : null}
        </div>

        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        {!data ? (
          <div className="py-10 text-center text-gray-400">Loading…</div>
        ) : (
          <div className="flex flex-col gap-8">
            <section>
              <h2 className="mb-2 text-lg font-bold text-gray-900">In the warning period ({data.warnings.length})</h2>
              {data.warnings.length === 0 ? (
                <p className="text-sm text-gray-500">No class is in a warning right now.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr><th className="px-4 py-2">Class</th><th className="px-4 py-2">Teacher</th><th className="px-4 py-2">Rule</th><th className="px-4 py-2">Archives</th><th className="px-4 py-2" /></tr>
                    </thead>
                    <tbody>
                      {data.warnings.map((w) => (
                        <tr key={w.groupId} className="border-t border-gray-100">
                          <td className="px-4 py-2">
                            <Link href={`/tutor/classes/${w.groupId}`} className="font-semibold text-gray-900 hover:underline">{w.name}</Link>
                            {w.exempt ? <ExemptBadge /> : null}
                            <div className="text-xs text-gray-500">{[w.subject, w.visibility].filter(Boolean).join(' · ')}</div>
                          </td>
                          <td className="px-4 py-2">{w.tutorName}<div className="text-xs text-gray-500">{w.tutorEmail}</div></td>
                          <td className="px-4 py-2">{RULE_LABEL[w.rule]}<div className="text-xs text-gray-500">{w.reminded ? 'Reminder sent' : `Notice ${fmt(w.warnedAt)}`}</div></td>
                          <td className="px-4 py-2 whitespace-nowrap">{fmt(w.archiveOn)}</td>
                          <td className="px-4 py-2">{rowActions(w)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-lg font-bold text-gray-900">Archived by the rules, last 30 days ({data.archived.length})</h2>
              {data.archived.length === 0 ? (
                <p className="text-sm text-gray-500">None.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                      <tr><th className="px-4 py-2">Class</th><th className="px-4 py-2">Teacher</th><th className="px-4 py-2">Rule</th><th className="px-4 py-2">Archived</th><th className="px-4 py-2" /></tr>
                    </thead>
                    <tbody>
                      {data.archived.map((a) => (
                        <tr key={a.groupId} className="border-t border-gray-100">
                          <td className="px-4 py-2"><span className="font-semibold text-gray-900">{a.name}</span>{a.exempt ? <ExemptBadge /> : null}</td>
                          <td className="px-4 py-2">{a.tutorName}<div className="text-xs text-gray-500">{a.tutorEmail}</div></td>
                          <td className="px-4 py-2">{RULE_LABEL[a.rule]}</td>
                          <td className="px-4 py-2 whitespace-nowrap">{fmt(a.archivedAt)}</td>
                          <td className="px-4 py-2">
                            <Link href="/admin/classes?filter=archived" className="text-xs font-semibold text-indigo-700 hover:underline">Unarchive in Class Admin →</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-lg font-bold text-gray-900">Exemptions ({data.exemptions.length})</h2>
              <form onSubmit={submitForm} className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3">
                <label className="flex flex-col text-xs font-semibold text-gray-600">
                  Exempt
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'class' | 'teacher' })}
                    className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                    <option value="class">One class</option>
                    <option value="teacher">A teacher (all classes)</option>
                  </select>
                </label>
                <label className="flex min-w-[240px] flex-1 flex-col text-xs font-semibold text-gray-600">
                  {form.kind === 'class' ? 'Class ID or link' : 'Teacher email or ID'}
                  <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}
                    className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder={form.kind === 'class' ? 'https://myitutor.com/student/explore/…' : 'teacher@example.com'} />
                </label>
                <label className="flex min-w-[200px] flex-1 flex-col text-xs font-semibold text-gray-600">
                  Reason (optional)
                  <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="Partner school, seasonal exam prep…" />
                </label>
                <button type="submit" disabled={busy || !form.target.trim()}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  Add exemption
                </button>
              </form>
              {data.exemptions.length === 0 ? (
                <p className="text-sm text-gray-500">No exemptions.</p>
              ) : (
                <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                  {data.exemptions.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                      <div>
                        <ExemptBadge />{' '}
                        <span className="font-semibold text-gray-900">{e.kind === 'class' ? e.className : `${e.tutorName ?? 'Teacher'} — all classes`}</span>
                        {e.kind === 'class' && e.tutorName ? <span className="text-gray-500"> · {e.tutorName}</span> : null}
                        <div className="text-xs text-gray-500">{[e.reason, `since ${fmt(e.createdAt)}`].filter(Boolean).join(' · ')}</div>
                      </div>
                      <button disabled={busy} onClick={() => removeExemption(e.id)}
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        Remove exemption
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
