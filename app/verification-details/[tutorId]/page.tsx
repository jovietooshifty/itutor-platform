import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { getServiceClient } from '@/lib/supabase/server';
import type { Db } from '@/lib/verification/setStatus';
import { loadVerificationDetailsPage } from '@/lib/verificationV2/publicDetails';

// Public. Read per request so a revoke shows at once.
export const dynamic = 'force-dynamic';
// No title here on purpose: this metadata is sent even when the page answers "not found", and a
// title would then mention verification for a teacher who is not verified.
export const metadata: Metadata = { robots: { index: false, follow: false } };

const UUIDISH = /^[0-9a-zA-Z-]{1,64}$/;

function describe(c: { kind: string; title?: string | null; subject: string | null; grade: string | null; examYear: number | null; school: string | null; degree: string | null; field: string | null; graduationYear: number | null }) {
  if (c.title) return c.title;
  if (c.kind === 'DEGREE') {
    return `${c.degree ?? ''}${c.field ? `, ${c.field}` : ''}`;
  }
  return `${c.kind} ${c.subject ?? ''}`;
}

function detail(c: { kind: string; title?: string | null; grade: string | null; examYear: number | null; school: string | null; graduationYear: number | null }) {
  if (c.title) return '';
  return c.kind === 'DEGREE'
    ? [c.school, c.graduationYear].filter(Boolean).join(' · ')
    : [c.grade ? `Grade ${c.grade}` : null, c.examYear].filter(Boolean).join(' · ');
}

export default async function VerificationDetailsPage({ params }: { params: { tutorId: string } }) {
  // Anything that is not a verified teacher is a plain 404: the page says nothing about verification.
  if (!isVerificationV2Enabled() || !UUIDISH.test(params.tutorId)) notFound();

  let page;
  try {
    page = await loadVerificationDetailsPage(getServiceClient() as Db, params.tutorId);
  } catch {
    notFound();
  }
  if (!page) notFound();

  const when = page.verifiedAt
    ? new Date(page.verifiedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const label: Record<string, string> = {
    CERTIFICATE: 'CSEC or CAPE certificate',
    CSEC: 'CSEC certificate',
    CAPE: 'CAPE certificate',
    DEGREE: 'College or university degree',
    TEACHING: 'Teaching qualification or licence',
    OTHER: 'Other qualification',
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-ink">
      <header>
        <Link href={`/tutors/${page.tutorId}`} className="text-xs text-muted-foreground hover:text-ink">
          ← Back to profile
        </Link>
        <h1 className="mt-2 text-2xl font-bold lg:text-3xl">Verified teacher</h1>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-lg font-semibold">{page.name ?? 'This teacher'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{when ? `ID verified on ${when}` : 'ID verified'}</p>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <h2 className="border-b border-border px-5 py-4 font-semibold">Qualifications</h2>
        {page.credentials.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No qualifications to show yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {page.credentials.map((c, i) => (
              <li key={i} className="px-5 py-4">
                <p className="font-medium">{describe(c)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[label[c.kind], detail(c)].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
