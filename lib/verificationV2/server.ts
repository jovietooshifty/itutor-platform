// Server-only helpers for the v2 verification routes.
// Every write in v2 goes through getServiceClient(): teachers have no write
// policy on tutor_verification_v2, and a trigger blocks profile status writes
// from anything but the service role.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireTutor } from '@/lib/middleware/tutorAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { isVerificationV2Enabled } from '@/lib/featureFlags/verificationV2';
import { isRuleRefusal, setIdentityStatus } from '@/lib/verification/setStatus';
import { identityRouting } from '@/config/identityRouting';
import { notifyIdentityOutcome } from './notify';
import { describeNotSupported, describeRetryReason } from '@/lib/identity/messages';
import { applyIdentityName, identityNameExtra } from '@/lib/identity/legalName';
import { normalizeIdentityReason, normalizeIdentityStatus, outcomeToStored } from '@/lib/identity/mapping';
import { getProvider, routeForCountry } from '@/lib/identity/registry';
import { decideNextStep } from '@/lib/identity/routing';
import { isProviderName, type ProviderName } from '@/lib/identity/types';
import {
  type CredentialDto,
  type IdentityStatus,
  type VerificationV2StateDto,
  type StepStatus,
  type VerificationV2Status,
} from './constants';

export type Db = SupabaseClient<any, 'public', any>;

export interface VerificationRow {
  tutor_id: string;
  status: VerificationV2Status;
  consent_at: string | null;
  consent_version: string | null;
  identity_status: IdentityStatus | null;
  /** The NEUTRAL reason (retry reason / not-supported reason), not a provider code. */
  identity_error_code: string | null;
  identity_attempts: number;
  identity_verified_at: string | null;
  /** Every session ever created, for redaction. */
  identity_session_history: string[] | null;
  identity_provider: ProviderName | null;
  identity_provider_session_ref: string | null;
  identity_session_refs: { provider: ProviderName; ref: string }[] | null;
  identity_providers_tried: ProviderName[] | null;
  identity_country: string | null;
  submitted_at: string | null;
  decision_reason: string | null;
  /** The teacher's legal name: typed by them, or read from the ID (then it replaces what they typed). */
  legal_first_name: string | null;
  legal_last_name: string | null;
  name_source: 'teacher' | 'id' | null;
  name_confirmed_at: string | null;
  /** Set when an admin approves: from then on the name cannot be changed. */
  name_locked_at: string | null;
}

const ROW_COLUMNS =
  'tutor_id, status, consent_at, consent_version, identity_status, identity_error_code, identity_attempts, identity_verified_at, identity_session_history, identity_provider, identity_provider_session_ref, identity_session_refs, identity_providers_tried, identity_country, submitted_at, decision_reason, legal_first_name, legal_last_name, name_source, name_confirmed_at, name_locked_at';

/**
 * Old development rows hold another provider's status names.
 * Everything downstream of here only ever sees the neutral ones.
 */
function normalizeRow(raw: any): VerificationRow {
  return {
    ...raw,
    identity_status: normalizeIdentityStatus(raw.identity_status),
    identity_error_code: normalizeIdentityReason(raw.identity_status, raw.identity_error_code),
  } as VerificationRow;
}

export function notFound() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

/**
 * Flag, then tutor auth. 404 when the flag is off so the feature is invisible.
 *
 * A REVOKED teacher is refused here (403) for every route except the read-only
 * state route (`allowRevoked`), so no step of the new flow can be used to get
 * back to "in review". The wall is also in lib/verification/transitions.ts.
 */
export async function guardV2(opts: { allowRevoked?: boolean } = {}): Promise<
  | { error: NextResponse; tutorId?: undefined; db?: undefined; revoked?: undefined; profileStatus?: undefined }
  | { error: null; tutorId: string; db: Db; revoked: boolean; profileStatus: string | null }
