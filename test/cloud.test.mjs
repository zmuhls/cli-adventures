// Account saves (static/cloud.js) against a fake My work store: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const CloudSave = createRequire(import.meta.url)('../static/cloud.js');
const ID = '11111111-1111-4111-8111-111111111111';
const progress = (chapter, index, extra = {}) => ({ chapter, index, total: 10, chapters: 6, done: false, fresh: chapter === 0 && index === 0, ...extra });
const game = (name, chapter, index) => ({ state: JSON.stringify({ version: 2, name, chapter, index }), coach: '{"v":1,"skills":{},"log":[],"reviews":[]}', progress: progress(chapter, index) });

// A store with one optional saved item, optimistic revisions, and scripted failures
function harness({ session = { available: true, authenticated: true }, saved = null, local = game('local', 0, 0), remembered = null, workId = null } = {}) {
    const h = { calls: [], statuses: [], choices: [], applied: [], timers: [], fail: [], saved, local, remembered };
    const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
    const request = async (path, init = {}) => {
        const method = init.method || 'GET';
        h.calls.push(`${method} ${path}`);
        const failure = h.fail.shift();
        if (failure === 'network') throw new Error('offline');
        if (failure) return reply(failure, { error: { message: 'x' } });
        if (path === '/api/session') return reply(200, session);
        if (path === '/auth/logout') return reply(200, { signedOut: true });
        if (path === '/api/work/entries' && method === 'GET') return reply(200, { items: h.saved ? [{ id: h.saved.id, revision: h.saved.revision }] : [] });
        if (path.startsWith('/api/work/entries/')) return h.saved && path.endsWith(h.saved.id) ? reply(200, { item: h.saved }) : reply(404, {});
        const body = JSON.parse(init.body);
        if (h.saved && (h.saved.id !== body.id || h.saved.revision !== body.expectedRevision)) return reply(409, {});
        if (!h.saved && body.expectedRevision !== 0) return reply(404, {});
        h.saved = { id: body.id, revision: body.expectedRevision + 1, content: body.content, title: body.title };
        return reply(200, { item: h.saved });
    };
    h.cloud = CloudSave.create({
        request, workId, uuid: () => ID,
        local: () => h.local,
        apply: record => { h.applied.push(record); h.local = { state: record.state, coach: record.coach, progress: { ...record.progress, fresh: false } }; return true; },
        onStatus: s => h.statuses.push(s),
        onChoice: c => h.choices.push(c),
        recall: () => h.remembered,
        remember: value => { h.remembered = value; },
        setTimer: (fn, ms) => { h.timers.push({ fn, ms }); return h.timers.length; },
        clearTimer: () => {},
    });
    h.fire = async () => { const t = h.timers.pop(); h.timers.length = 0; await t.fn(); await new Promise(r => setImmediate(r)); };
    h.last = () => h.statuses.at(-1);
    return h;
}
const stored = (snapshot, revision = 1) => ({ id: ID, revision, content: CloudSave.envelope(ID, 0, snapshot).content });

test('where accounts are unavailable or the player is signed out, nothing is sent', async () => {
    const off = harness({ session: { available: false, authenticated: false } });
    await off.cloud.start(); off.cloud.changed();
    assert.deepEqual(off.calls, ['GET /api/session']);
    assert.equal(off.last().kind, 'local');
    const out = harness({ session: { available: true, authenticated: false } });
    await out.cloud.start(); out.cloud.changed();
    assert.equal(out.last().kind, 'signed-out');
    assert.equal(out.timers.length, 0);
});

test('first sign-in uploads existing browser progress as one new item', async () => {
    const h = harness({ local: game('local', 2, 3) });
    await h.cloud.start();
    assert.equal(h.saved.revision, 1);
    assert.equal(h.saved.title, 'CLI Adventures · Chapter 3 of 6');
    assert.equal(h.saved.content.record.state, h.local.state);
    assert.deepEqual(h.saved.content.contributions, []);
    assert.deepEqual(h.remembered, { id: ID, revision: 1 });
    assert.equal(h.last().message, 'Saved to your CUNY account.');
});

test('a fresh browser takes the account copy; play then saves back with the right revision', async () => {
    const h = harness({ saved: stored(game('cloud', 3, 4), 7) });
    await h.cloud.start();
    assert.equal(h.applied.length, 1);
    assert.equal(h.applied[0].progress.chapter, 3);
    assert.equal(h.choices.length, 0);
    h.local = game('cloud-then-played', 3, 5);
    h.cloud.changed();
    assert.equal(h.timers[0].ms, 1500, 'saves wait for typing to settle');
    await h.fire();
    assert.equal(h.saved.revision, 8);
    assert.equal(h.saved.content.record.progress.index, 5);
});

