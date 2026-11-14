/**
 * The two letters in the header's account chip.
 *
 * Extracted because three routes now need it (dashboard, billing, my-classes)
 * and the third copy is where copies start drifting. `undefined` rather than
 * `''` when there is no name: the chip renders a fallback glyph for undefined,
 * and an empty string would draw an empty box — which is exactly what the first
 * Classes screenshot showed before this existed.
 */
export function parentInitials(
  profile: { display_name?: string | null; full_name?: string | null } | null | undefined
): string | undefined {
  const name = profile?.display_name || profile?.full_name || '';
  return (
    name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || undefined
  );
}
