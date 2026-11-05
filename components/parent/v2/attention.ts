/**
 * Where an /api/parent/attention card actually goes.
 *
 * Every item in that feed carries the same `href`, `/parent/approvals`,
 * because it predates the new UI. With the new UI on, requests are answered in
 * a bottom sheet on the Classes tab (ParentRequestSheet), so an approvals card
 * goes to `/parent/my-classes?request=<id>` and the sheet opens on that item.
 *
 * It points there directly rather than relying on /parent/approvals'
 * redirect, so the parent does not see a blank hop first.
 */
export function withRequest(item: { href: string; id?: string }): string {
  const url = new URL(item.href, 'https://local.invalid');
  if (url.pathname === '/parent/approvals') url.pathname = '/parent/my-classes';
  if (item.id) url.searchParams.set('request', item.id);
  return url.pathname + (url.search || '');
}
