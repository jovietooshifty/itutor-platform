'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  CREDENTIAL_TITLE_CLUE,
  CREDENTIAL_TYPES,
  CREDENTIAL_UPLOAD_CLUE,
  MAX_PROOF_BYTES,
  PROOF_BUCKET,
  PROOF_TYPES,
  type CredentialDto,
  type CredentialKind,
  type VerificationV2StateDto,
} from '@/lib/verificationV2/constants';
import { CHECKLIST_META, Card, ErrorBanner, Notice, PrimaryButton, inputClass, readError, type StepHandle } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onChange: () => Promise<void>;
  /** The teacher is already verified: new credentials are pending approval and the badge stays. */
  afterVerified?: boolean;
  /** The checklist card: open or folded, and how to toggle it. Defaults to open (the gallery). */
  open?: boolean;
  onToggle?: () => void;
  /** Which type is picked at first. Only the tests and the gallery set it. */
  initialKind?: CredentialKind;
}

const INPUT = inputClass;

const KIND_LABEL: Record<string, string> = {
  CERTIFICATE: 'CSEC or CAPE certificate',
  CSEC: 'CSEC certificate',
  CAPE: 'CAPE certificate',
  DEGREE: 'College or university degree',
  TEACHING: 'Teaching qualification or licence',
  OTHER: 'Other',
};

/** What to call a credential: the teacher's title, or a description built from an old row's fields. */
export function credentialTitle(c: Pick<CredentialDto, 'title' | 'kind' | 'subject' | 'grade' | 'examYear' | 'school' | 'degree' | 'field' | 'graduationYear'>): string {
  if (c.title) return c.title;
  if (c.kind === 'DEGREE') return `${c.degree ?? ''}${c.field ? `, ${c.field}` : ''} · ${c.school ?? ''} · ${c.graduationYear ?? ''}`;
  return `${c.kind} ${c.subject ?? ''} · Grade ${c.grade ?? ''} · ${c.examYear ?? ''}`;
}

const CredentialsStep = forwardRef<StepHandle, Props>(function CredentialsStep(
  { state, onChange, afterVerified = false, open = true, onToggle, initialKind = 'CERTIFICATE' },
  ref
) {
  const [kind, setKind] = useState<CredentialKind>(initialKind);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const type = CREDENTIAL_TYPES.find((t) => t.kind === kind) ?? CREDENTIAL_TYPES[0];
  const canAdd = state.canAddCredentials || state.editable;

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!PROOF_TYPES[f.type]) {
      setError('Please upload a JPG or PNG photo, or a PDF');
      return setFile(null);
    }
    if (f.size > MAX_PROOF_BYTES) {
      setError('The file can be at most 10MB');
      return setFile(null);
    }
    setFile(f);
  }

  /** Adds the credential being typed. Resolves true when it was saved. */
  async function add(): Promise<boolean> {
    if (!title.trim()) return setError('Enter a title for the qualification'), false;
    if (!file) return setError('Upload a clear photo of the certificate'), false;
    setBusy(true);
    setError(null);
    try {
      const prep = await fetch('/api/tutor/verification-v2/credentials/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: file.type, size: file.size }),
      });
      if (!prep.ok) throw new Error(await readError(prep, 'Could not prepare the upload'));
      const { path, token } = await prep.json();
      const up = await supabase.storage.from(PROOF_BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (up.error) throw new Error('The file could not be uploaded. Please try again.');

      const res = await fetch('/api/tutor/verification-v2/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, title, proofPath: path, proofFilename: file.name }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the credential'));
      setTitle('');
      setFile(null);
      setFileKey((k) => k + 1);
      await onChange();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // The Save button under the step: add what is filled in, or do nothing when the form is empty.
  useImperativeHandle(ref, () => ({
    async save() {
      if (!title.trim() && !file) return true;
      return add();
    },
  }));

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/tutor/verification-v2/credentials?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) setError(await readError(res, 'Could not remove the credential'));
    await onChange();
  }

  return (
    <Card
      title={afterVerified ? 'Add a credential' : CHECKLIST_META.credentials.title}
      subtitle={
        afterVerified
          ? 'New credentials are checked before they show to students and parents. Your Verified badge stays.'
          : state.stepNotes.credentials ?? CHECKLIST_META.credentials.subtitle
      }
      state={afterVerified ? undefined : state.steps.credentials}
      collapsed={!open}
      onOpen={onToggle}
    >
      {state.stepNotes.credentials && !afterVerified && (
        <Notice className="mb-4">
          <p className="font-semibold">{state.stepNotes.credentials}</p>
          <p className="mt-1">Fix this step and send your application again. Nothing else has to change.</p>
        </Notice>
      )}

      {state.credentials.length > 0 && (
        <ul className="mb-5 divide-y divide-border rounded-xl border border-border">
          {state.credentials.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{credentialTitle(c)}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABEL[c.kind] ?? c.kind}
                  {c.pending ? ' · Pending approval' : ''}
                </p>
              </div>
              {canAdd && (!afterVerified || c.pending) && (
                <button
                  onClick={() => remove(c.id)}
                  className="min-h-[44px] px-2 text-xs font-semibold text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd && (
        <div className="space-y-4 rounded-xl border border-border bg-muted p-4">
          <div>
            <label htmlFor="cred-kind" className="mb-1 block text-sm font-medium text-ink">
              What kind of qualification is it?
            </label>
            <select id="cred-kind" value={kind} onChange={(e) => setKind(e.target.value as CredentialKind)} className={INPUT}>
              {CREDENTIAL_TYPES.map((t) => (
                <option key={t.kind} value={t.kind}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="cred-title" className="mb-1 block text-sm font-medium text-ink">
              Title
            </label>
            <input
              id="cred-title"
              className={INPUT}
              placeholder={type.placeholder}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              aria-describedby="cred-title-clue"
            />
            <p id="cred-title-clue" className="mt-1 text-xs text-muted-foreground">
              {CREDENTIAL_TITLE_CLUE}
            </p>
          </div>

          <div>
            <label htmlFor="cred-file" className="mb-1 block text-sm font-medium text-ink">
              Photo of the certificate
            </label>
            <input
              key={fileKey}
              id="cred-file"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:min-h-[44px] file:rounded-lg file:border file:border-border file:bg-background file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink"
              aria-describedby="cred-file-clue"
            />
            <p id="cred-file-clue" className="mt-1 text-xs text-muted-foreground">
              {CREDENTIAL_UPLOAD_CLUE}
            </p>
          </div>

          <ErrorBanner message={error} />
          <PrimaryButton onClick={add} busy={busy}>
            Add credential
          </PrimaryButton>
        </div>
      )}

      {!canAdd && <ErrorBanner message={error} />}
    </Card>
  );
});

export default CredentialsStep;
