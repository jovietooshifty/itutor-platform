// Hand validation, matching the rest of the verification routes.

import type { CredentialKind } from './constants';
import { MAX_PROOF_BYTES, PROOF_TYPES } from './constants';

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t || t.length > max) return null;
  return t;
}

function optionalStr(v: unknown, max: number): Result<string | null> {
  if (v === undefined || v === null || v === '') return { ok: true, value: null };
  const s = str(v, max);
  return s ? { ok: true, value: s } : { ok: false, error: 'too long or invalid' };
}

function year(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** http(s) only. Anything else (javascript:, data:, file:) is refused. */
export function cleanLink(v: unknown): Result<string | null> {
  if (v === undefined || v === null || v === '') return { ok: true, value: null };
  if (typeof v !== 'string') return { ok: false, error: 'Link must be text' };
  const t = v.trim();
  if (t.length > 500) return { ok: false, error: 'Link is too long (500 characters max)' };
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'Link must start with http:// or https://' };
    }
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: 'Link is not a valid web address' };
  }
}

/** Strips path parts and anything outside a conservative set. For display only. */
export function sanitizeFilename(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 100);
  return cleaned || null;
}

/** A legal first or last name: letters, spaces, hyphens, apostrophes and full stops, 1 to 60 characters. */
export function validateLegalName(body: any): Result<{ first: string; last: string }> {
  const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
  const first = clean(body?.firstName);
  const last = clean(body?.lastName);
  const ok = (n: string) => n.length >= 1 && n.length <= 60 && /^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(n);
  if (!ok(first)) return { ok: false, error: 'Enter your first name exactly as it is on your ID' };
  if (!ok(last)) return { ok: false, error: 'Enter your last name exactly as it is on your ID' };
  return { ok: true, value: { first, last } };
}

export interface CredentialInput {
  kind: CredentialKind;
  /** What the teacher calls it. Required for every new credential. */
  title: string;
  subject: string | null;
  grade: string | null;
  exam_year: number | null;
  school: string | null;
  degree: string | null;
  field: string | null;
  graduation_year: number | null;
  proof_url: string | null;
  proofPath: string;
  proof_filename: string | null;
}

const NEW_KINDS = ['CERTIFICATE', 'DEGREE', 'TEACHING', 'OTHER'];

/**
 * A new credential is a type, a title and an image. The old structured fields (subject, grade,
 * school and so on) are no longer collected; they stay null.
 */
export function validateCredential(body: any): Result<CredentialInput> {
  const kind = body?.kind;
  if (!NEW_KINDS.includes(kind)) return { ok: false, error: 'Choose what kind of qualification this is' };
  const title = str(body?.title, 150);
  if (!title) return { ok: false, error: 'Enter a title for the qualification (150 characters max)' };
  const proofPath = typeof body?.proofPath === 'string' && body.proofPath ? body.proofPath : null;
  if (!proofPath) return { ok: false, error: 'Upload a clear photo of the certificate' };
  return {
    ok: true,
    value: {
      kind: kind as CredentialKind,
      title,
      subject: null,
      grade: null,
      exam_year: null,
      school: null,
      degree: null,
      field: null,
      graduation_year: null,
      proof_url: null,
      proofPath,
      proof_filename: sanitizeFilename(body?.proofFilename),
    },
  };
}

export interface ExtraInput {
  title: string;
  description: string;
  link_url: string | null;
}

export function validateExtra(body: any): Result<ExtraInput> {
  const title = str(body?.title, 80);
  const description = str(body?.description, 280);
  const link = cleanLink(body?.linkUrl);
  if (!title) return { ok: false, error: 'Enter a title (80 characters max)' };
  if (!description) return { ok: false, error: 'Enter a short description (280 characters max)' };
  if (!link.ok) return link;
  return { ok: true, value: { title, description, link_url: link.value } };
}

export function validateUploadRequest(
  body: any
): Result<{ ext: string; contentType: string }> {
  const contentType = typeof body?.contentType === 'string' ? body.contentType : '';
  const size = typeof body?.size === 'number' ? body.size : NaN;
  const ext = PROOF_TYPES[contentType];
  if (!ext) return { ok: false, error: 'Proof files must be PDF, JPG or PNG' };
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'File size is missing' };
  if (size > MAX_PROOF_BYTES) return { ok: false, error: 'Proof files can be at most 10MB' };
  return { ok: true, value: { ext, contentType } };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** A proof path must be exactly {tutorId}/{uuid}.{pdf|jpg|png}. */
export function isOwnProofPath(path: string, tutorId: string): boolean {
  return new RegExp(`^${tutorId}/${UUID}\\.(pdf|jpg|png)$`, 'i').test(path);
}
