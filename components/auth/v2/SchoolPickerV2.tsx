'use client';

/**
 * Optional school field with search, for the new-UI sign-up screens (email
 * sign-up's last step and the Google role step). Searches the institutions
 * list (/api/institutions/search, secondary schools); the picked row is kept
 * whole because the profile stores both its name and its id.
 */

import { useState } from 'react';
import { Institution, useInstitutionsSearch } from '@/lib/hooks/useInstitutionsSearch';
import { AuthField, AuthInput } from './AuthKit';

export default function SchoolPickerV2({
  value,
  onChange,
}: {
  value: Institution | null;
  onChange: (next: Institution | null) => void;
}) {
  const [q, setQ] = useState('');
  const { results, loading } = useInstitutionsSearch(q, { institution_level: 'secondary' });

  if (value) {
    return (
      <AuthField label="School (optional)">
        <div className="flex min-h-[50px] items-center gap-3 rounded-[8px] bw-hair border-border-strong bg-surface-card pl-[14px] pr-1">
          <span className="min-w-0 flex-1 text-[16px] text-ink">{value.name}</span>
          <button type="button" onClick={() => onChange(null)} className="min-h-[44px] px-3 text-[14px] font-extrabold text-ink underline">
            Change
          </button>
        </div>
      </AuthField>
    );
  }
  return (
    <AuthField
      label="School (optional)"
      htmlFor="su-school"
      hint={q && !loading && results.length === 0 ? 'No school matches that yet. You can skip this.' : undefined}
    >
      <AuthInput id="su-school" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Start typing your school" autoComplete="off" />
      {q.trim() && results.length > 0 ? (
        <ul className="m-0 list-none overflow-hidden rounded-[8px] bw-hair border-border-strong bg-surface-card p-0">
          {results.slice(0, 6).map((r) => (
            <li key={r.id} className="bw-t-hair border-line-soft first:border-t-0">
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setQ('');
                }}
                className="flex min-h-[44px] w-full items-center px-[14px] text-left text-[15px] text-ink hover:bg-surface-sunken"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </AuthField>
  );
}
