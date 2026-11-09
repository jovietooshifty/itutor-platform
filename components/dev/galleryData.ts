// DEV ONLY fixtures for /dev/verification-states. No backend, no real people.

import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import type { Item } from '@/components/admin/verificationV2/AdminV2Queue';
import type { ReviewDetail } from '@/components/admin/verificationV2/AdminV2Review';
import type { PublicDetail } from '@/lib/verificationV2/publicView';
import { identityRouting } from '@/config/identityRouting';

export function mkState(
  over: Omit<Partial<VerificationV2StateDto>, 'identity'> & { identity?: Partial<VerificationV2StateDto['identity']> } = {}
): VerificationV2StateDto {
  const { identity, ...rest } = over;
  return {
    status: 'IN_PROGRESS',
    consentAt: '2026-10-01T10:00:00.000Z',
    submittedAt: null,
    decisionReason: null,
    reference: 'VR-7D3B1F42',
    editable: true,
    canAddCredentials: true,
    steps: { name: 'not_started', identity: 'not_started', credentials: 'not_started' },
    name: { firstName: null, lastName: null, source: null, canEdit: true, prompt: false },
    stepNotes: { identity: null, credentials: null },
    canSubmit: false,
    missing: ['Name', 'ID check', 'Credentials'],
    step: 2,
    credentials: [],
    ...rest,
    identity: {
      status: null,
      reason: null,
      country: null,
      attempts: 0,
      maxAttempts: identityRouting.maxTotalAttempts,
      canRetry: false,
      furtherRoute: false,
      countries: identityRouting.countries,
      available: true,
      ...identity,
    },
  };
}

export const CREDENTIALS: VerificationV2StateDto['credentials'] = [
  { id: 'c1', title: 'CSEC Mathematics, Grade I (2019)', kind: 'CSEC', subject: 'Mathematics', grade: 'I', examYear: 2019, school: null, degree: null, field: null, graduationYear: null, proofUrl: 'https://example.com/proof', proofFilename: null, hasProofFile: false, pending: false },
  { id: 'c2', title: 'BSc Physics, UWI (2022)', kind: 'DEGREE', subject: null, grade: null, examYear: null, school: 'University of the West Indies', degree: 'BSc', field: 'Physics', graduationYear: 2022, proofUrl: null, proofFilename: 'degree.pdf', hasProofFile: true, pending: false },
];

export const QUEUE_ITEMS: Item[] = [
  { tutorId: 't1', name: 'Tia Tutor', email: 'tia@example.com', status: 'IN_REVIEW', identityStatus: 'verified', submittedAt: '2026-10-02T09:00:00.000Z', decidedAt: null, credentialCount: 2 },
  { tutorId: 't2', name: 'Raj Teacher', email: 'raj@example.com', status: 'IN_REVIEW', identityStatus: 'verified', submittedAt: '2026-10-03T14:30:00.000Z', decidedAt: null, credentialCount: 1 },
];

export function mkDetail(
  over: Partial<ReviewDetail['application']> = {},
  provider: string | null = 'didit',
  decisions: ReviewDetail['decisions'] = []
): ReviewDetail {
  return {
    tutor: { id: 't1', name: 'Tia Tutor', email: 'tia@example.com', profileStatus: 'PENDING' },
    application: {
      status: 'IN_REVIEW',
      consentAt: '2026-10-01T10:00:00.000Z',
      identity: { status: 'verified', errorCode: null, provider, providerCode: null, country: 'TT', attempts: 1, verifiedAt: '2026-10-01T10:05:00.000Z', redacted: false },
      submittedAt: '2026-10-02T09:00:00.000Z',
      decisionReason: null,
      decidedAt: null,
      filesDeleted: false,
      ...over,
    },
    credentials: [
      {
        id: 'c1', kind: 'CSEC', subject: 'Mathematics', grade: 'I', examYear: 2019, school: null, degree: null, field: null, graduationYear: null,
        proofUrl: null, proofFilename: 'results.pdf', proofLink: '#', proofDeleted: false,
        evidence: [
          { key: 'example-maths-csec', label: 'CSEC Mathematics (example placeholder)', criteria: ['TODO(policy): criteria specific to Mathematics'] },
          { key: 'csec-general', label: 'CSEC (general)', criteria: ['TODO(policy): minimum acceptable grade for teaching this subject', 'The candidate name on the proof matches the teacher’s ID-checked name'] },
        ],
      },
    ],
    decisions,
  };
}

export const PANEL_DETAIL: PublicDetail = {
  tutorId: '7d3b1f42-0a55-4e6c-8f21-9a4c2e6b1d03',
  idChecked: true,
  credentialsReviewed: true,
  verifiedAt: '2026-10-05T12:00:00.000Z',
  idVerifiedAt: '2026-10-05T12:00:00.000Z',
  legalName: 'Zoë Ramdhanie',
  credentials: [
    { kind: 'CERTIFICATE', title: 'CSEC Mathematics, Grade I (2019)', subject: 'Mathematics', grade: 'I', examYear: 2019, school: null, degree: null, field: null, graduationYear: null },
    { kind: 'DEGREE', title: 'BSc Chemistry, UWI (2023)', subject: null, grade: null, examYear: null, school: 'University of the West Indies', degree: 'BSc', field: 'Physics', graduationYear: 2022 },
  ],
};
