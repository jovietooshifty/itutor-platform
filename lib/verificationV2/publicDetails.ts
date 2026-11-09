// What the public "Verified teacher" page shows: the teacher's legal name, when their ID was verified,
// and their APPROVED qualifications as text. Never an image: not the ID, not the selfie, not a
// certificate. Students and parents get no file links from here.
//
// Server only. It returns null (the page answers 404) for any teacher who is not verified, so
// an unverified or in-progress teacher produces the same response as one that does not exist:
// nothing is said about verification. It never reads or returns the ID check, the selfie,
// provider data, a rejection reason or an admin note: it does not even select them.

import { loadPublicDetail } from './publicView';
import type { CredentialKind } from './constants';
import type { Db } from '@/lib/verification/setStatus';

export interface PublicCredentialLine {
  kind: CredentialKind;
  title: string | null;
  subject: string | null;
  grade: string | null;
  examYear: number | null;
  school: string | null;
  degree: string | null;
  field: string | null;
  graduationYear: number | null;
}

export interface VerificationDetailsPage {
  tutorId: string;
  /** First name + last name. */
  name: string | null;
  /** When the ID check passed. */
  verifiedAt: string | null;
  credentials: PublicCredentialLine[];
}

export async function loadVerificationDetailsPage(db: Db, tutorId: string): Promise<VerificationDetailsPage | null> {
  // null unless verified in BOTH records (the same rule as the badge).
  const base = await loadPublicDetail(db, tutorId);
  if (!base) return null;

  let name = base.legalName;
  if (!name) {
    const { data } = await db.from('profiles').select('full_name').eq('id', tutorId).maybeSingle();
    name = (data as { full_name?: string | null } | null)?.full_name || null;
  }
  return { tutorId, name, verifiedAt: base.idVerifiedAt, credentials: base.credentials };
}
