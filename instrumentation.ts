// Read-only live preview (branch preview/new-ui-live-readonly): installs the
// fetch guard before any request is served, in both the Node and Edge
// runtimes. See lib/readOnly/guard.ts.
export async function register() {
  const { installReadOnlyGuard } = await import('./lib/readOnly/guard');
  installReadOnlyGuard('server');
}
