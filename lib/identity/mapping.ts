// THE ONE FILE where a provider's own statuses and error codes become our
// neutral outcomes. Add a provider, or learn a new code, here and nowhere else.
//
// Unknown codes are never guessed into a confident outcome: an unknown failure
// is `retryable_failure / unknown` and the raw code is kept (providerCode) so it
// shows up in coverage testing (docs/IDENTITY_COVERAGE_TEST.md).

import type { IdentityOutcome, OutcomeKind, ProviderOutcome, RetryReason, StoredIdentityStatus } from './types';

// ---------------------------------------------------------------
// Didit  (https://docs.didit.me, read 2026-10)
// ---------------------------------------------------------------
// Session statuses (documented): Not Started, In Progress, Approved, Declined,
// In Review, Awaiting User, Resubmitted, Expired, Abandoned, Kyc Expired.
// Warning codes (documented): QR_NOT_DETECTED, DATA_INCONSISTENT,
// IMAGE_TOO_BLURRY, LOW_LIVENESS_SCORE, LOW_FACE_MATCH_SIMILARITY,
// DOCUMENT_EXPIRED.
//
// TODO(didit, NOT DOCUMENTED): Didit's docs do not list a code for "this
// country or document type is not supported", nor a consent-declined signal.
// Until those are confirmed against the sandbox, an unsupported document shows
// up here as retryable_failure/unknown and the raw code is kept in providerCode.
// The ONLY not_supported case implemented is `minor`, from the documented
// `age` field. This is the first thing the coverage test must resolve.

const DIDIT_RETRY: Record<string, RetryReason> = {
  DOCUMENT_EXPIRED: 'document_expired',
  IMAGE_TOO_BLURRY: 'document_unreadable',
  LOW_LIVENESS_SCORE: 'liveness_failed',
  LOW_FACE_MATCH_SIMILARITY: 'face_mismatch',
  DATA_INCONSISTENT: 'document_invalid',
  QR_NOT_DETECTED: 'document_invalid',
};
const DIDIT_RETRY_PRIORITY = [
  'DOCUMENT_EXPIRED',
  'IMAGE_TOO_BLURRY',
  'LOW_LIVENESS_SCORE',
  'LOW_FACE_MATCH_SIMILARITY',
  'DATA_INCONSISTENT',
  'QR_NOT_DETECTED',
];

function diditRisks(decision: any): string[] {
  const out: string[] = [];
  for (const iv of decision?.id_verifications ?? []) {
    for (const w of iv?.warnings ?? []) if (typeof w?.risk === 'string') out.push(w.risk);
  }
  return out;
}

function diditMinorAge(decision: any, minimumAge: number): boolean {
  for (const iv of decision?.id_verifications ?? []) {
    if (typeof iv?.age === 'number' && iv.age < minimumAge) return true;
  }
  return false;
}

/** The name Didit read from the document, or null. Used for the profile-name comparison only. */
function diditDocumentName(decision: any): string | null {
  const v = decision?.id_verifications?.[0];
  if (!v) return null;
  const full = typeof v.full_name === 'string' ? v.full_name.trim() : '';
  if (full) return full;
  const joined = [v.first_name, v.last_name].filter((x: unknown) => typeof x === 'string' && x).join(' ').trim();
  return joined || null;
}

export function mapDiditDecision(decision: any, opts: { minimumAge: number }): ProviderOutcome {
  const withDoc = (o: ProviderOutcome): ProviderOutcome => ({
    ...o,
    documentType: decision?.id_verifications?.[0]?.document_type ?? null,
    documentName: diditDocumentName(decision),
    documentFirstName: typeof decision?.id_verifications?.[0]?.first_name === 'string' ? decision.id_verifications[0].first_name : null,
    documentLastName: typeof decision?.id_verifications?.[0]?.last_name === 'string' ? decision.id_verifications[0].last_name : null,
  });
  return withDoc(mapDiditDecisionCore(decision, opts));
}

function mapDiditDecisionCore(decision: any, opts: { minimumAge: number }): ProviderOutcome {
  const status: string = decision?.status ?? '';
  const risks = diditRisks(decision);
  const firstRisk = risks[0] ?? null;

  // Age comes from the document; it overrides Approved/Declined alike.
  if ((status === 'Approved' || status === 'Declined') && diditMinorAge(decision, opts.minimumAge)) {
    return { outcome: { kind: 'not_supported', reason: 'minor' }, providerCode: 'AGE_BELOW_MINIMUM' };
  }

  switch (status) {
    case 'Approved':
      return { outcome: { kind: 'verified' }, providerCode: null };
    case 'Declined': {
      const known = DIDIT_RETRY_PRIORITY.find((c) => risks.includes(c));
      return {
        outcome: { kind: 'retryable_failure', reason: known ? DIDIT_RETRY[known]! : 'unknown' },
        providerCode: known ?? firstRisk,
      };
    }
    case 'In Review':
      return { outcome: { kind: 'processing' }, providerCode: null };
    case 'Abandoned':
      return { outcome: { kind: 'retryable_failure', reason: 'abandoned' }, providerCode: 'ABANDONED' };
    case 'Expired':
    case 'Kyc Expired':
      return { outcome: { kind: 'canceled' }, providerCode: status.toUpperCase().replace(/ /g, '_') };
    // Not Started, In Progress, Awaiting User, Resubmitted, and anything new:
    // the teacher still has something to do. Never guessed into a result.
    default:
      return { outcome: { kind: 'pending' }, providerCode: null };
  }
}

// ---------------------------------------------------------------
// Stored form
// ---------------------------------------------------------------

/** The two columns an outcome is stored in: identity_status and identity_error_code. */
export function outcomeToStored(o: IdentityOutcome): { status: StoredIdentityStatus; reason: string | null } {
  switch (o.kind) {
    case 'retryable_failure':
    case 'not_supported':
      return { status: o.kind, reason: o.reason };
    default:
      return { status: o.kind, reason: null };
  }
}

const KINDS: OutcomeKind[] = ['verified', 'retryable_failure', 'not_supported', 'consent_declined', 'canceled', 'pending', 'processing'];

/**
 * Old development rows used another provider's status names.
 * Everything that reads identity_status goes through this, so the old values
 * keep working and nothing downstream ever sees them.
 */
export function normalizeIdentityStatus(raw: string | null | undefined): StoredIdentityStatus | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw === 'requires_input') return 'retryable_failure';
  if (raw === 'under_supported_age') return 'not_supported';
  return (KINDS as string[]).includes(raw) ? (raw as StoredIdentityStatus) : null;
}

/** An old row's stored reason for a legacy status (under_supported_age had no reason column value). */
export function normalizeIdentityReason(rawStatus: string | null | undefined, rawReason: string | null | undefined): string | null {
  if (rawStatus === 'under_supported_age') return 'minor';
  if (rawStatus === 'requires_input') {
    return 'unknown';
  }
  return rawReason ?? null;
}