test('two different games are never merged or overwritten without the player choosing', async () => {
    const h = harness({ saved: stored(game('cloud', 4, 1), 3), local: game('local', 1, 2) });
    await h.cloud.start();
    assert.equal(h.applied.length, 0);
    assert.equal(h.choices.length, 1);
    assert.equal(h.choices[0].cloud, 'Chapter 5 of 6, challenge 2 of 10');
    assert.equal(h.choices[0].local, 'Chapter 2 of 6, challenge 3 of 10');
    h.cloud.changed();
    assert.equal(h.timers.length, 0, 'saving waits for the choice');
    assert.equal(h.saved.content.record.progress.chapter, 4);
    h.choices[0].keepLocal();
    await new Promise(r => setImmediate(r));
    assert.equal(h.saved.revision, 4);
    assert.equal(h.saved.content.record.progress.chapter, 1);

    const other = harness({ saved: stored(game('cloud', 4, 1), 3), local: game('local', 1, 2) });
    await other.cloud.start();
    other.choices[0].useCloud();
    assert.equal(other.applied[0].progress.chapter, 4);
    assert.equal(other.saved.revision, 3, 'choosing the account copy writes nothing');
});

test('progress made while offline is simply newer when the account copy has not changed', async () => {
    const h = harness({ saved: stored(game('cloud', 1, 0), 5), local: game('local', 1, 6), remembered: { id: ID, revision: 5 } });
    await h.cloud.start();
    assert.equal(h.choices.length, 0);
    assert.equal(h.saved.revision, 6);
    assert.equal(h.saved.content.record.progress.index, 6);
});

test('a save from another device is detected as a conflict, not overwritten', async () => {
    const h = harness({ local: game('local', 1, 1) });
    await h.cloud.start();
    h.saved = { ...stored(game('other-device', 5, 2), 9) };
    h.local = game('local', 1, 2);
    h.cloud.changed(); await h.fire();
    assert.equal(h.saved.content.record.progress.chapter, 5, 'the other device’s save is intact');
    assert.equal(h.choices.length, 1);
    assert.equal(h.last().kind, 'conflict');
});

test('failed saves retry three times with growing waits, then stop and offer Retry', async () => {
    const h = harness({ local: game('local', 1, 1) });
    await h.cloud.start();
    h.local = game('local', 1, 2);
    h.fail = ['network', 503, 429, 502];
    h.cloud.changed(); await h.fire();
    const waits = [];
    for (let i = 0; i < 3; i++) { waits.push(h.timers.at(-1).ms); await h.fire(); }
    assert.deepEqual(waits, [2000, 8000, 30000]);
    assert.equal(h.timers.length, 0, 'no further automatic attempts');
    assert.equal(h.last().kind, 'error');
    assert.match(h.last().message, /still saved in this browser/);
    assert.equal(typeof h.last().retry, 'function');
    const puts = h.calls.filter(c => c.startsWith('PUT')).length;
    h.last().retry(); await new Promise(r => setImmediate(r));
    assert.equal(h.calls.filter(c => c.startsWith('PUT')).length, puts + 1);
    assert.equal(h.last().message, 'Saved to your CUNY account.');
    assert.equal(h.saved.content.record.progress.index, 2);
});

test('an ended session stops saving and says progress is still in the browser', async () => {
    const h = harness({ local: game('local', 1, 1) });
    await h.cloud.start();
    h.local = game('local', 1, 2); h.fail = [401];
    h.cloud.changed(); await h.fire();
    assert.equal(h.last().kind, 'expired');
    assert.equal(h.cloud.authenticated, false);
    h.local = game('local', 1, 3); h.cloud.changed();
    assert.equal(h.timers.length, 0);
});

test('changes during a save are sent once it finishes, never in parallel', async () => {
    const h = harness({ local: game('local', 1, 1) });
    await h.cloud.start();
    h.local = game('local', 1, 2);
    const first = h.cloud.flush();
    h.local = game('local', 1, 3);
    const second = h.cloud.flush();
    await Promise.all([first, second]);
    assert.equal(h.saved.content.record.progress.index, 3);
    assert.equal(h.saved.revision, 3);
    assert.equal(h.calls.filter(c => c.startsWith('PUT')).length, 3);
});

