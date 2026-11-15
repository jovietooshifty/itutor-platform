/**
 * The optional "iTutor Verified" badge as the canvas draws it (m27, d11): one
 * status out of five steps. Derived from GET /api/verification/request, which
 * answers the profile's tutor_verification_status plus the latest request.
 *
 * - profile VERIFIED, or a latest request APPROVED -> Approved
 * - latest request REJECTED                        -> Changes requested
 * - latest request PROCESSING / READY_FOR_REVIEW   -> Under review
 * - latest request SUBMITTED                       -> Submitted
 * - no request                                     -> Not applied
 *
 * A profile at PROCESSING with no readable request still counts as under
 * review rather than "Not applied", so the screen never invites a second
 * application while one is open.
 */

export const VERIFY_STEPS = ['Not applied', 'Submitted', 'Under review', 'Changes requested', 'Approved'] as const;
export type VerifyStep = (typeof VERIFY_STEPS)[number];

export interface VerificationState {
  verificationStatus: string | null;
  pendingCount?: number;
  latestRequest: {
    status: string;
    reviewer_reason?: string | null;
    system_reason?: string | null;
    created_at?: string;
  } | null;
}

export function verifyStep(v: VerificationState | null): VerifyStep {
  if (!v) return 'Not applied';
  const profile = (v.verificationStatus ?? '').toUpperCase();
  const req = (v.latestRequest?.status ?? '').toUpperCase();
  if (profile === 'VERIFIED' || req === 'APPROVED') return 'Approved';
  if (req === 'REJECTED') return 'Changes requested';
  if (req === 'PROCESSING' || req === 'READY_FOR_REVIEW') return 'Under review';
  if (req === 'SUBMITTED') return 'Submitted';
  if (profile === 'PROCESSING' || profile === 'PENDING') return 'Under review';
  return 'Not applied';
}

/** Tag tone for the step, matching Tag's tones. */
export function verifyTone(step: VerifyStep): 'brand' | 'warning' | 'danger' | 'outline' {
  if (step === 'Approved') return 'brand';
  if (step === 'Changes requested') return 'danger';
  if (step === 'Submitted' || step === 'Under review') return 'warning';
  return 'outline';
}

/** Short label for the profile header chip. */
export function verifyChip(step: VerifyStep): string {
  if (step === 'Approved') return 'Verified';
  if (step === 'Submitted' || step === 'Under review') return 'Verification under review';
  if (step === 'Changes requested') return 'Verification needs changes';
  return 'Not verified';
}

export async function fetchVerification(): Promise<VerificationState | null> {
  try {
    const res = await fetch('/api/verification/request', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as VerificationState;
  } catch {
    return null;
  }
}
