// /api/decide against a fake Workers AI binding and a fake SystemOne server: node --test
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleDecide, buildDecision, readDecision, MISTAKES } from '../src/clef.ts';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const FAILED = { command: 'cta mission.txt', output: 'bash: cta: command not found', cwd: '~', challenge: 'Read your mission briefing' };

function post(body, headers = {}) {
    return new Request('https://cli.test/api/decide', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://cli.test', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });
}

function fakeAi(answer) {
    const calls = [];
    return { calls, AI: { async run(model, input) { calls.push({ model, input }); return { result: { answers: { mistake: answer } } }; } } };
}

test('without a backend it answers 503 so Bit keeps its general line', async () => {
    const res = await handleDecide(post(FAILED), { CLEF_MODEL: '@cf/cloudflare/clef-flash' });
    assert.equal(res.status, 503);
});

test('Workers AI gets one choice question over the known mistakes, and a confident answer comes back', async () => {
    const { calls, AI } = fakeAi({ choice: 'typo', confidence: 0.91 });
    const res = await handleDecide(post(FAILED), { AI, CLEF_MODEL: '@cf/cloudflare/clef-flash' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { kind: 'typo', confidence: 0.91, model: '@cf/cloudflare/clef-flash' });
    assert.equal(calls[0].model, '@cf/cloudflare/clef-flash');
    assert.equal(calls[0].input.model, 'clef-flash');
    assert.equal(calls[0].input.state.command, 'cta mission.txt');
    assert.deepEqual(Object.keys(calls[0].input.questions.mistake.criteria), Object.keys(MISTAKES));
});

test('an unsure or unknown answer becomes other', () => {
    assert.equal(readDecision({ answers: { mistake: { choice: 'typo', confidence: 0.4 } } }).kind, 'other');
    assert.equal(readDecision({ answers: { mistake: { choice: 'rm_rf_everything', confidence: 0.99 } } }).kind, 'other');
    assert.equal(readDecision(null).kind, 'other');
});

test('CLEF_URL sends the same request to a SystemOne server, with its key', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        return Response.json({ model: 'Cloudflare/clef-flash', answers: { mistake: { choice: 'not_found', confidence: 0.8 } } });
    };
    const env = { CLEF_MODEL: 'Cloudflare/clef-flash', CLEF_URL: 'https://gpu.lab.test/v1/systemone', CLEF_API_KEY: 'k' };
    const res = await handleDecide(post(FAILED), env);
    assert.equal((await res.json()).kind, 'not_found');
    assert.equal(calls[0].url, 'https://gpu.lab.test/v1/systemone');
    assert.equal(calls[0].init.headers.authorization, 'Bearer k');
    assert.equal(calls[0].body.model, 'Cloudflare/clef-flash');
});

test('a failing or slow backend is a 502, never an exception', async () => {
    const AI = { run: async () => { throw new Error('boom'); } };
    assert.equal((await handleDecide(post(FAILED), { AI, CLEF_MODEL: 'm' })).status, 502);
});

test('bad requests are refused before reaching the model', async () => {
    const { calls, AI } = fakeAi({ choice: 'typo', confidence: 1 });
    const env = { AI, CLEF_MODEL: 'm' };
    assert.equal((await handleDecide(post('not json'), env)).status, 400);
    assert.equal((await handleDecide(post({ command: '  ' }), env)).status, 400);
    assert.equal((await handleDecide(post(FAILED, { origin: 'https://evil.test' }), env)).status, 403);
    assert.equal((await handleDecide(new Request('https://cli.test/api/decide'), env)).status, 405);
    assert.equal(calls.length, 0);
    assert.equal(buildDecision({ command: 'x'.repeat(999) }, 'm').state.command.length, 200);
});
