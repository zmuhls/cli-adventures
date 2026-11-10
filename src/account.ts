// CUNY sign-in on this Worker's own origin, and the player's saved progress in the Lab's
// shared My work store (cail-work-accounts). The browser only ever holds an opaque,
// HttpOnly session cookie: identity tokens stay between Workers, and the store decides
// ownership from the verified identity, never from anything the page sends.

const TOOLS_ORIGIN = 'https://tools.ailab.gc.cuny.edu';
const SESSION_COOKIE = '__Host-cli-adventures-session';
const LOGIN_COOKIE = '__Host-cli-adventures-login';
const PROOF = /^[A-Za-z0-9_-]{43}$/;
// Only the game's own page, optionally reopening one saved item, may follow sign-in
const NEXT = /^\/(?:\?work=[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})?$/;
// What the game needs from the store: list its entries, read one, save one
const WORK_ROUTE = /^\/api\/work\/entries(?:\/[0-9a-f-]{36})?$/;

type Identities = { ok: true; appJwt: string; gatewayJwt: string; workspaceJwt: string | null } | { ok: false; status: number };

export interface AccountEnv {
  PUBLIC_ORIGIN?: string;
  IDENTITY?: {
    begin(challenge: string, state: string): Promise<{ url: string }>;
    redeem(code: string, verifier: string): Promise<{ ok: true; token: string; expiresAt: number } | { ok: false; status: number }>;
    identities(token: string): Promise<Identities>;
    revoke(token: string): Promise<unknown>;
  };
  WORK_ACCOUNTS?: { register(): Promise<unknown>; fetch(request: Request): Promise<Response> };
  LLM_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

const secure = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' };

function json(body: unknown, status = 200, cookies: string[] = []): Response {
  const headers = new Headers({ ...secure, 'content-type': 'application/json' });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status, headers });
}

function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ ...secure, location });
  for (const c of cookies) headers.append('set-cookie', c);
  return new Response(null, { status: 302, headers });
}

