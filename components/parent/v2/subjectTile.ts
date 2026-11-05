/**
 * Deriving a SubjectTile's two letters and colour from a class name.
 *
 * The Figma frames show every class with a coloured two-letter tile (MA, PH,
 * ES, PB, GE). Nothing in the database stores that pair, so it is derived —
 * and the SubjectTile README is explicit that a subject keeps the same colour
 * everywhere it appears, in the parent and student apps alike. That rules out
 * "colour by position in the list", because the same class would change colour
 * as the list reordered. Both the code and the colour are therefore a pure
 * function of the subject text.
 */

import type { SubjectColor } from '@/components/ui';

const COLORS: SubjectColor[] = ['green', 'yellow', 'orange', 'sage'];

/** Qualification prefixes and form suffixes that are not the subject. */
const NOISE =
  /\b(csec|cape|sea|cxc|form|grade|level|class|lessons?|tutoring|online|beginners?)\b/gi;

function subjectWords(raw: string): string[] {
  return raw
    .replace(NOISE, ' ')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Two uppercase letters for the tile. "CSEC Mathematics FORM 5" -> "MA",
 * "Principles of Business" -> "PB" (two words give one letter each).
 */
export function subjectCode(raw: string | null | undefined): string {
  const words = subjectWords(raw ?? '');
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Stable colour for a subject — same subject, same colour, everywhere. */
export function subjectColor(raw: string | null | undefined): SubjectColor {
  const key = subjectWords(raw ?? '').join('').toLowerCase() || 'x';
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}
