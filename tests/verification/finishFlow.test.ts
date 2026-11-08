// The finished teacher verification, end to end against the in-memory database:
// steps in any order, the clue under each credential type, submit then approve, the exact name and
// exact images on the public details page, revoke and re-approve, admin-only access, signed image
// links, legacy-verified teachers, old URLs and no leftover legacy code.
//
// Everything here is created and thrown away inside the test. No real row is read or written.

import { createHash, createHmac } from 'crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import path from 'path';
import { deflateSync } from 'zlib';
import { NextRequest, NextResponse } from 'next/server';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ db: null as any, auth: null as any }));

vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.db }));
vi.mock('@/lib/supabase/client', () => ({ supabase: {} }));
vi.mock('@/lib/middleware/adminAuth', () => ({ requireAdmin: async () => h.auth }));
vi.mock('@/lib/identity/registry', async (orig) => ({
  ...(await orig<typeof import('@/lib/identity/registry')>()),
  getProvider: () => ({ redact: async () => ({ ok: true }) }) as any,
}));
vi.mock('@/lib/verificationV2/server', async (orig) => ({
  ...(await orig<typeof import('@/lib/verificationV2/server')>()),
  guardV2: async () => ({ error: null, tutorId: '11111111-1111-1111-1111-111111111111', db: h.db, revoked: false, profileStatus: null }),
}));

import { POST as consentPOST } from '@/app/api/tutor/verification-v2/consent/route';
import { POST as addCredential } from '@/app/api/tutor/verification-v2/credentials/route';
import { POST as addExtra } from '@/app/api/tutor/verification-v2/extras/route';
import { POST as submitPOST } from '@/app/api/tutor/verification-v2/submit/route';
import { GET as stateGET } from '@/app/api/tutor/verification-v2/state/route';
import { GET as adminDetail } from '@/app/api/admin/verification-v2/[tutorId]/route';
import { POST as approvePOST } from '@/app/api/admin/verification-v2/[tutorId]/approve/route';
import { POST as revokePOST } from '@/app/api/admin/verification-v2/[tutorId]/revoke/route';
import { POST as reapprovePOST } from '@/app/api/admin/verification-v2/[tutorId]/reapprove/route';
import { GET as summaryGET } from '@/app/api/public/verification-v2/summary/route';
import { GET as publicDetailGET } from '@/app/api/public/verification-v2/[tutorId]/route';
import { loadVerificationDetailsPage } from '@/lib/verificationV2/publicDetails';
import { loadPublicSummaries } from '@/lib/verificationV2/publicView';
import CredentialsStep from '@/components/tutor/verificationV2/CredentialsStep';
import { CREDENTIAL_TITLE_CLUE, CREDENTIAL_TYPES, CREDENTIAL_UPLOAD_CLUE } from '@/lib/verificationV2/constants';
import { DECISION_REASONS } from '@/lib/verificationV2/reasons';
import { reviewerPolicy } from '@/config/verificationReview';

const T = '11111111-1111-1111-1111-111111111111';
const ADMIN = { id: 'adm-1', role: 'admin', is_reviewer: false, full_name: 'Ada Admin', display_name: null, email: 'ada@itutor.test' };
const REVIEWER = { id: 'rev-1', role: 'student', is_reviewer: true, email: 'rev@itutor.test' };
const params = { params: { tutorId: T } };
const BUCKET = 'tutor-credential-proofs';

