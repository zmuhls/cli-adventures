// Sign-in and the My work proxy (src/account.ts) against fake Doorway and store bindings: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAccount, isAccountRoute, safeNext } from '../src/account.ts';
import worker from '../src/index.ts';

const ORIGIN = 'https://cli-adventures.ailab-452.workers.dev';
const WORK = '11111111-1111-4111-8111-111111111111';

function env({ sessions = { good: 'jwt-for-alice' }, redeem = { ok: true, token: 'good', expiresAt: Date.now() + 3600_000 } } = {}) {
    const seen = { store: [], revoked: [], begun: [] };
    return {
        seen,
        PUBLIC_ORIGIN: ORIGIN,
        IDENTITY: {
            async begin(challenge, state) { seen.begun.push({ challenge, state }); return { url: `https://tools.ailab.gc.cuny.edu/worker-login?request=abc` }; },
            async redeem(code, verifier) { seen.redeemed = { code, verifier }; return redeem; },
            async identities(token) { return sessions[token] ? { ok: true, appJwt: sessions[token], gatewayJwt: 'gateway-jwt', workspaceJwt: null } : { ok: false, status: sessions[`status:${token}`] || 401 }; },
            async revoke(token) { seen.revoked.push(token); },
        },
        WORK_ACCOUNTS: {
            async register() { seen.registered = true; return { registered: true }; },
            async fetch(request) {
                seen.store.push({ url: request.url, method: request.method, headers: Object.fromEntries(request.headers), body: request.method === 'GET' ? null : await request.text() });
                return Response.json({ items: [] });
            },
        },
    };
}
const req = (path, { method = 'GET', cookie, origin, body, headers = {} } = {}) => new Request(ORIGIN + path, {
    method, body, headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
});
const SESSION = '__Host-cli-adventures-session';

test('account routes are recognised and sign-in can only return to the game page', () => {
    assert.ok(['/api/session', '/auth/start', '/auth/callback', '/auth/logout', '/api/work/entries'].every(isAccountRoute));
    assert.ok(!isAccountRoute('/api/llm') && !isAccountRoute('/'));
    assert.equal(safeNext('/'), '/');
    assert.equal(safeNext(`/?work=${WORK}`), `/?work=${WORK}`);
    for (const bad of ['//evil.example', 'https://evil.example/', '/\\evil', '/?work=1&next=//evil', '/my-work/', null, '/?work=' + 'x'.repeat(36)]) assert.equal(safeNext(bad), '/');
});

test('off the deployed origin, or without bindings, accounts are reported unavailable', async () => {
    const e = env();
    const local = await handleAccount(new Request('http://localhost:8787/api/session'), e);
    assert.deepEqual(await local.json(), { available: false, authenticated: false });
    assert.equal((await handleAccount(new Request('http://localhost:8787/auth/start'), e)).status, 404);
    const bare = await handleAccount(req('/api/session'), { PUBLIC_ORIGIN: ORIGIN });
    assert.deepEqual(await bare.json(), { available: false, authenticated: false });
});

test('the session route says only whether the player is signed in, and clears an ended session', async () => {
    const e = env();
    assert.deepEqual(await (await handleAccount(req('/api/session'), e)).json(), { available: true, authenticated: false });
    const inside = await handleAccount(req('/api/session', { cookie: `${SESSION}=good` }), e);
    assert.deepEqual(await inside.json(), { available: true, authenticated: true });
    assert.equal(inside.headers.get('cache-control'), 'no-store');
    const ended = await handleAccount(req('/api/session', { cookie: `${SESSION}=stale` }), e);
    assert.deepEqual(await ended.json(), { available: true, authenticated: false, expired: true });
    assert.match(ended.headers.get('set-cookie'), /__Host-cli-adventures-session=; .*Max-Age=0/);
});

test('sign-in starts a PKCE handoff and the callback checks state before redeeming', async () => {
    const e = env();
    const start = await handleAccount(req(`/auth/start?next=${encodeURIComponent('//evil.example')}`), e);
    assert.equal(start.status, 302);
    assert.equal(new URL(start.headers.get('location')).origin, 'https://tools.ailab.gc.cuny.edu');
    const login = start.headers.get('set-cookie');
    assert.match(login, /^__Host-cli-adventures-login=.*; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=600$/);
    const saved = JSON.parse(decodeURIComponent(login.split(';')[0].split('=')[1]));
    assert.equal(saved.next, '/', 'an outside return address is dropped');
    assert.equal(saved.state, e.seen.begun[0].state);
    assert.notEqual(saved.verifier, e.seen.begun[0].challenge, 'only the challenge leaves the Worker');
    const cookie = login.split(';')[0];

    const forged = await handleAccount(req('/auth/callback?code=c1&state=someone-elses', { cookie }), e);
    assert.equal(forged.headers.get('location'), '/?signin=failed');
    assert.equal(e.seen.redeemed, undefined, 'a mismatched state never reaches Doorway');

    const done = await handleAccount(req(`/auth/callback?code=c1&state=${saved.state}`, { cookie }), e);
    assert.equal(done.status, 302);
    assert.equal(done.headers.get('location'), '/');
    assert.deepEqual(e.seen.redeemed, { code: 'c1', verifier: saved.verifier });
    assert.match(done.headers.getSetCookie().join('\n'), /__Host-cli-adventures-session=good; Path=\/; Secure; HttpOnly; SameSite=Lax/);

    const refused = env({ redeem: { ok: false, status: 403 } });
    const s2 = await handleAccount(req('/auth/start'), refused);
    const c2 = s2.headers.get('set-cookie').split(';')[0];
    const st2 = JSON.parse(decodeURIComponent(c2.split('=')[1])).state;
    assert.equal((await handleAccount(req(`/auth/callback?code=c&state=${st2}`, { cookie: c2 }), refused)).headers.get('location'), '/?signin=no-access');
});

