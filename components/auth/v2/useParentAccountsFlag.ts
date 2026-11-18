'use client';

import { useEffect, useState } from 'react';

/**
 * Whether parent accounts are switched on (PARENT_ACCOUNTS_ENABLED, read on
 * the server and exposed by /api/feature-flags).
 *
 * Starts false so a parent option never flashes in and then disappears;
 * offering a parent sign-up while the flag is off would ship a funnel the
 * product has switched off (see app/start/page.tsx).
 */
export function useParentAccountsFlag(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    fetch('/api/feature-flags', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => live && setOn(Boolean(d?.parentAccountsEnabled)))
      .catch(() => live && setOn(false));
    return () => {
      live = false;
    };
  }, []);
  return on;
}
