// The coach (static/coach.js): skills, the hint ladder's cap, and the review. node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const Coach = createRequire(import.meta.url)('../static/coach.js');

const CTX = { challengeId: '0:cd', challenge: 'Go into any directory from home', hint: "Type 'cd documents'", now: 0 };
const at = (seconds, extra = {}) => ({ ...CTX, now: seconds * 1000, ...extra });

test('commands map to the concepts they exercise, including pipes and redirects', () => {
    assert.deepEqual(Coach.conceptsOf('cd documents'), ['navigate']);
    assert.deepEqual(Coach.conceptsOf('grep ERROR log.txt | wc -l').sort(), ['search']);
    assert.deepEqual(Coach.conceptsOf('echo hi > a.txt').sort(), ['redirect']);
    assert.deepEqual(Coach.conceptsOf('nosuch'), []);
});

test('the ladder climbs one step per click, starts at the goal, and never passes the cap', () => {
    const coach = Coach.create();
    const steps = [1, 2, 3, 4].map(() => coach.nextHint(at(0)));
    // A fresh player with no errors: cap is 2 (1, plus 1 for an untested concept)
    assert.deepEqual(steps.map(s => s.level), [1, 2, 2, 2]);
    assert.equal(steps[0].text, 'The goal: Go into any directory from home');
    assert.match(steps[2].text, /Give it a try first/, 'a repeat at the cap says so');
    assert.ok(steps.every(s => s.reveal === ''), 'no step below the top reveals the command');
});

test('errors and time stuck raise the cap; only the top step names the command', () => {
    const coach = Coach.create();
    for (let i = 0; i < 4; i++) coach.observe({ line: 'cd docs', ok: false, completed: false, challengeId: CTX.challengeId, hint: CTX.hint, now: 0 });
    assert.equal(coach.cap(at(10)), 5);
    let step;
    for (let i = 0; i < 5; i++) step = coach.nextHint(at(10));
    assert.equal(step.level, 5);
    assert.equal(step.reveal, "Type 'cd documents'");

    const other = Coach.create();
    assert.equal(other.cap(at(0)), 2);
    assert.equal(other.cap(at(120)), 3, 'stuck for over 90 seconds');
});

test('a solid skill lowers the cap; asking again never raises it', () => {
    const coach = Coach.create();
    for (let i = 0; i < 8; i++) coach.observe({ line: 'cd projects', ok: true, completed: false, challengeId: 'x', hint: CTX.hint, now: 0 });
    assert.equal(coach.cap(at(0)), 1);
    for (let i = 0; i < 6; i++) assert.equal(coach.nextHint(at(0)).level, 1);
});

test('hint uptake is logged, and help that worked fades back down', () => {
    const coach = Coach.create();
    for (let i = 0; i < 3; i++) coach.observe({ line: 'cd docs', ok: false, completed: false, challengeId: CTX.challengeId, hint: CTX.hint, now: 0 });
    coach.nextHint(at(1)); coach.nextHint(at(1)); coach.nextHint(at(1));
    const before = coach.nextHint(at(1)).level;
    coach.observe({ line: 'cd projects', ok: true, completed: false, challengeId: CTX.challengeId, hint: CTX.hint, now: 5000 });
    assert.deepEqual(coach.hintStats(), { shown: 4, used: 1, worked: 1 });
    assert.ok(coach.nextHint(at(6)).level < before, 'the next hint starts lower');
    assert.deepEqual(coach.export().log[0], { challenge: '0:cd', level: before, used: true, ok: true, completed: false, seconds: 4 });
});

test('a model reply below the top step may not contain the exact command', () => {
    const coach = Coach.create();
    assert.equal(coach.leaks("Try typing `cd   Documents` now!", CTX, 3), true);
    assert.equal(coach.leaks("Use 'cd' with the folder name.", CTX, 3), false);
    assert.equal(coach.leaks('Type cd documents', CTX, 5), false);
});

test('the review picks the weakest concepts taught so far, in teaching order, per mode', () => {
    const coach = Coach.create();
    coach.observe({ line: 'cd x', ok: true, completed: false, challengeId: 'a', hint: '', now: 0 });
    coach.observe({ line: 'cat x', ok: false, completed: false, challengeId: 'a', hint: '', now: 0 });
    coach.observe({ line: 'mkdir x', ok: false, completed: false, challengeId: 'a', hint: '', now: 0 });
    assert.deepEqual(coach.pickReview(0, 'real').map(t => t.concept), ['read', 'organize']);
    // Concepts from later chapters wait until they have been taught
    assert.ok(coach.pickReview(0, 'sim').every(t => ['navigate', 'read', 'organize'].includes(t.concept)));
    // The environment task only exists in the simulator
    const sim = Coach.create().pickReview(1, 'sim', 10).map(t => t.concept);
    const real = Coach.create().pickReview(1, 'real', 10).map(t => t.concept);
    assert.ok(sim.includes('environment') && !real.includes('environment'));
});

test('review results move skills more than a single command does', () => {
    const coach = Coach.create();
    coach.recordReview('read', true, 0);
    const read = coach.skills(0).find(k => k.id === 'read');
    assert.ok(Math.abs(read.p - 0.65) < 1e-9);
    assert.deepEqual(coach.skills(0).map(k => k.id), ['navigate', 'read', 'organize', 'archives']);
});

test('review tasks check end state through the shared file interface', async () => {
    const files = new Map();
    const io = {
        mkdir: () => {}, write: (p, t, mode) => files.set(p, { t, mode: (mode || 0o644).toString(8) }),
        isFile: p => files.has(p), read: p => files.get(p)?.t ?? null, mode: p => files.get(p)?.mode ?? '',
        env: () => '', cwd: () => '/home/fsociety',
    };
    const { read, permissions, redirect, navigate } = Coach.TASKS;
    await read.setup(io);
    assert.equal(await read.check(io), false);
    files.set('~/review/lantern', { t: '' });
    assert.equal(await read.check(io), true);
    await permissions.setup(io);
    assert.equal(await permissions.check(io), false);
    files.get('~/review/secret.key').mode = '600';
    assert.equal(await permissions.check(io), true);
    files.set('~/review/status.txt', { t: 'All clear\n' });
    assert.equal(await redirect.check(io), true);
    assert.equal(await navigate.check({ ...io, cwd: () => '/home/fsociety/review/inbox' }), true);
});

test('a broken or old save starts fresh', () => {
    assert.equal(Coach.create('{not json').hintStats().shown, 0);
    assert.equal(Coach.create(JSON.stringify({ v: 0, log: [1, 2] })).hintStats().shown, 0);
});
