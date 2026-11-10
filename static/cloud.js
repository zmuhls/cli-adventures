// Saved progress on the player's CUNY account (the Lab's My work store), through this
// Worker's /api/session and /api/work routes. The browser save stays the working copy:
// the game never waits on the network, and nothing here can lose local progress.
// Rules: one saved item per player; a newer copy elsewhere is never overwritten without
// the player choosing; failed saves retry a bounded number of times, then offer Retry.
const CloudSave = (() => {
    'use strict';

    const APP = 'cli-adventures';
    const KIND = 'progress';
    const FORMAT = 'cli-adventures-save-v2';
    const DEBOUNCE_MS = 1500;
    const RETRY_MS = [2000, 8000, 30000];
    const MAX_CHARS = 150000;
    const MAX_BODY_BYTES = 180000;   // under the store's 192,000-byte limit, with room for the envelope
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    // A short fingerprint of a save, to recognise our own earlier push when its reply was lost
    function mark(text) {
        let h = 2166136261;
        for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
        return `${text.length}:${(h >>> 0).toString(36)}`;
    }

    const describe = p => (p.done ? 'every chapter complete' : `Chapter ${p.chapter + 1} of ${p.chapters}, challenge ${p.index + 1} of ${p.total}`);

    // Keep the coach's skills; drop the oldest hint history if the save would be too large
    function trimCoach(text, room) {
        if (text.length <= room) return text;
        try {
            const coach = JSON.parse(text);
            coach.log = Array.isArray(coach.log) ? coach.log.slice(-100) : [];
            const trimmed = JSON.stringify(coach);
            return trimmed.length <= room ? trimmed : '';
        } catch (_) { return ''; }
    }

    function envelope(id, revision, snapshot) {
        const p = snapshot.progress;
        return {
            id, app: APP, kind: KIND, expectedRevision: revision,
            title: p.done ? 'CLI Adventures · complete' : `CLI Adventures · Chapter ${p.chapter + 1} of ${p.chapters}`,
            content: {
                schemaVersion: 1,
                contributions: [],
                text: `CLI Adventures progress: ${describe(p)}.`,
                reading: '',
                settings: {},
                // The game's own save, kept whole so every file and folder comes back as it was
                record: { format: FORMAT, state: snapshot.state, coach: trimCoach(snapshot.coach || '', MAX_CHARS - snapshot.state.length), progress: { chapter: p.chapter, index: p.index, total: p.total, chapters: p.chapters, done: !!p.done } },
            },
        };
    }

    // A saved item is used only if it is this game's own, well-formed record
    function recordOf(item) {
        const r = item && item.content && item.content.record;
        if (!r || r.format !== FORMAT || typeof r.state !== 'string' || !r.state || r.state.length > MAX_CHARS) return null;
        const p = r.progress;
        if (!p || !Number.isInteger(p.chapter) || !Number.isInteger(p.index) || !Number.isInteger(p.total) || !Number.isInteger(p.chapters)) return null;
        return { state: r.state, coach: typeof r.coach === 'string' ? r.coach : '', progress: { chapter: p.chapter, index: p.index, total: p.total, chapters: p.chapters, done: !!p.done } };
    }

    function create({ request, local, apply, onStatus, onChoice, uuid, workId = null, recall = () => null, remember = () => {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
        let available = false;
        let authenticated = false;
        let id = null;
        let revision = 0;
        let synced = '';        // the game save last known to be on the account
        let held = false;       // waiting for the player to choose between two copies
        let stopped = false;    // this state cannot be saved (too large, refused); wait for a change
        let saving = null;
        let dirty = false;
        let timer = null;
        let attempts = 0;

        const status = (kind, message, extra = {}) => onStatus({ kind, message, ...extra });
        // The account copy this browser last matched; if it is unchanged, local progress is simply newer
        const matched = () => remember({ id, revision });
        // The account copy is ours if this browser last matched that revision, or if it is the
        // very save this browser sent last (its reply can be lost to a timeout or a closed tab).
        const isOurs = (cloud) => {
            const known = recall();
            if (!known || known.id !== id) return false;
            return known.revision === revision || (Array.isArray(known.pushing) && known.pushing.includes(mark(cloud.state)));
        };

        async function call(path, init) {
            let res;
            try { res = await request(path, init); } catch (_) { return { ok: false, status: 0, data: null }; }
            let data = null;
            try { data = await res.json(); } catch (_) { /* not JSON */ }
            return { ok: res.ok, status: res.status, data };
        }

        function ended(reply) {
            if (reply.status === 401) {
                authenticated = false;
                status('expired', 'Your CUNY sign-in ended. Progress is still saved in this browser.');
                return true;
            }
            if (reply.status === 403) {
                authenticated = false;
                status('local', 'This CUNY account does not have Lab access, so progress is saved in this browser only.');
                return true;
            }
            return false;
        }

        function offerChoice(cloud) {
            held = true;
            const mine = local();
            status('conflict', 'Your account has different progress. Choose which to keep.');
            onChoice({
                cloud: describe(cloud.progress), local: describe(mine.progress),
                useCloud() {
                    if (!apply(cloud)) { status('error', 'The progress on your account could not be opened. This browser’s progress is kept.'); return; }
                    held = false; synced = cloud.state; matched();
                    status('saved', 'Progress restored from your CUNY account.');
                },
                keepLocal() { held = false; void push(); },
            });
        }

        // Find this player's saved item (or the one a My work link names) and reconcile
        async function load() {
            status('saving', 'Checking your CUNY account…');
            let found = workId;
            if (!found) {
                const list = await call('/api/work/entries');
                if (!list.ok) { if (!ended(list)) status('error', 'Your account could not be reached. Progress is saved in this browser.', { retry: load }); return; }
                found = list.data && Array.isArray(list.data.items) && list.data.items[0] ? list.data.items[0].id : null;
            }
            let cloud = null;
            if (found && UUID.test(found)) {
                const one = await call(`/api/work/entries/${found}`);
                if (one.ok && one.data && one.data.item) {
                    id = one.data.item.id; revision = one.data.item.revision; cloud = recordOf(one.data.item);
                } else if (one.status !== 404) {
                    if (!ended(one)) status('error', 'Your account could not be reached. Progress is saved in this browser.', { retry: load });
                    return;
                }
            }
            const mine = local();
            if (!id) {
                id = uuid(); revision = 0;
                if (mine.progress.fresh) { status('saved', 'Signed in. Progress will be saved to your CUNY account.'); return; }
                await push();
                return;
            }
            // An unreadable item is replaced by the current game, but never by an untouched new one
            if (!cloud) { if (mine.progress.fresh) status('saved', 'Signed in. Progress will be saved to your CUNY account.'); else await push(); return; }
            if (cloud.state === mine.state) { synced = mine.state; matched(); status('saved', 'Saved to your CUNY account.'); return; }
            if (!workId && isOurs(cloud)) { await push(); return; }
            if (mine.progress.fresh || workId) {
                if (apply(cloud)) { synced = cloud.state; matched(); status('saved', 'Progress restored from your CUNY account.'); }
                else status('error', 'The progress on your account could not be opened. This browser’s progress is kept.');
                return;
            }
            offerChoice(cloud);
        }

        async function push() {
            clearTimer(timer); timer = null;
            if (!authenticated || held || !id) return false;
            if (saving) { dirty = true; return saving; }
            const snapshot = local();
            if (snapshot.state === synced) return true;
            // Size is judged on what is actually sent: quotes and non-ASCII text grow when encoded
            const body = JSON.stringify(envelope(id, revision, snapshot));
            if (snapshot.state.length > MAX_CHARS || new TextEncoder().encode(body).length > MAX_BODY_BYTES) { stopped = true; status('error', 'This game is too large to save to your account. It is still saved in this browser.'); return false; }
            status('saving', 'Saving to your CUNY account…');
            // Every save sent since the last confirmed one may have landed; keep their fingerprints
            const before = recall() || {};
            const sentMarks = [...new Set([...(before.id === id && Array.isArray(before.pushing) ? before.pushing : []), mark(snapshot.state)])].slice(-5);
            remember({ id, revision: before.id === id ? before.revision : undefined, pushing: sentMarks });
            saving = (async () => {
                const reply = await call('/api/work/entries', { method: 'PUT', headers: { 'content-type': 'application/json' }, body });
                if (reply.ok && reply.data && reply.data.item) {
                    revision = reply.data.item.revision; synced = snapshot.state; attempts = 0; stopped = false; matched();
                    status('saved', 'Saved to your CUNY account.');
                    return true;
                }
                if (ended(reply)) return false;
                if (reply.status === 409 || reply.status === 404) {
                    // Another tab or device saved first: read it back and let the player choose
                    const one = await call(`/api/work/entries/${id}`);
                    const cloud = one.ok && one.data && one.data.item ? recordOf(one.data.item) : null;
                    if (one.ok && one.data && one.data.item) revision = one.data.item.revision;
                    else if (one.status === 404) { id = uuid(); revision = 0; }
                    // If what is there is the save we just sent, its reply was lost: carry on from it
                    if (cloud && cloud.state !== snapshot.state && !isOurs(cloud)) offerChoice(cloud);
                    else dirty = true;
                    return false;
                }
                if (reply.status === 400 || reply.status === 413 || reply.status === 415) {
                    stopped = true;
                    status('error', 'This game could not be saved to your account. It is still saved in this browser.');
                    return false;
                }
                // Network trouble, a busy service or a rate limit: try again a few times, then ask
                if (attempts < RETRY_MS.length) {
                    const wait = RETRY_MS[attempts++];
                    status('saving', 'Could not reach your account. Trying again shortly…');
                    timer = setTimer(() => void push(), wait);
                } else {
                    attempts = 0;
                    status('error', 'Not saved to your account. Progress is still saved in this browser.', { retry: () => void push() });
                }
                return false;
            })();
            const done = await saving;
            saving = null;
            if (dirty) { dirty = false; if (!held) return push(); }
            return done;
        }

        return {
            describe,
            get authenticated() { return authenticated; },
            get available() { return available; },
            async start() {
                const session = await call('/api/session');
                available = !!(session.ok && session.data && session.data.available);
                authenticated = !!(available && session.data.authenticated);
                if (!available) { status('local', 'Progress is saved in this browser.'); return { available, authenticated }; }
                if (!authenticated) {
                    if (session.data.expired) status('expired', 'Your CUNY sign-in ended. Progress is still saved in this browser.');
                    else if (session.data.reason === 'no-access') status('local', 'This CUNY account does not have Lab access, so progress is saved in this browser only.');
                    else status('signed-out', 'Progress is saved in this browser. Sign in with CUNY to keep it on your account.');
                    return { available, authenticated };
                }
                await load();
                return { available, authenticated };
            },
            // The game saved locally: follow with an account save once typing settles
            changed() {
                if (!authenticated || held) return;
                stopped = false; attempts = 0;
                clearTimer(timer);
                timer = setTimer(() => void push(), DEBOUNCE_MS);
            },
            flush: () => push(),
            pending: () => authenticated && !held && !stopped && !!id && local().state !== synced,
            async signOut() {
                clearTimer(timer); timer = null;
                await call('/auth/logout', { method: 'POST' });
                authenticated = false; id = null; revision = 0; synced = ''; held = false;
                status('signed-out', 'Signed out. Progress stays saved in this browser.');
            },
        };
    }

    return { create, envelope, recordOf, describe };
})();

if (typeof module !== 'undefined') module.exports = CloudSave;