const cookie = (name: string, value: string, seconds: number) => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${seconds}`;

function readCookie(request: Request, name: string): string {
  return request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

export const safeNext = (value: string | null) => (typeof value === 'string' && NEXT.test(value) ? value : '/');

export function isAccountRoute(path: string): boolean {
  return path === '/api/session' || path.startsWith('/auth/') || path.startsWith('/api/work/');
}

/** True where sign-in can work: the deployed origin, with both private bindings present. */
export function accountsAvailable(request: Request, env: AccountEnv): boolean {
  return Boolean(env.IDENTITY && env.WORK_ACCOUNTS && env.PUBLIC_ORIGIN && new URL(request.url).origin === env.PUBLIC_ORIGIN);
}

function failure(status: number): Response {
  const [code, message] = status === 401 ? ['authentication_required', 'Sign in with CUNY to save progress to your account.']
    : status === 403 ? ['admission_required', 'Active CUNY AI Lab access is required to save to an account.']
    : ['service_unavailable', 'Account saving is temporarily unavailable. Progress is still saved in this browser.'];
  return json({ error: { code, message } }, status === 401 || status === 403 ? status : 503, status === 401 ? [cookie(SESSION_COOKIE, '', 0)] : []);
}

export async function handleAccount(request: Request, env: AccountEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const reading = ['GET', 'HEAD'].includes(request.method);
  if (!accountsAvailable(request, env)) {
    return path === '/api/session' && reading ? json({ available: false, authenticated: false }) : json({ error: { code: 'not_found', message: 'Accounts are not available here.' } }, 404);
  }
  // A mutation must come from this page, on this origin
  if (!reading && (request.headers.get('origin') !== env.PUBLIC_ORIGIN || request.headers.get('sec-fetch-site') === 'cross-site')) {
    return json({ error: { code: 'origin_rejected', message: 'Reload this page from CLI Adventures.' } }, 403);
  }
  const identity = env.IDENTITY!;
  const token = readCookie(request, SESSION_COOKIE);
  try {
    if (path === '/auth/start') {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...secure, allow: 'GET' } });
      if (env.LLM_LIMITER) {
        const { success } = await env.LLM_LIMITER.limit({ key: `login:${request.headers.get('cf-connecting-ip') ?? 'unknown'}` });
        if (!success) return new Response('Try signing in again shortly.', { status: 429, headers: { ...secure, 'retry-after': '60' } });
      }
      const verifier = random();
      const state = random();
      const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const started = await identity.begin(challenge, state);
      const target = new URL(started.url);
      if (target.origin !== TOOLS_ORIGIN || target.pathname !== '/worker-login') throw new Error('invalid sign-in destination');
      const login = encodeURIComponent(JSON.stringify({ verifier, state, next: safeNext(url.searchParams.get('next')) }));
      return redirect(started.url, [cookie(LOGIN_COOKIE, login, 600)]);
    }
    if (path === '/auth/callback') {
      if (request.method !== 'GET') return new Response(null, { status: 405, headers: { ...secure, allow: 'GET' } });
      const raw = readCookie(request, LOGIN_COOKIE);
      const code = url.searchParams.get('code');
      let login: { verifier?: unknown; state?: unknown; next?: unknown } | null = null;
      try { login = raw && raw.length <= 1500 ? JSON.parse(decodeURIComponent(raw)) : null; } catch { login = null; }
      if (!login || typeof login !== 'object' || typeof login.verifier !== 'string' || typeof login.state !== 'string'
        || !PROOF.test(login.verifier) || !PROOF.test(login.state) || login.state !== url.searchParams.get('state') || !code) {
        // The game still plays; it reports that sign-in did not finish
        return redirect('/?signin=failed', [cookie(LOGIN_COOKIE, '', 0)]);
      }
      const redeemed = await identity.redeem(code, login.verifier);
      if (!redeemed.ok) return redirect(redeemed.status === 403 ? '/?signin=no-access' : '/?signin=failed', [cookie(LOGIN_COOKIE, '', 0)]);
      const seconds = Math.max(0, Math.floor((redeemed.expiresAt - Date.now()) / 1000));
      return redirect(safeNext(typeof login.next === 'string' ? login.next : null), [cookie(SESSION_COOKIE, redeemed.token, seconds), cookie(LOGIN_COOKIE, '', 0)]);
    }
    if (path === '/auth/logout') {
      if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...secure, allow: 'POST' } });
      if (token) await identity.revoke(token).catch(() => undefined);
      return json({ signedOut: true }, 200, [cookie(SESSION_COOKIE, '', 0), cookie(LOGIN_COOKIE, '', 0)]);
    }
    if (path === '/api/session') {
      if (!reading) return new Response(null, { status: 405, headers: { ...secure, allow: 'GET' } });
      if (!token) return json({ available: true, authenticated: false });
      const who = await identity.identities(token);
      if (who.ok) return json({ available: true, authenticated: true });
      // An ended session is reported once, and its cookie is cleared
      if (who.status === 401) return json({ available: true, authenticated: false, expired: true }, 200, [cookie(SESSION_COOKIE, '', 0)]);
      return json({ available: true, authenticated: false, reason: who.status === 403 ? 'no-access' : 'unavailable' });
    }
    if (WORK_ROUTE.test(path)) {
      if (!['GET', 'PUT'].includes(request.method)) return new Response(null, { status: 405, headers: { ...secure, allow: 'GET, PUT' } });
      if (!token) return failure(401);
      const who = await identity.identities(token);
      if (!who.ok) return failure(who.status);
      // The store sees a Lab-origin request carrying only the verified app identity
      const target = new URL(url);
      target.protocol = 'https:';
      target.host = new URL(TOOLS_ORIGIN).host;
      // A save is read whole, with the store's own size limit, before anything is forwarded
      const body = reading ? null : await request.text();
      if (body !== null && body.length > 200_000) return json({ error: { code: 'body_too_large', message: 'This game is too large to save.' } }, 413);
      const headers = new Headers();
      for (const name of ['accept', 'content-type']) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
      }
      if (!reading) headers.set('origin', TOOLS_ORIGIN);
      headers.set('x-cail-identity-jwt', who.appJwt);
      return await env.WORK_ACCOUNTS!.fetch(new Request(target, { method: request.method, headers, body, redirect: 'manual', signal: request.signal }));
    }
    return json({ error: { code: 'not_found', message: 'No such account route.' } }, 404);
  } catch {
    console.error(JSON.stringify({ event: 'account.unavailable', path }));
    return failure(503);
  }
}
