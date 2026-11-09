'use client';

// Step 1: the teacher's legal name. It must match their government ID exactly. Once the ID check has
// started the name comes from the ID and cannot be changed, and after approval it is locked for good.

import { forwardRef, useImperativeHandle, useState } from 'react';
import type { VerificationV2StateDto } from '@/lib/verificationV2/constants';
import { CHECKLIST_META, Card, ErrorBanner, inputClass, readError, type StepHandle } from './ui';

interface Props {
  state: VerificationV2StateDto;
  onChange: () => Promise<void>;
  /** The one-time prompt for a teacher who was verified before names were checked. */
  prompt?: boolean;
}

const NameStep = forwardRef<StepHandle, Props>(function NameStep({ state, onChange, prompt = false }, ref) {
  const { name } = state;
  const [first, setFirst] = useState(name.firstName ?? '');
  const [last, setLast] = useState(name.lastName ?? '');
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    async save() {
      if (!name.canEdit) return true;
      setError(null);
      if (!first.trim() || !last.trim()) {
        setError('Enter your first and last name exactly as they are on your ID');
        return false;
      }
      try {
        const res = await fetch('/api/tutor/verification-v2/name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName: first, lastName: last }),
        });
        if (!res.ok) {
          setError(await readError(res, 'Could not save your name'));
          return false;
        }
        await onChange();
        return true;
      } catch {
        setError('Could not save your name');
        return false;
      }
    },
  }));

  const hasName = !!(name.firstName && name.lastName);

  return (
    <Card
      title={prompt ? 'Confirm your name' : CHECKLIST_META.name.title}
      subtitle={prompt ? 'Please confirm the name on your ID. It will be locked after you save.' : CHECKLIST_META.name.subtitle}
      state={prompt ? undefined : state.steps.name}
    >
      {name.canEdit ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-ink">Name on your ID</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="legal-first" className="mb-1 block text-sm font-medium text-ink">
                First name
              </label>
              <input id="legal-first" className={inputClass} value={first} onChange={(e) => setFirst(e.target.value)} maxLength={60} autoComplete="given-name" />
            </div>
            <div>
              <label htmlFor="legal-last" className="mb-1 block text-sm font-medium text-ink">
                Last name
              </label>
              <input id="legal-last" className={inputClass} value={last} onChange={(e) => setLast(e.target.value)} maxLength={60} autoComplete="family-name" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            This must match your government ID exactly. It is the only name students and parents see. After your ID check it is filled in from your ID.
          </p>
          <ErrorBanner message={error} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-lg font-semibold text-ink">{hasName ? `${name.firstName} ${name.lastName}` : '—'}</p>
          <p className="text-xs text-muted-foreground">
            {name.source === 'id'
              ? 'Your name comes from your ID check, so it cannot be changed.'
              : 'Your name is locked. Contact support if it needs to be corrected.'}
          </p>
        </div>
      )}
    </Card>
  );
});

export default NameStep;
