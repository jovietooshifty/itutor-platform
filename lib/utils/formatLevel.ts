export const LEVEL_LABELS: Record<string, string> = {
  SEA:    'SEA (10–11)',
  FORM_1: 'Form 1 (11–12)',
  FORM_2: 'Form 2 (12–13)',
  FORM_3: 'Form 3 (13–14)',
  FORM_4: 'Form 4 (14–15)',
  FORM_5: 'Form 5 (15–16)',
  CAPE:   'CAPE (16–18)',
};

export function formatLevel(value: string | null | undefined): string {
  if (!value) return '—';
  return LEVEL_LABELS[value] ?? value;
}

const SHORT_LABELS: Record<string, string> = {
  SEA: 'SEA',
  FORM_1: 'Form 1',
  FORM_2: 'Form 2',
  FORM_3: 'Form 3',
  FORM_4: 'Form 4',
  FORM_5: 'Form 5',
  CAPE: 'CAPE',
};

/**
 * A level as a person reads it, with no age range: "FORM_4" → "Form 4".
 *
 * `groups.form_level` is free text holding two vocabularies (enum-style
 * `FORM_4` and display labels like `CSEC (14–16)`), so a raw enum leaked onto
 * the class page, the checkout and the child picker's level warning. Display
 * labels pass through unchanged; any other SHOUTY_SNAKE value is title-cased
 * rather than shown raw. Null when there is nothing to show.
 */
export function formatLevelShort(value: string | null | undefined): string | null {
  const t = (value ?? '').trim();
  if (!t) return null;
  const known = SHORT_LABELS[t.toUpperCase()];
  if (known) return known;
  if (/^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(t)) {
    return t
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }
  return t;
}