> {
  if (!isVerificationV2Enabled()) return { error: notFound() };
  const auth = await requireTutor();
  if (auth.error || !auth.user) {
    return { error: auth.error ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const revoked = auth.profile?.tutor_verification_status === 'REVOKED';
  if (revoked && !opts.allowRevoked) {
    return {
      error: NextResponse.json(
        { error: 'Your verification was revoked. Please contact support.', code: 'locked_revoked' },
        { status: 403 }
      ),
    };
  }
  return {
    error: null,
    tutorId: auth.user.id,
    db: getServiceClient() as Db,
    revoked,
    profileStatus: auth.profile?.tutor_verification_status ?? null,
  };
}

export async function loadRow(db: Db, tutorId: string): Promise<VerificationRow | null> {
  const { data, error } = await db
    .from('tutor_verification_v2')
    .select(ROW_COLUMNS)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeRow(data) : null;
}

export function isEditable(row: VerificationRow | null): boolean {
  return (
    !row ||
    row.status === 'IN_PROGRESS' ||
    row.status === 'REJECTED' ||
    row.status === 'REVERIFICATION_REQUIRED'
  );
}

/** Step 1 done. */
export function hasConsent(row: VerificationRow | null): boolean {
  return !!row?.consent_at;
}

/** True when this teacher's identity check can be started at all (a provider is configured). */
export function identityAvailable(row: VerificationRow | null): boolean {
  return routeForCountry(row?.identity_country).length > 0;
}

/**
 * The identity step no longer holds anything up: it is done, or this environment has no
 * provider to run it (so it cannot be done here yet). Consent is still required.
 */
export function identityStepDone(row: VerificationRow | null): boolean {
  return hasConsent(row) && (row?.identity_status === 'verified' || !identityAvailable(row));
}

/** A verified teacher may add credentials (as pending approval). */
export function isVerifiedTeacher(row: VerificationRow | null): boolean {
  return row?.status === 'VERIFIED';
}

/** Steps 1 and 2 done. */
export function hasIdentity(row: VerificationRow | null): boolean {
  return hasConsent(row) && row?.identity_status === 'verified';
}

export function blocked(error: string, status = 409, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/**
 * Asks the teacher's provider where their session stands and stores the result.
 * Used on page load and when the teacher returns from the provider, so the page
 * does not depend on a webhook arriving first. Never throws: if the provider is
 * unreachable the saved status is returned unchanged. Provider-agnostic: it only
 * ever sees neutral outcomes.
 */
export async function refreshIdentity(db: Db, row: VerificationRow): Promise<VerificationRow> {
  const provider: ProviderName | null = row.identity_provider;
  const ref = row.identity_provider_session_ref;
  const open: Array<IdentityStatus | null> = [null, 'pending', 'processing', 'retryable_failure'];
  if (!provider || !ref || !open.includes(row.identity_status)) return row;
  try {
    const fetched = await getProvider(provider).getOutcome(ref);
    const { outcome, providerCode, documentType } = fetched;
    const stored = outcomeToStored(outcome);
    if (stored.status === row.identity_status && stored.reason === row.identity_error_code) return row;

    // Through the one status function: a passed check is never downgraded and a
    // result for a replaced session is ignored.
    const result = await setIdentityStatus({
      tutorId: row.tutor_id,
      to: stored.status,
      reason: stored.reason,
      providerCode,
      documentType,
      actor: 'system',
      sessionRef: ref,
      provider,
      extra: await identityNameExtra(db, row.tutor_id, fetched),
      db,
    });
    if (!result.ok) {
      if (!isRuleRefusal(result) && result.code !== 'stale_session' && result.code !== 'conflict') {
        console.warn('[verification-v2] identity refresh not saved:', result.message);
      }
      return row;
    }
    await applyIdentityName(db, row.tutor_id, fetched);
    // A failed check is announced once (dedupe key); a failure to write it is logged, not shown.
    await notifyIdentityOutcome(db, row.tutor_id, stored.status, stored.reason);
    return { ...row, identity_status: stored.status as IdentityStatus, identity_error_code: stored.reason };
  } catch (err) {
    console.warn('[verification-v2] identity refresh failed:', (err as Error).message);
    return row;
  }
}

export async function loadCredentials(db: Db, tutorId: string): Promise<CredentialDto[]> {
  const { data, error } = await db
    .from('tutor_credentials_v2')
    .select(
      'id, kind, subject, grade, exam_year, school, degree, field, graduation_year, proof_url, proof_path, proof_filename, pending_approval, title'
    )
    .eq('tutor_id', tutorId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: c.id,
    kind: c.kind,
    title: c.title ?? null,
    subject: c.subject,
    grade: c.grade,
    examYear: c.exam_year,
    school: c.school,
    degree: c.degree,
    field: c.field,
    graduationYear: c.graduation_year,
    proofUrl: c.proof_url,
    proofFilename: c.proof_filename,
    hasProofFile: !!c.proof_path,
    pending: !!c.pending_approval,
  }));
}

/** Which checklist step an admin's reason is about. 'Other' is about neither, so it flags no step. */
export function stepForReason(reason: string | null | undefined): 'identity' | 'credentials' | null {
  if (!reason) return null;
  if (reason === 'ID could not be read' || reason === 'ID details did not match your profile name') return 'identity';
  if (reason === 'Credentials unclear or incomplete' || reason === 'Credentials could not be confirmed') return 'credentials';
  return null;
}

export function buildState(
  row: VerificationRow | null,
  credentials: CredentialDto[],
  profileStatus: string | null = null
): VerificationV2StateDto {
  const revokedProfile = profileStatus === 'REVOKED';
  const identityStatus = row?.identity_status ?? null;
  const attempts = row?.identity_attempts ?? 0;
  const currentProvider: ProviderName | null = isProviderName(row?.identity_provider) ? (row!.identity_provider as ProviderName) : null;

  // What the buttons offer, from the same routing the server uses to act.
  const nextStep = decideNextStep({
    route: routeForCountry(row?.identity_country),
    status: identityStatus,
    current: currentProvider,
    attempts,
    tried: (row?.identity_providers_tried ?? []) as ProviderName[],
  });
  const canRetry = nextStep.action === 'retry_same';
  const furtherRoute = nextStep.action === 'next';

  // No provider configured: the identity step cannot be done here yet, and it must not hold
  // up the qualifications or the submission. An admin cannot approve until it is done.
  const available = routeForCountry(row?.identity_country).length > 0;
  const identityDone = hasIdentity(row) || (hasConsent(row) && !available);

  // ---- the checklist: each step's own state, in any order ----
  // The admin's reason, shown for a rejection, a request for more information, a removal, and the
  // application a removed teacher started again.
  const reasonText =
    row?.decision_reason && ['REJECTED', 'IN_PROGRESS', 'REVOKED', 'REVERIFICATION_REQUIRED'].includes(row.status) ? row.decision_reason : null;
  const reasonStep = stepForReason(reasonText);
  const idFailed = ['retryable_failure', 'not_supported', 'consent_declined', 'canceled'].includes(identityStatus ?? '');
  const identityStep: StepStatus =
    row?.status === 'VERIFIED' || (identityStatus === 'verified' && reasonStep !== 'identity')
      ? 'done'
      : idFailed || reasonStep === 'identity'
        ? 'needs_changes'
        : identityStatus === 'pending' || identityStatus === 'processing' || hasConsent(row)
          ? 'in_progress'
          : 'not_started';
  const credentialsStep: StepStatus =
    row?.status === 'VERIFIED' && credentials.length === 0
      ? 'done'
      : credentials.length === 0
        ? 'not_started'
        : reasonStep === 'credentials'
          ? 'needs_changes'
          : 'done';
  // The legal name: typed by the teacher, then replaced by the name on the ID when the check passes.
  const hasName = !!(row?.legal_first_name && row?.legal_last_name);
  const idStarted = ['pending', 'processing', 'verified'].includes(identityStatus ?? '');
  const canEditName =
    !revokedProfile &&
    !row?.name_locked_at &&
    !idStarted &&
    (isEditable(row) || (row?.status === 'VERIFIED' && !row.name_confirmed_at));
  const namePrompt = row?.status === 'VERIFIED' && !row.name_confirmed_at && !row.name_locked_at;
  const nameStep: StepStatus = hasName ? 'done' : namePrompt ? 'needs_changes' : 'not_started';
  // The ID check cannot be done on an environment with no Didit: then it must not hold anything up.
  const idOk = hasConsent(row) && (identityStatus === 'verified' || !available);
  const missing: string[] = [];
  if (!hasName) missing.push('Name');
  if (!idOk) missing.push('ID check');
  if (credentials.length === 0) missing.push('Credentials');
  const canSubmit = !revokedProfile && isEditable(row) && missing.length === 0;

  let step: 1 | 2 | 3 | 4 = 1;
  if (hasConsent(row)) step = 2;
  if (identityDone) step = 3;
  if (identityDone && credentials.length > 0) step = 4;

  // A teacher whose PROFILE is revoked is revoked here too, whatever the v2
  // row says (or whether it exists), and cannot edit.
  // An admin asked this teacher to verify again (profile status). It shows until
  // they submit, after which the v2 row's own IN_REVIEW takes over.
  const reverify =
    profileStatus === 'REVERIFICATION_REQUIRED' && (!row || row.status !== 'IN_REVIEW');
  const status: VerificationV2StateDto['status'] = revokedProfile
    ? 'REVOKED'
    : reverify
      ? 'REVERIFICATION_REQUIRED'
      : (row?.status ?? 'NOT_STARTED');

  return {
    status,
    consentAt: row?.consent_at ?? null,
    identity: {
      status: identityStatus,
      reason: row?.identity_error_code ?? null,
      country: row?.identity_country ?? null,
      attempts,
      maxAttempts: identityRouting.maxTotalAttempts,
      canRetry,
      furtherRoute,
      countries: identityRouting.countries,
      available,
    },
    submittedAt: row?.submitted_at ?? null,
    // The reason an admin gave (one of a fixed list), for a rejection or a request for more information.
    decisionReason: reasonText,
    reference: row ? `VR-${row.tutor_id.replace(/-/g, '').slice(0, 8).toUpperCase()}` : null,
    editable: !revokedProfile && isEditable(row),
    canAddCredentials: !revokedProfile && (isEditable(row) || isVerifiedTeacher(row)),
    steps: { name: nameStep, identity: identityStep, credentials: credentialsStep },
    name: {
      firstName: row?.legal_first_name ?? null,
      lastName: row?.legal_last_name ?? null,
      source: row?.name_source ?? null,
      canEdit: canEditName,
      prompt: namePrompt,
    },
    stepNotes: {
      identity:
        reasonStep === 'identity'
          ? reasonText
          : identityStatus === 'retryable_failure'
            ? describeRetryReason(row?.identity_error_code ?? null)
            : identityStatus === 'not_supported'
              ? describeNotSupported(row?.identity_error_code ?? null)
              : null,
      credentials: reasonStep === 'credentials' ? reasonText : null,
    },
    canSubmit,
    missing,
    step,
    credentials,
  };
}

export async function loadState(
  db: Db,
  tutorId: string,
  profileStatus: string | null = null
): Promise<VerificationV2StateDto> {
  let row = await loadRow(db, tutorId);
  // A revoked teacher's state is read-only: do not call the provider on their behalf.
  if (row && profileStatus !== 'REVOKED') row = await refreshIdentity(db, row);
  const credentials = await loadCredentials(db, tutorId);
  return buildState(row, credentials, profileStatus);
}
