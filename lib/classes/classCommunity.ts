/**
 * "WhatsApp group · Google Classroom" — the line a marketplace class page shows
 * when the tutor has connected either (Product Sprint, 21 Nov 2026: "it is a
 * selling point"). Built from the public has_* flags, never from the links,
 * which only members and the tutor receive. Null when there is neither.
 */
export function classCommunityLine(g: { has_whatsapp_group?: boolean | null; has_google_classroom?: boolean | null }): string | null {
  const parts = [g.has_whatsapp_group ? 'Class WhatsApp group' : null, g.has_google_classroom ? 'Google Classroom' : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