test('only this game’s well-formed record is ever applied; a My work link opens that item', async () => {
    assert.equal(CloudSave.recordOf({ content: { record: { format: 'other', state: '{}' } } }), null);
    assert.equal(CloudSave.recordOf({ content: { record: { format: 'cli-adventures-save-v2', state: 'x'.repeat(150001), progress: progress(0, 0) } } }), null);
    assert.equal(CloudSave.recordOf({ content: { record: { format: 'cli-adventures-save-v2', state: '{}', progress: { chapter: 'two' } } } }), null);
    const h = harness({ saved: stored(game('cloud', 2, 2), 4), local: game('local', 5, 5), workId: ID });
    await h.cloud.start();
    assert.ok(h.calls.includes(`GET /api/work/entries/${ID}`));
    assert.ok(!h.calls.includes('GET /api/work/entries'));
    assert.equal(h.applied[0].progress.chapter, 2);
});

test('sign-out forgets the account item but keeps playing locally', async () => {
    const h = harness({ local: game('local', 1, 1) });
    await h.cloud.start();
    await h.cloud.signOut();
    assert.ok(h.calls.includes('POST /auth/logout'));
    h.local = game('local', 1, 2); h.cloud.changed();
    assert.equal(h.timers.length, 0);
    assert.equal(h.last().kind, 'signed-out');
});

test('a save whose reply was lost is recognised as our own, not shown as a conflict', async () => {
    // Same session: the PUT lands, the reply never arrives, the player types one more command
    const h = harness({ local: game('local', 1, 1) });
    await h.cloud.start();
    h.local = game('local', 1, 2);
    const landed = { ...stored(h.local, 2) };
    h.fail = ['network'];
    h.cloud.changed(); await h.fire();           // request "fails" from the page's point of view
    h.saved = landed;                            // but the store has it, at the next revision
    h.local = game('local', 1, 3);
    await h.fire();                              // the scheduled retry: 409, then recognised
    await new Promise(r => setImmediate(r));
    assert.equal(h.choices.length, 0, 'no conflict prompt against our own save');
    assert.equal(h.saved.content.record.progress.index, 3);
    assert.equal(h.saved.revision, 3);

    // Next visit: the tab closed before the reply; a newer local step must not prompt either
    const later = harness({ saved: stored(game('local', 2, 4), 9), local: game('local', 2, 5),
        remembered: { id: ID, revision: 8, pushing: [] } });
    later.remembered.pushing = [(() => { let hsh = 2166136261; const t = game('local', 2, 4).state; for (let i = 0; i < t.length; i++) hsh = Math.imul(hsh ^ t.charCodeAt(i), 16777619); return `${t.length}:${(hsh >>> 0).toString(36)}`; })()];
    await later.cloud.start();
    assert.equal(later.choices.length, 0);
    assert.equal(later.saved.content.record.progress.index, 5);
});

test('a genuinely different copy from elsewhere still prompts', async () => {
    const h = harness({ saved: stored(game('other-device', 4, 4), 9), local: game('local', 2, 5), remembered: { id: ID, revision: 8, pushing: ['10:abc'] } });
    await h.cloud.start();
    assert.equal(h.choices.length, 1);
    assert.equal(h.saved.content.record.progress.chapter, 4);
});

test('an untouched new game never replaces an account item it cannot read', async () => {
    const unreadable = { id: ID, revision: 4, content: { schemaVersion: 1, contributions: [], text: '', reading: '', settings: {}, record: { format: 'some-future-format', state: '{}' } } };
    const h = harness({ saved: unreadable, local: game('local', 0, 0) });
    await h.cloud.start();
    assert.equal(h.calls.filter(c => c.startsWith('PUT')).length, 0);
    assert.equal(h.saved.revision, 4);
});

test('the size limit is judged on the encoded save, so a refusal by the store cannot surprise the player', async () => {
    const big = game('local', 1, 1);
    big.state = JSON.stringify({ version: 2, pad: '"é'.repeat(60000) });   // 120k characters, far more once encoded
    const h = harness({ local: big });
    await h.cloud.start();
    assert.equal(h.calls.filter(c => c.startsWith('PUT')).length, 0, 'nothing oversized is sent');
    assert.equal(h.last().kind, 'error');
    assert.match(h.last().message, /too large/);
});
