'use client';

/**
 * "Your subjects" from Home's Subjects · Edit, new UI. Replaces the old dark
 * EditSubjectsModal there (which clipped on phones: an absolute dropdown in a
 * 90vh, vertically centred panel). Saves profiles.subjects_of_study, exactly
 * as the old modal did. PROVISIONAL: no frame draws this sheet.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Sheet } from '@/components/parent/v2/Sheet';
import { supabase } from '@/lib/supabase/client';
import SubjectPickerV2 from './SubjectPickerV2';

export default function EditSubjectsSheetV2({
  open,
  onClose,
  currentSubjects,
  userId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  currentSubjects: string[];
  userId: string;
  onSaved: () => void;
}) {
  const [subjects, setSubjects] = useState<string[]>(currentSubjects);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from what is saved each time it opens.
  useEffect(() => {
    if (open) {
      setSubjects(currentSubjects);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({ subjects_of_study: subjects.length > 0 ? subjects : null })
      .eq('id', userId);
    setSaving(false);
    if (err) {
      setError('Your subjects could not be saved. Try again.');
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={() => (saving ? undefined : onClose())}
      title="Your subjects"
      footer={
        <>
          <Button variant="outline" size="lg" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <p className="m-0 text-[15px] leading-[21px] text-ink-muted">
        We use these to suggest classes and tutors for you.
      </p>
      <SubjectPickerV2 selected={subjects} onChange={setSubjects} />
      {error ? (
        <p role="alert" className="m-0 text-[14px] font-bold text-danger">
          {error}
        </p>
      ) : null}
    </Sheet>
  );
}
