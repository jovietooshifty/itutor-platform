// The teacher's name is the name on their ID. When the identity check passes, the first and last name
// the provider read from the document become their legal name (tutor_verification_v2.legal_*), and
// the profile name everyone sees (full_name and display_name) is set to it. Only the two names are
// kept: never the ID image, the number, the birth date or anything else from the document.

import type { Db } from '@/lib/verification/setStatus';
import { nameMatchExtra } from './nameMatch';
import type { ProviderOutcome } from './types';

/** Collapse spaces; an all-capitals name from a document ("ZOE RAMDHANIE") becomes "Zoe Ramdhanie". */
export function tidyName(raw: string | null | undefined): string {
  const s = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}

/** The first and last name of a document, or null when the provider gave neither a split nor a full name. */
export function documentNames(o: Pick<ProviderOutcome, 'documentFirstName' | 'documentLastName' | 'documentName'>) {
  const first = tidyName(o.documentFirstName);
  const last = tidyName(o.documentLastName);
  if (first && last) return { first, last };
  const parts = tidyName(o.documentName).split(' ').filter(Boolean);
  if (parts.length >= 2) return { first: parts[0], last: parts.slice(1).join(' ') };
  return null;
}

/**
 * The extra columns written with an identity result: whether the name the teacher had typed matches
 * the ID (a yes or no), and, when the check PASSED, the legal name from the ID.
 */
export async function identityNameExtra(
  db: Db,
  tutorId: string,
  result: Pick<ProviderOutcome, 'outcome' | 'documentFirstName' | 'documentLastName' | 'documentName'>
): Promise<Record<string, unknown> | undefined> {
  const match = await nameMatchExtra(db, tutorId, result.documentName ?? [result.documentFirstName, result.documentLastName].filter(Boolean).join(' '));
  if (result.outcome.kind !== 'verified') return match;
  const names = documentNames(result);
  if (!names) return match;
  return {
    ...(match ?? {}),
    legal_first_name: names.first,
    legal_last_name: names.last,
    name_source: 'id',
    name_confirmed_at: new Date().toISOString(),
  };
}

/** Makes the name everyone sees match the legal name. Server only (a teacher cannot do this). Never throws. */
export async function syncProfileName(db: Db, tutorId: string, first: string, last: string): Promise<boolean> {
  const full = `${first} ${last}`.trim();
  if (!full) return false;
  try {
    const { error } = await db.from('profiles').update({ full_name: full, display_name: full }).eq('id', tutorId);
    if (error) {
      console.error('[legal-name] profile name not updated:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[legal-name] profile name not updated:', (err as Error).message);
    return false;
  }
}

/** After an identity result was saved: when it passed, put the ID's name on the profile. */
export async function applyIdentityName(
  db: Db,
  tutorId: string,
  result: Pick<ProviderOutcome, 'outcome' | 'documentFirstName' | 'documentLastName' | 'documentName'>
): Promise<void> {
  if (result.outcome.kind !== 'verified') return;
  const names = documentNames(result);
  if (names) await syncProfileName(db, tutorId, names.first, names.last);
}
