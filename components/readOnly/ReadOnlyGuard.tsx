'use client';

// Browser half of the read-only live preview guard (lib/readOnly/guard.ts).
// Installed at module evaluation, i.e. before any component can write, and it
// tells the tester plainly that nothing they do is saved.

import { installReadOnlyGuard, READ_ONLY_LIVE } from '@/lib/readOnly/guard';

if (typeof window !== 'undefined') installReadOnlyGuard('browser');

export default function ReadOnlyGuard() {
  if (!READ_ONLY_LIVE) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-1 z-[9999] -translate-x-1/2 rounded-full bg-black/80 px-3 py-1 text-[11px] font-bold text-white"
    >
      Read-only preview on live data · nothing is saved
    </div>
  );
}
