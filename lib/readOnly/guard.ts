/**
 * READ-ONLY LIVE PREVIEW GUARD — branch preview/new-ui-live-readonly ONLY.
 *
 * This branch runs the new UI against the PRODUCTION database so it can be
 * tested on real data. Nothing it does may change a user's data, so every
 * outgoing request is filtered here, at the one chokepoint every Supabase
 * client shares (globalThis.fetch), on the server and in the browser:
 *
 *   Supabase  GET / HEAD ............................. allowed (reads)
 *             POST /auth/v1/token, /auth/v1/logout .... allowed (signing in)
 *             POST /storage/v1/object/sign|list ....... allowed (read-only)
 *             POST /rest/v1/rpc/<fn> .................. re-sent as GET, which
 *                 PostgREST runs in a READ ONLY transaction: a function that
 *                 writes fails inside the database instead of writing.
 *             everything else (insert/update/upsert/delete, uploads, edge
 *             functions, password resets, sign-ups) ...... refused with 403
 *   Other hosts, any non-GET ......................... refused (server);
 *                 same-origin allowed in the browser, because our own API
 *                 routes run on the server, behind this same guard.
 *
 * Libraries that do not use fetch (Stripe SDK, web-push, firebase-admin) are
 * covered by the deployment having NO credentials for them (see the branch's
 * commit message for the environment it must be deployed with).
 *
 * DEFAULT IS ON for this branch. NEVER merge this branch into main or
 * staging: the guard would make production read-only.
 */

export const READ_ONLY_LIVE = process.env.NEXT_PUBLIC_READ_ONLY_LIVE !== 'false';

const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '').origin;
  } catch {
    return '';
  }
})();

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const AUTH_ALLOWED = new Set(['/auth/v1/token', '/auth/v1/logout']);
const STORAGE_READ_POSTS = ['/storage/v1/object/sign/', '/storage/v1/object/list/'];

type Fetch = typeof fetch;

function blocked(reason: string): Response {
  if (typeof console !== 'undefined') console.warn(`[read-only preview] blocked: ${reason}`);
  return new Response(
    JSON.stringify({
      message: 'Read-only preview: changes are not saved.',
      error: 'Read-only preview: changes are not saved.',
      code: 'READ_ONLY',
      details: reason,
      hint: null,
    }),
    { status: 403, headers: { 'content-type': 'application/json' } }
  );
}

function pgArg(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    return `{${v.map((x) => `"${String(x).replace(/["\\]/g, '\\$&')}"`).join(',')}}`;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Called with globalThis as `this`: a detached native fetch can throw
// "Illegal invocation" in some browsers.
const call = (f: Fetch, input: RequestInfo | URL, init?: RequestInit) =>
  Reflect.apply(f, globalThis, [input, init]) as Promise<Response>;

function wrap(inner: Fetch, scope: 'server' | 'browser'): Fetch {
  if ((inner as any)?.__readOnlyWrapped) return inner;

  const guarded = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const method = String(init?.method ?? (isRequest ? (input as Request).method : 'GET')).toUpperCase();
    if (SAFE_METHODS.has(method)) {
      // Edge functions are refused whatever the method: they send email/push.
      const raw = isRequest ? (input as Request).url : String(input);
      if (SUPABASE_ORIGIN && raw.startsWith(`${SUPABASE_ORIGIN}/functions/v1`)) return blocked(`${method} ${raw}`);
      return call(inner, input, init);
    }

    let url: URL;
    try {
      const raw = isRequest ? (input as Request).url : String(input);
      url = new URL(raw, scope === 'browser' ? window.location.href : 'http://localhost');
    } catch {
      return blocked(`${method} <unparseable url>`);
    }

    if (SUPABASE_ORIGIN && url.origin === SUPABASE_ORIGIN) {
      const path = url.pathname.replace(/\/+$/, '');
      if (AUTH_ALLOWED.has(path)) return call(inner, input, init);
      if (method === 'POST' && STORAGE_READ_POSTS.some((p) => url.pathname.startsWith(p))) {
        return call(inner, input, init);
      }
      if (method === 'POST' && path.startsWith('/rest/v1/rpc/') && !isRequest) {
        let args: Record<string, unknown> = {};
        try {
          args = init?.body ? JSON.parse(String(init.body)) : {};
        } catch {
          return blocked(`RPC ${path} with a non-JSON body`);
        }
        if (args === null || typeof args !== 'object' || Array.isArray(args)) {
          return blocked(`RPC ${path} with a non-object body`);
        }
        const get = new URL(url.toString());
        for (const [k, v] of Object.entries(args)) {
          const s = pgArg(v);
          if (s !== null) get.searchParams.set(k, s);
        }
        const headers = new Headers(init?.headers);
        headers.delete('content-type');
        headers.delete('prefer');
        return call(inner, get.toString(), { ...init, method: 'GET', body: undefined, headers });
      }
      return blocked(`${method} ${url.pathname}`);
    }

    if (scope === 'browser' && url.origin === window.location.origin) return call(inner, input, init);
    return blocked(`${method} ${url.origin}${url.pathname}`);
  } as Fetch;

  // Next.js marks its own patched fetch with flags (__nextPatched, ...) and
  // re-patches if they are missing. Carry them over so it does not re-wrap
  // on every request.
  try {
    Object.assign(guarded, inner);
  } catch {
    /* non-enumerable or frozen: nothing to copy */
  }
  (guarded as any).__readOnlyWrapped = true;
  return guarded;
}

/**
 * Installs the guard on globalThis.fetch. Anything that later REPLACES fetch
 * (Next.js patches it on the server) is wrapped again by the setter, so the
 * guard cannot be dropped by a later assignment.
 */
export function installReadOnlyGuard(scope: 'server' | 'browser'): void {
  if (!READ_ONLY_LIVE) return;
  const g = globalThis as any;
  if (g.__readOnlyGuardInstalled || typeof g.fetch !== 'function') return;
  g.__readOnlyGuardInstalled = true;

  let current: Fetch = wrap(g.fetch, scope);
  try {
    Object.defineProperty(g, 'fetch', {
      configurable: true,
      enumerable: true,
      get: () => current,
      set: (next: Fetch) => {
        current = typeof next === 'function' ? wrap(next, scope) : next;
      },
    });
  } catch {
    g.fetch = current;
  }
}