test('saved work is reachable only with a live session, and the page cannot choose the identity', async () => {
    const e = env();
    assert.equal((await handleAccount(req('/api/work/entries'), e)).status, 401);
    assert.equal((await handleAccount(req('/api/work/entries', { cookie: `${SESSION}=stale` }), e)).status, 401);
    assert.equal(e.seen.store.length, 0, 'the store is never called without a verified session');

    const body = JSON.stringify({ id: WORK, app: 'cli-adventures', kind: 'progress', title: 't', expectedRevision: 0, content: {} });
    const put = await handleAccount(req('/api/work/entries', { method: 'PUT', cookie: `${SESSION}=good`, origin: ORIGIN, body,
        headers: { 'x-cail-identity-jwt': 'forged-jwt', 'x-cail-gateway-identity-jwt': 'forged', authorization: 'Bearer forged' } }), e);
    assert.equal(put.status, 200);
    const sent = e.seen.store[0];
    assert.equal(sent.url, 'https://tools.ailab.gc.cuny.edu/api/work/entries');
    assert.equal(sent.headers['x-cail-identity-jwt'], 'jwt-for-alice', 'identity comes from the session, not the request');
    assert.equal(sent.headers.origin, 'https://tools.ailab.gc.cuny.edu');
    assert.equal(sent.headers.cookie, undefined);
    assert.equal(sent.headers.authorization, undefined);
    assert.equal(sent.headers['x-cail-gateway-identity-jwt'], undefined);
    assert.equal(sent.body, body);

    await handleAccount(req(`/api/work/entries/${WORK}`, { cookie: `${SESSION}=good` }), e);
    assert.equal(e.seen.store[1].url, `https://tools.ailab.gc.cuny.edu/api/work/entries/${WORK}`);
});

test('writes from another site, other methods and other store routes are refused', async () => {
    const e = env();
    const cookie = `${SESSION}=good`;
    for (const options of [{ origin: 'https://evil.example' }, {}, { origin: ORIGIN, headers: { 'sec-fetch-site': 'cross-site' } }]) {
        const res = await handleAccount(req('/api/work/entries', { method: 'PUT', cookie, body: '{}', ...options }), e);
        assert.equal(res.status, 403);
    }
    assert.equal((await handleAccount(req(`/api/work/entries/${WORK}`, { method: 'DELETE', cookie, origin: ORIGIN }), e)).status, 405);
    for (const path of ['/api/work/export', '/api/work/account-data', '/api/work/profile', `/api/work/entries/${WORK}/pin`, '/api/work/entries/../profile']) {
        assert.equal((await handleAccount(req(path, { cookie }), e)).status, 404, path);
    }
    assert.equal(e.seen.store.length, 0);
});

test('an account without Lab access, or an unreachable service, leaves play untouched', async () => {
    const noAccess = env({ sessions: { 'status:locked': 403 } });
    assert.equal((await handleAccount(req('/api/work/entries', { cookie: `${SESSION}=locked` }), noAccess)).status, 403);
    assert.equal((await (await handleAccount(req('/api/session', { cookie: `${SESSION}=locked` }), noAccess)).json()).reason, 'no-access');
    const down = env();
    down.IDENTITY.identities = async () => { throw new Error('doorway offline'); };
    const res = await handleAccount(req('/api/work/entries', { cookie: `${SESSION}=good` }), down);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error.message, /still saved in this browser/);
});

test('sign-out revokes the session and needs a same-origin POST', async () => {
    const e = env();
    assert.equal((await handleAccount(req('/auth/logout', { cookie: `${SESSION}=good` }), e)).status, 405);
    assert.equal((await handleAccount(req('/auth/logout', { method: 'POST', cookie: `${SESSION}=good`, origin: 'https://evil.example' }), e)).status, 403);
    const out = await handleAccount(req('/auth/logout', { method: 'POST', cookie: `${SESSION}=good`, origin: ORIGIN }), e);
    assert.equal(out.status, 200);
    assert.deepEqual(e.seen.revoked, ['good']);
    assert.match(out.headers.getSetCookie().join('\n'), /session=; .*Max-Age=0/);
});

test('health enrolls the Worker in My work and stays healthy when the store is down', async () => {
    const e = { ...env(), RELEASE: 'abc1234', ASSETS: { fetch: async () => new Response('page') } };
    assert.deepEqual(await (await worker.fetch(new Request(ORIGIN + '/health'), e)).json(), { ok: true, status: 'ok', project: 'cli-adventures', release: 'abc1234', accounts: true });
    e.WORK_ACCOUNTS.register = async () => { throw new Error('store offline'); };
    const res = await worker.fetch(new Request(ORIGIN + '/health'), e);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).accounts, false);
});