const jsonReq = (body: unknown, method = 'POST') =>
  new NextRequest('http://localhost/x', { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const get = (url = 'http://localhost/x') => new NextRequest(url);
const asAdmin = (profile: any) => (h.auth = { error: null, user: { id: profile.id }, profile });

// ---- two PNGs that look nothing alike (solid red, solid blue), so a mix-up changes the checksum ----
function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function solidPng(r: number, g: number, b: number) {
  const w = 16;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(w, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: w }, () => row));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const RED = solidPng(220, 30, 30);
const BLUE = solidPng(30, 30, 220);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

// ---- a bucket that holds real bytes and hands out signed links that can be checked ----
const SIGN_KEY = 'storage-signing-key';
const sign = (p: string, exp: number) => createHmac('sha256', SIGN_KEY).update(`${p}|${exp}`).digest('hex');
let now = 1_800_000_000;
function installStorage(db: any, objects: Map<string, Buffer>) {
  db.storage = {
    from(bucket: string) {
      return {
        async list(folder: string, o: { search?: string } = {}) {
          const names = [...objects.keys()]
            .filter((k) => k.startsWith(`${bucket}/${folder}/`))
            .map((k) => k.slice(`${bucket}/${folder}/`.length))
            .filter((n) => !o.search || n.includes(o.search));
          return { data: names.map((name) => ({ name, metadata: { size: objects.get(`${bucket}/${folder}/${name}`)!.length } })), error: null };
        },
        async remove(paths: string[]) {
          for (const p of paths) objects.delete(`${bucket}/${p}`);
          return { data: [], error: null };
        },
        async createSignedUrl(p: string, seconds: number) {
          const exp = now + seconds;
          return { data: { signedUrl: `https://storage.test/object/sign/${bucket}/${p}?token=${sign(`${bucket}/${p}`, exp)}&exp=${exp}` }, error: null };
        },
      };
    },
  };
}
/** What the storage service does with a link: serves the bytes only for a valid, unexpired signature. */
function fetchSigned(objects: Map<string, Buffer>, url: string): { status: number; body?: Buffer } {
  const u = new URL(url);
  const objectPath = decodeURIComponent(u.pathname.replace('/object/sign/', ''));
  const token = u.searchParams.get('token');
  const exp = Number(u.searchParams.get('exp'));
  if (!token || !exp) return { status: 400 };
  if (token !== sign(objectPath, exp)) return { status: 403 };
  if (exp < now) return { status: 403 };
  const body = objects.get(objectPath);
  return body ? { status: 200, body } : { status: 404 };
}

let objects: Map<string, Buffer>;
let uploadN = 0;
/** The browser uploads the file first; this puts it in the bucket and returns its path. */
function upload(bytes: Buffer, ext = 'png') {
  uploadN += 1;
  const p = `${T}/00000000-0000-4000-8000-${String(uploadN).padStart(12, '0')}.${ext}`;
  objects.set(`${BUCKET}/${p}`, bytes);
  return p;
}

function seed(over: { v2?: Record<string, any> | null; profile?: Record<string, any>; creds?: any[] } = {}) {
  h.db = makeFakeDb({
    profiles: [
      { id: T, role: 'tutor', full_name: 'Zoë Ramdhanie', display_name: 'ZR', email: 'zoe@example.test', tutor_verification_status: 'UNVERIFIED', ...(over.profile ?? {}) },
      { id: ADMIN.id, role: 'admin', full_name: 'Ada Admin', display_name: null, email: ADMIN.email },
    ],
    tutor_verification_v2:
      over.v2 === null ? [] : [{ tutor_id: T, status: 'IN_PROGRESS', consent_at: null, identity_status: null, identity_attempts: 0, ...(over.v2 ?? {}) }],
    tutor_credentials_v2: over.creds ?? [],
    tutor_extras_v2: [],
    tutor_verification_v2_decisions: [],
    notifications: [],
    tutor_verified_subjects: [],
  });
  objects = new Map();
  installStorage(h.db, objects);
}
const row = () => h.db.tables.tutor_verification_v2[0];
const state = async () => (await stateGET()).json();

beforeEach(() => {
  process.env.VERIFICATION_V2_ENABLED = 'true';
  vi.stubEnv('DIDIT_API_KEY', 'k');
  vi.stubEnv('DIDIT_WORKFLOW_ID', 'w');
  vi.stubEnv('DIDIT_WEBHOOK_SECRET', 's');
  reviewerPolicy.namedReviewerIds = [];
  reviewerPolicy.namedReviewerEmails = [];
  asAdmin(ADMIN);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  seed();
});
afterEach(() => {
  delete process.env.VERIFICATION_V2_ENABLED;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ===========================================================================================
describe('the checklist: steps in any order', () => {
  type Step = 'id' | 'cred' | 'extra';
  const ORDERS: Step[][] = [
    ['id', 'cred', 'extra'], ['id', 'extra', 'cred'], ['cred', 'id', 'extra'],
    ['cred', 'extra', 'id'], ['extra', 'id', 'cred'], ['extra', 'cred', 'id'],
  ];

  async function doStep(s: Step) {
    if (s === 'id') {
      expect((await consentPOST(jsonReq({ accepted: true }))).status).toBe(200);
      // What the Didit webhook records when the check passes (the webhook itself is covered in
      // identityProviders.test.ts).
      Object.assign(row(), { identity_status: 'verified', identity_attempts: 1, identity_verified_at: '2026-10-01T10:00:00Z' });
    } else if (s === 'cred') {
      const res = await addCredential(jsonReq({ kind: 'CERTIFICATE', title: 'CSEC Chemistry, Grade I (2019)', proofPath: upload(RED), proofFilename: 'chem.png' }));
      expect(res.status).toBe(201);
    } else {
      const res = await addExtra(jsonReq({ title: 'Robotics coach', description: 'Ran the school robotics club' }));
      expect(res.status).toBe(201);
    }
  }

  for (const order of ORDERS) {
    it(`order ${order.join(' > ')}: nothing is locked, each step has its own state, and submit works at the end`, async () => {
      seed();
      let sawSubmittable = false;
      for (const [i, s] of order.entries()) {
        await doStep(s);
        const st = await state();
        // the step just done is done
        expect(st.steps[{ id: 'identity', cred: 'credentials', extra: 'details' }[s]]).toBe('done');
        // required steps decide Submit, whatever the order
        const idDone = order.slice(0, i + 1).includes('id');
        const credDone = order.slice(0, i + 1).includes('cred');
        expect(st.canSubmit).toBe(idDone && credDone);
        expect(st.missing).toEqual([...(idDone ? [] : ['ID check']), ...(credDone ? [] : ['Credentials'])]);
        // not blocked by an unfinished step: the page still lets the teacher edit
        expect(st.editable).toBe(true);
        if (st.canSubmit) sawSubmittable = true;
        if (!st.canSubmit) expect((await submitPOST()).status).toBe(409);
      }
      expect(sawSubmittable).toBe(true);
      const res = await submitPOST();
      expect(res.status).toBe(200);
      expect(row().status).toBe('IN_REVIEW');
    });
  }

  it('the optional details step never blocks Submit', async () => {
    await doStep('id');
    await doStep('cred');
    expect((await state()).steps.details).toBe('not_started');
    expect((await submitPOST()).status).toBe(200);
  });

  it('every step starts as not started, and ID check is in progress once the teacher has agreed', async () => {
    const st = await state();
    expect(st.steps).toEqual({ identity: 'not_started', credentials: 'not_started', details: 'not_started' });
    expect(st.canSubmit).toBe(false);
    await consentPOST(jsonReq({ accepted: true }));
    expect((await state()).steps.identity).toBe('in_progress');
  });

  it('a step the admin flagged shows needs changes, the others stay as they were, and a fix plus resubmit works', async () => {
    await doStep('id');
    await doStep('cred');
    await submitPOST();
    // admin sends it back about the credentials only
    Object.assign(row(), { status: 'IN_PROGRESS', decision_reason: 'Credentials unclear or incomplete' });
    const st = await state();
    expect(st.steps.credentials).toBe('needs_changes');
    expect(st.steps.identity).toBe('done');
    expect(st.stepNotes.credentials).toBe('Credentials unclear or incomplete');
    // fix just that step
    await doStep('cred');
    row().decision_reason = null;
    expect((await state()).steps.credentials).toBe('done');
    expect((await submitPOST()).status).toBe(200);
  });

  it('a credential needs a type, a title and an image', async () => {
    const bad = [
      { kind: 'CSEC', title: 'x', proofPath: upload(RED) },
      { kind: 'OTHER', title: '', proofPath: upload(RED) },
      { kind: 'OTHER', title: 'Award' },
    ];
    for (const body of bad) expect((await addCredential(jsonReq(body))).status).toBe(400);
    expect(h.db.tables.tutor_credentials_v2).toHaveLength(0);
  });

  it('a teacher can add several credentials and remove a draft one', async () => {
    await doStep('cred');
    await doStep('cred');
    expect(h.db.tables.tutor_credentials_v2).toHaveLength(2);
    const { DELETE } = await import('@/app/api/tutor/verification-v2/credentials/route');
    h.db.tables.tutor_credentials_v2.forEach((c: any, i: number) => (c.id ??= `cred-${i}`)); // the database assigns ids
    const id = h.db.tables.tutor_credentials_v2[0].id;
    expect((await DELETE(new NextRequest(`http://localhost/x?id=${id}`, { method: 'DELETE' }))).status).toBe(200);
    expect(h.db.tables.tutor_credentials_v2).toHaveLength(1);
  });
});

// ===========================================================================================
describe('each credential type shows its clue', () => {
  const html = (kind: any) =>
    renderToStaticMarkup(
      createElement(CredentialsStep, {
        state: { credentials: [], steps: { identity: 'not_started', credentials: 'not_started', details: 'not_started' }, stepNotes: { identity: null, credentials: null }, editable: true, canAddCredentials: true } as any,
        onChange: async () => {},
        initialKind: kind,
      })
    );
  const EXPECTED: Record<string, string> = {
    CERTIFICATE: 'e.g. CSEC Chemistry, Grade I (2019)',
    DEGREE: 'e.g. BSc Chemistry, UWI (2023)',
    TEACHING: 'e.g. Diploma in Education',
    OTHER: 'e.g. tutoring award or training certificate',
  };

  it('the four types and their examples are exactly the ones specified', () => {
    expect(CREDENTIAL_TYPES.map((t) => [t.kind, t.label, t.placeholder])).toEqual([
      ['CERTIFICATE', 'CSEC or CAPE certificate', EXPECTED.CERTIFICATE],
      ['DEGREE', 'College or university degree', EXPECTED.DEGREE],
      ['TEACHING', 'Teaching qualification or licence', EXPECTED.TEACHING],
      ['OTHER', 'Other', EXPECTED.OTHER],
    ]);
  });

  for (const kind of Object.keys(EXPECTED)) {
    it(`${kind}: the title field has its example, a small grey clue under it, and the upload line`, () => {
      const out = html(kind);
      expect(out).toContain(`placeholder="${EXPECTED[kind]}"`);
      expect(out).toContain(CREDENTIAL_TITLE_CLUE);
      expect(out).toContain('Upload a clear photo of the certificate. Make sure your name is visible.');
      expect(CREDENTIAL_UPLOAD_CLUE).toBe('Upload a clear photo of the certificate. Make sure your name is visible.');
      // small grey text under the title field
      expect(out).toMatch(/id="cred-title-clue" class="[^"]*text-xs[^"]*text-muted-foreground/);
    });
  }
});

// ===========================================================================================
describe('submit, approve, and what students and parents see', () => {
  async function submitted() {
    await consentPOST(jsonReq({ accepted: true }));
    Object.assign(row(), { identity_status: 'verified', identity_attempts: 1, identity_verified_at: '2026-10-01T10:00:00Z', identity_name_match: true });
    const a = upload(RED);
    const b = upload(BLUE);
    expect((await addCredential(jsonReq({ kind: 'CERTIFICATE', title: 'CSEC Chemistry, Grade I (2019)', proofPath: a, proofFilename: 'chem.png' }))).status).toBe(201);
    expect((await addCredential(jsonReq({ kind: 'DEGREE', title: 'BSc Chemistry, UWI (2023)', proofPath: b, proofFilename: 'degree.png' }))).status).toBe(201);
    expect((await submitPOST()).status).toBe(200);
    return { a, b };
  }

  it('nothing shows before approval; after approval the badge, the exact name and the exact images show', async () => {
    const { a, b } = await submitted();
    expect(await loadPublicSummaries(h.db, [T])).toEqual({});
    expect(await loadVerificationDetailsPage(h.db, T)).toBeNull();

    expect((await approvePOST(jsonReq({}), params)).status).toBe(200);
    expect(row().status).toBe('VERIFIED');
    expect(h.db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');

    // badge: one public answer, the same for a student and a parent
    for (const who of ['student', 'parent']) {
      const res = await summaryGET(get(`http://localhost/api/public/verification-v2/summary?ids=${T}`));
      expect(Object.keys((await res.json()).summaries), who).toEqual([T]);
    }

    const page = await loadVerificationDetailsPage(h.db, T);
    expect(page!.name).toBe('Zoë Ramdhanie');
    const byTitle = Object.fromEntries(page!.credentials.map((c) => [c.title, c]));
    expect(Object.keys(byTitle).sort()).toEqual(['BSc Chemistry, UWI (2023)', 'CSEC Chemistry, Grade I (2019)']);

    const chem = fetchSigned(objects, byTitle['CSEC Chemistry, Grade I (2019)'].proofLink!);
    const deg = fetchSigned(objects, byTitle['BSc Chemistry, UWI (2023)'].proofLink!);
    expect(chem.status).toBe(200);
    expect(deg.status).toBe(200);
    // the exact files the teacher uploaded: same checksum, and the two are different images
    expect(sha(chem.body!)).toBe(sha(RED));
    expect(sha(deg.body!)).toBe(sha(BLUE));
    expect(sha(RED)).not.toBe(sha(BLUE));
    expect(objects.get(`${BUCKET}/${a}`)).toBe(RED);
    expect(objects.get(`${BUCKET}/${b}`)).toBe(BLUE);
  });

  it('the public answers never carry the ID, the selfie, Didit data, reasons or notes', async () => {
    await submitted();
    await approvePOST(jsonReq({ note: 'INTERNAL-NOTE-XYZ' }), params);
    row().decision_reason = 'SECRET-REASON';
    const page = await loadVerificationDetailsPage(h.db, T);
    const detail = await (await publicDetailGET(get(), params)).json();
    const summary = await (await summaryGET(get(`http://localhost/x?ids=${T}`))).json();
    const everything = JSON.stringify([page, detail, summary]).toLowerCase();
    for (const banned of ['selfie', 'didit', 'identity_', 'secret-reason', 'internal-note', 'decision_reason', 'proof_path', 'session', 'attempt', 'namematch', 'name_match']) {
      expect(everything, banned).not.toContain(banned);
    }
    // links are signed storage links, never a bare path
    expect(page!.credentials.every((c) => /[?&]token=/.test(c.proofLink ?? ''))).toBe(true);
  });

  it('an in-progress, in-review and rejected teacher show nothing about verification', async () => {
    await submitted(); // in review
    for (const status of ['IN_PROGRESS', 'IN_REVIEW', 'REJECTED']) {
      row().status = status;
      h.db.tables.profiles[0].tutor_verification_status = status === 'REJECTED' ? 'REJECTED' : 'PENDING';
      expect(await loadPublicSummaries(h.db, [T]), status).toEqual({});
      expect(await loadVerificationDetailsPage(h.db, T), status).toBeNull();
      expect((await publicDetailGET(get(), params)).status, status).toBe(404);
    }
  });

  it('the admin sees who approved and when, the Didit result, attempts, name match, status history and each credential approval', async () => {
    await submitted();
    await approvePOST(jsonReq({}), params);
    // the database stamps these; the in-memory one does not
    row().created_at ??= '2026-09-01T09:00:00Z';
    h.db.tables.tutor_verification_v2_decisions.forEach((x: any) => (x.created_at ??= '2026-10-02T09:00:00Z'));
    const res = await adminDetail(get(), params);
    expect(res.status).toBe(200);
    const d = await res.json();
    expect(d.tutor).toMatchObject({ name: 'Zoë Ramdhanie', email: 'zoe@example.test' });
    expect(d.application).toMatchObject({ status: 'VERIFIED', approvedBy: 'Ada Admin', source: 'v2' });
    expect(d.application.grantedAt).toBeTruthy();
    expect(d.application.identity).toMatchObject({ result: 'pass', attempts: 1, nameMatch: true });
    expect(d.history.map((e: any) => e.label)).toEqual(expect.arrayContaining(['Started verification', 'Submitted for review', 'Approved']));
    expect(d.history.find((e: any) => e.label === 'Approved').by).toBe('Ada Admin');
    expect(d.credentials).toHaveLength(2);
    for (const c of d.credentials) {
      expect(c).toMatchObject({ approvalState: 'approved' });
      expect(c.approvedAt).toBeTruthy();
      expect(c.title).toBeTruthy();
      // a real image through a short-lived signed link, and it is the uploaded file
      const got = fetchSigned(objects, c.proofLink);
      expect(got.status).toBe(200);
      expect([sha(RED), sha(BLUE)]).toContain(sha(got.body!));
    }
  });
});

// ===========================================================================================
describe('revoke and re-approve', () => {
  async function verified() {
    await consentPOST(jsonReq({ accepted: true }));
    Object.assign(row(), { identity_status: 'verified', identity_attempts: 1 });
    await addCredential(jsonReq({ kind: 'OTHER', title: 'Tutoring award', proofPath: upload(RED), proofFilename: 'award.png' }));
    await submitPOST();
    await approvePOST(jsonReq({}), params);
  }
  const badge = async () => Object.keys(await loadPublicSummaries(h.db, [T]));

  it('revoking removes the badge at once for students and parents, is logged, tells the teacher, and keeps all data', async () => {
    await verified();
    expect(await badge()).toEqual([T]);
    const filesBefore = [...objects.keys()];
    const credsBefore = JSON.stringify(h.db.tables.tutor_credentials_v2.map((c: any) => c.title));

    const reason = DECISION_REASONS[2];
    const res = await revokePOST(jsonReq({ reason, note: 'checked twice' }), params);
    expect(res.status).toBe(200);

    expect(await badge()).toEqual([]);
    expect(await loadVerificationDetailsPage(h.db, T)).toBeNull();
    expect((await publicDetailGET(get(), params)).status).toBe(404);
    expect(h.db.tables.profiles[0].tutor_verification_status).toBe('REVOKED');

    const log = h.db.tables.tutor_verification_v2_decisions.find((d: any) => d.action === 'REVOKE');
    expect(log).toMatchObject({ actor_id: ADMIN.id, actor_role: 'admin', tutor_id: T });
    expect(log.reason).toContain(reason);
    expect(log.created_at ?? true).toBeTruthy();

    const notice = h.db.tables.notifications.find((n: any) => /revoked|removed/i.test(`${n.title} ${n.message}`));
    expect(notice).toBeTruthy();
    expect(notice.message).toContain(reason);

    // nothing the teacher submitted was removed
    expect([...objects.keys()]).toEqual(filesBefore);
    expect(JSON.stringify(h.db.tables.tutor_credentials_v2.map((c: any) => c.title))).toBe(credsBefore);
    expect(row().consent_at).toBeTruthy();
  });

  it('a revoke needs a reason from the list', async () => {
    await verified();
    expect((await revokePOST(jsonReq({}), params)).status).toBe(400);
    expect((await revokePOST(jsonReq({ reason: 'because' }), params)).status).toBe(400);
    expect(await badge()).toEqual([T]);
  });

  it('re-approving restores the badge and the details page, and is logged', async () => {
    await verified();
    await revokePOST(jsonReq({ reason: DECISION_REASONS[4] }), params);
    expect(await badge()).toEqual([]);

    const res = await reapprovePOST(jsonReq({}), params);
    expect(res.status).toBe(200);
    expect(await badge()).toEqual([T]);
    expect((await loadVerificationDetailsPage(h.db, T))!.credentials).toHaveLength(1);
    expect(h.db.tables.profiles[0].tutor_verification_status).toBe('VERIFIED');
    expect(h.db.tables.tutor_verification_v2_decisions.map((d: any) => d.action)).toEqual(expect.arrayContaining(['APPROVE', 'REVOKE', 'REAPPROVE']));
  });

  it('only a revoked teacher can be re-approved', async () => {
    await verified();
    expect((await reapprovePOST(jsonReq({}), params)).status).toBe(409);
  });
});

// ===========================================================================================
describe('only admins can approve, revoke, re-approve or read admin data', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['detail', () => adminDetail(get(), params)],
    ['approve', () => approvePOST(jsonReq({}), params)],
    ['revoke', () => revokePOST(jsonReq({ reason: DECISION_REASONS[4] }), params)],
    ['reapprove', () => reapprovePOST(jsonReq({}), params)],
  ];

  beforeEach(() => {
    Object.assign(row(), { status: 'IN_REVIEW', consent_at: 'x', identity_status: 'verified' });
    h.db.tables.tutor_credentials_v2.push({ id: 'c1', tutor_id: T, kind: 'OTHER', title: 'Award', proof_path: `${T}/x.png`, proof_filename: 'x.png', pending_approval: false, created_at: '1' });
  });

  for (const [name, call] of calls) {
    it(`${name}: signed out is 401, a student or teacher is 403, and nothing changes`, async () => {
      for (const err of [NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), NextResponse.json({ error: 'Forbidden' }, { status: 403 })]) {
        h.auth = { error: err, user: null, profile: null };
        const before = JSON.stringify([row(), h.db.tables.profiles[0], h.db.tables.tutor_verification_v2_decisions]);
        const res = await call();
        expect([401, 403]).toContain(res.status);
        expect(JSON.stringify([row(), h.db.tables.profiles[0], h.db.tables.tutor_verification_v2_decisions])).toBe(before);
      }
    });
  }

  it('a reviewer can read the detail but cannot revoke or re-approve (admin only)', async () => {
    asAdmin(REVIEWER);
    expect((await adminDetail(get(), params)).status).toBe(200);
    expect((await revokePOST(jsonReq({ reason: DECISION_REASONS[4] }), params)).status).toBe(403);
    expect((await reapprovePOST(jsonReq({}), params)).status).toBe(403);
  });
});

// ===========================================================================================
describe('image links', () => {
  it('a request for an image without a valid signature fails', async () => {
    seed({ v2: { status: 'VERIFIED', consent_at: 'x', identity_status: 'verified', decided_at: '2026-10-01T00:00:00Z' }, profile: { tutor_verification_status: 'VERIFIED' } });
    const p = upload(RED);
    h.db.tables.tutor_credentials_v2.push({ id: 'c1', tutor_id: T, kind: 'OTHER', title: 'Award', proof_path: p, proof_filename: 'a.png', pending_approval: false, created_at: '1' });
    const page = await loadVerificationDetailsPage(h.db, T);
    const link = page!.credentials[0].proofLink!;
    expect(fetchSigned(objects, link).status).toBe(200);

    const u = new URL(link);
    // no token, a wrong token, a token for a different file, and an expired link
    expect(fetchSigned(objects, `${u.origin}${u.pathname}`).status).toBe(400);
    expect(fetchSigned(objects, `${u.origin}${u.pathname}?token=deadbeef&exp=${u.searchParams.get('exp')}`).status).toBe(403);
    const other = upload(BLUE);
    const otherLink = (await h.db.storage.from(BUCKET).createSignedUrl(other, 600)).data.signedUrl as string;
    const swapped = new URL(link);
    swapped.searchParams.set('token', new URL(otherLink).searchParams.get('token')!);
    expect(fetchSigned(objects, swapped.toString()).status).toBe(403);
    now += 601;
    expect(fetchSigned(objects, link).status).toBe(403);
    now -= 601;
  });

  it('the proof bucket is private and has no public or anonymous read in the migration', () => {
    const sql = readFileSync('supabase/migrations/270_teacher_verification_v2.sql', 'utf8');
    const insert = sql.slice(sql.indexOf('INSERT INTO storage.buckets'));
    expect(insert.slice(0, 400)).toMatch(/'tutor-credential-proofs'[\s\S]*false/);
    expect(sql).not.toMatch(/TO anon/i);
    expect(sql).not.toMatch(/TO public/i);
  });
});

// ===========================================================================================
describe('teachers verified under the old system', () => {
  it('keep the badge, show the details page with their name, and see a Verified status', async () => {
    seed({
      v2: { status: 'VERIFIED', source: 'legacy', consent_at: null, identity_status: null, decided_at: '2025-03-04T10:00:00Z' },
      profile: { tutor_verification_status: 'VERIFIED', tutor_verified_at: '2025-03-04T10:00:00Z' },
    });
    const summary = await loadPublicSummaries(h.db, [T]);
    expect(Object.keys(summary)).toEqual([T]);
    expect(summary[T].idChecked).toBe(false);
    const page = await loadVerificationDetailsPage(h.db, T);
    expect(page).toMatchObject({ name: 'Zoë Ramdhanie', verifiedAt: '2025-03-04T10:00:00Z' });
    const st = await state();
    expect(st.status).toBe('VERIFIED');
    expect(st.steps.identity).toBe('done');
    expect(st.steps.credentials).toBe('done');
    // the admin sees where it came from
    asAdmin(ADMIN);
    const d = await (await adminDetail(get(), params)).json();
    expect(d.application).toMatchObject({ source: 'legacy', status: 'VERIFIED' });
    expect(d.application.grantedAt).toBe('2025-03-04T10:00:00Z');
  });

  it('migration 276 copies them as VERIFIED with their original date and source legacy, without dropping anything', () => {
    const sql = readFileSync('supabase/migrations/276_verification_any_order_and_legacy.sql', 'utf8');
    expect(sql).toMatch(/source text NOT NULL DEFAULT 'v2'/);
    expect(sql).toMatch(/CHECK \(source IN \('v2', 'legacy'\)\)/);
    expect(sql).toMatch(/'VERIFIED', 'legacy', COALESCE\(p\.tutor_verified_at, now\(\)\)/);
    expect(sql).toMatch(/WHERE p\.tutor_verification_status = 'VERIFIED'/);
    expect(sql).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM/i);
  });
});

// ===========================================================================================
describe('one system: old URLs redirect and no legacy code is left', () => {
  const root = path.resolve(__dirname, '..', '..');

  it('the old teacher verification URLs redirect to the new page', async () => {
    const config = require(path.join(root, 'next.config.js'));
    const redirects = await config.redirects();
    for (const source of ['/tutor/verification', '/tutor/verification/upload']) {
      expect(redirects.find((r: any) => r.source === source), source).toMatchObject({ destination: '/tutor/verification-v2' });
    }
  });

  it('the old teacher pages, the old upload and OCR routes and the Stripe and Veriff providers are gone', () => {
    for (const gone of [
      'app/tutor/verification/page.tsx',
      'app/tutor/verification/upload',
      'app/api/verification/request',
      'app/api/tutor/verification',
      'app/api/webhooks/stripe-identity',
      'lib/identity/providers/stripe.ts',
      'lib/identity/providers/veriff.ts',
      'lib/utils/verificationUpload.ts',
    ]) {
      expect(existsSync(path.join(root, gone)), gone).toBe(false);
    }
  });

  it('no source file reads a Stripe Identity or Veriff variable or carries a fallback workflow id', () => {
    const banned = [/STRIPE_IDENTITY/i, /stripe-identity/i, /veriff/i, /9bfa64cd/i, /DIDIT_.*SANDBOX/i, /identity\.verification_session/i];
    const bad: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (['node_modules', '.next', '.git'].includes(name)) continue;
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
          const text = readFileSync(full, 'utf8');
          for (const b of banned) if (b.test(text)) bad.push(`${path.relative(root, full)} ~ ${b}`);
        }
      }
    };
    for (const d of ['app', 'components', 'lib', 'config']) walk(path.join(root, d));
    expect(bad).toEqual([]);
  });

  it('Didit reads only its three variables', () => {
    const files = ['lib/identity/diditConfig.ts', 'lib/identity/providers/didit.ts', 'lib/identity/configStatus.ts'];
    const found = new Set<string>();
    for (const f of files) for (const m of readFileSync(path.join(root, f), 'utf8').matchAll(/DIDIT_[A-Z_]+/g)) if (m[0] !== 'DIDIT_VARIABLES') found.add(m[0]);
    expect([...found].sort()).toEqual(['DIDIT_API_KEY', 'DIDIT_WEBHOOK_SECRET', 'DIDIT_WORKFLOW_ID']);
  });
});
