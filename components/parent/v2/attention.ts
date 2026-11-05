/**
 * Where an /api/parent/attention card actually goes.
 *
 * Every item in that feed carries the same `href`, `/parent/approvals`,
 * because it predates the new UI and the old queue showed all of them on one
 * page. With the new UI on, that route REDIRECTS to the merged Classes tab —
 * and the Classes tab only lists requests, it cannot approve or pay. So
 * "Review & pay" took the parent to a list of classes with nothing to say
 * which row they had just asked about, and no way to do the thing the button
 * named.
 *
 * An action card has to land where the action exists. `v2=0` opts out of the
 * redirect and opens the real approvals queue — the same destination the
 * Classes tab's own request rows use for exactly this reason — and `request`
 * names the item so the queue can be pointed at it.
 *
 * This is the honest interim. Figma specifies approve, decline and checkout
 * screens; none of them are built, and routing a button at a screen that does
 * not exist is how it ended up pointing at a list in the first place.
 */
export function withRequest(item: { href: string; id?: string }): string {
  const url = new URL(item.href, 'https://local.invalid');
  if (url.pathname === '/parent/approvals') url.searchParams.set('v2', '0');
  if (item.id) url.searchParams.set('request', item.id);
  return url.pathname + (url.search || '');
}
