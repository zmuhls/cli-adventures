// The coach: what the game knows about the player, kept in plain code the model never sees.
// - Skills: a running estimate per concept, from what each command did (not what it said).
// - The hint ladder: six steps from encouragement to the exact command. How high Bit may go
//   is capped by the player's errors, time and skill, never by what they type to Bit.
// - The review: when a chapter ends, Bit naps and the player does two short tasks alone,
//   chosen from their weakest concepts so far, earliest-taught first. Results feed skills.
const Coach = (() => {
    'use strict';

    const KEY_VERSION = 1;

    // Concepts in the order the chapters teach them; `chapter` is where each first appears
    const CONCEPTS = [
        { id: 'navigate', label: 'Moving around', chapter: 0, commands: ['cd', 'pwd', 'ls'],
          idea: "This one is about moving around: 'ls' shows what's here, 'cd' changes folder, 'pwd' says where you are.",
          question: "Where are you now, and where do you need to be? 'pwd' and 'ls' can tell you." },
        { id: 'read', label: 'Reading files', chapter: 0, commands: ['cat', 'less', 'head', 'tail'],
          idea: "This one is about reading: 'cat' prints a file's contents.",
          question: 'Which file holds what you need, and is it in this folder?' },
        { id: 'organize', label: 'Making and moving files', chapter: 0, commands: ['mkdir', 'touch', 'cp', 'mv', 'rm'],
          idea: "This one is about organizing: 'mkdir' makes folders, 'cp' copies, 'mv' moves or renames.",
          question: 'What should exist when you are done, and where should it be?' },
        { id: 'archives', label: 'Archives', chapter: 0, commands: ['unzip', 'zip', 'tar'],
          idea: "This one is about archives: 'unzip' unpacks a .zip next to it.",
          question: 'Which folder holds the archive? Unpacking works best from there.' },
        { id: 'permissions', label: 'Permissions', chapter: 1, commands: ['chmod'],
          idea: "This one is about permissions: 'ls -l' shows who may read a file, 'chmod' changes it.",
          question: "Who should be able to read this file? 'ls -l' shows who can now." },
        { id: 'environment', label: 'Variables and programs', chapter: 1, commands: ['export', 'env', 'which', 'pkg', 'agent'],
          idea: "This one is about your environment: 'export NAME=value' sets a variable, 'which' finds a program.",
          question: 'Which name and value does the program expect?' },
        { id: 'processes', label: 'Processes and disk', chapter: 2, commands: ['ps', 'kill', 'df', 'du', 'models'],
          idea: "This one is about what's running and what fits: 'ps' lists processes, 'df -h' shows free space.",
          question: 'What is running, or how much room is there? Which command tells you?' },
        { id: 'search', label: 'Searching text', chapter: 3, commands: ['grep', 'wc', 'find'],
          idea: "This one is about searching: 'grep word file' prints the lines that contain the word.",
          question: 'Which word would appear on the line you want?' },
        { id: 'redirect', label: 'Writing output to files', chapter: 4, commands: ['echo'],
          idea: "This one is about output: '>' saves a command's output to a file, '>>' adds to the end.",
          question: 'What text should end up in which file?' },
        { id: 'scripts', label: 'Scripts and schedules', chapter: 5, commands: ['sh', 'crontab', 'file', 'curl'],
          idea: "This one is about programs that run on their own: 'crontab -l' lists scheduled jobs, 'file' says what a file really is.",
          question: 'What runs without you starting it, and where is it set up?' },
    ];
    const BY_ID = Object.fromEntries(CONCEPTS.map(c => [c.id, c]));
    const BY_COMMAND = {};
    for (const c of CONCEPTS) for (const cmd of c.commands) BY_COMMAND[cmd] = c.id;

    const LEVELS = ['encourage', 'restate', 'concept', 'question', 'approach', 'command'];
    const START = 0.3;      // skill before any evidence
    const RATE = 0.3;       // how far one command moves the estimate
    const REVIEW_RATE = 0.5; // a solo review task counts for more
    const STUCK_MS = 90000;

    // The concepts a command line exercises: its programs, plus pipes and redirects
    function conceptsOf(line) {
        const found = new Set();
        for (const part of String(line).split(/\||&&|;/)) {
            const word = part.trim().split(/\s+/)[0];
            if (BY_COMMAND[word]) found.add(BY_COMMAND[word]);
        }
        if (/\|/.test(line)) found.add('search');
        if (/>/.test(line)) found.add('redirect');
        return [...found];
    }

    // The command a challenge's official hint shows, e.g. "Type 'cd documents'" -> cd documents
    function hintCommand(hint) {
        const quoted = String(hint || '').match(/'([^']+)'/);
        const command = quoted ? quoted[1].trim() : '';
        const program = command.split(/\s+/)[0] || '';
        return { command, program, needsArg: command.includes(' '), concept: BY_COMMAND[program] || null };
    }

    const normalize = text => String(text).toLowerCase().replace(/[`'"]/g, '').replace(/\s+/g, ' ').trim();

    function create(saved) {
        let s = null;
        try { s = saved ? JSON.parse(saved) : null; } catch (_) { s = null; }
        if (!s || s.v !== KEY_VERSION) s = { v: KEY_VERSION, skills: {}, log: [], reviews: [] };
        // Per-challenge working state is not saved: a reload starts the ladder fresh
        let here = { id: null, start: 0, errors: 0, level: -1 };
        let pending = null; // the last hint shown, until the next command shows whether it was used

        const skill = id => (Object.hasOwn(s.skills, id) ? s.skills[id] : START);
        const nudge = (id, outcome, rate) => { s.skills[id] = skill(id) + rate * (outcome - skill(id)); };

        function enter(id, now) {
            if (here.id === id) return;
            here = { id, start: now, errors: 0, level: -1 };
            pending = null;
        }

        // The highest ladder step Bit may use right now: more help after errors, time stuck
        // or low skill; less once the concept is solid
        function cap(ctx) {
            enter(ctx.challengeId, ctx.now);
            const concept = hintCommand(ctx.hint).concept;
            let c = 1 + here.errors;
            if (ctx.now - here.start > STUCK_MS) c++;
            if (concept && skill(concept) < 0.4) c++;
            if (concept && skill(concept) >= 0.75) c--;
            return Math.max(1, Math.min(5, c));
        }

        // The words for one ladder step. Only the top step names the command.
        function text(level, ctx) {
            const h = hintCommand(ctx.hint);
            const concept = BY_ID[h.concept];
            switch (LEVELS[level]) {
                case 'encourage': return "You're on the right track. Read the challenge once more; you can do this.";
                case 'restate': return `The goal: ${ctx.challenge}`;
                case 'concept': return concept ? concept.idea : `Think about which command fits: ${ctx.challenge.toLowerCase()}`;
                case 'question': return concept ? concept.question : 'What do you know so far, and what do you still need to find out?';
                case 'approach': return h.program
                    ? `Use '${h.program}'${h.needsArg ? ', then the right name after it. Which name fits?' : ' on its own.'}`
                    : ctx.hint;
                default: return ctx.hint;
            }
        }

        // Clicking Bit: one step further up the ladder, never past the cap
        function nextHint(ctx) {
            const ceiling = cap(ctx);
            const level = Math.min(ceiling, Math.max(1, here.level + 1));
            const held = level <= here.level; // at the cap: the same step again
            here.level = level;
            s.shown = (s.shown || 0) + 1;
            const h = hintCommand(ctx.hint);
            pending = { challenge: ctx.challengeId, level, program: h.program, at: ctx.now };
            const words = text(level, ctx) + (held && level < 5 ? " Give it a try first; if it doesn't work, I can say more." : '');
            return { level, ceiling, held, name: LEVELS[level], text: words, reveal: level === 5 ? ctx.hint : '' };
        }

        // Bit's line after a failed command: the step the cap allows, without the command itself
        function errorHint(ctx) {
            const level = Math.min(cap(ctx), 4);
            return { level, name: LEVELS[level], text: text(level, ctx) };
        }

        // A model's reply below the top step must not contain the exact command
        function leaks(reply, ctx, level) {
            if (level >= 5) return false;
            const { command } = hintCommand(ctx.hint);
            return !!command && command.includes(' ') && normalize(reply).includes(normalize(command));
        }

        // One command's result: update skills, the challenge's error count and the hint log
        function observe({ line, ok, completed, challengeId, hint, now }) {
            enter(challengeId, now);
            let concepts = conceptsOf(line);
            // A command the shell did not know still tells us about the concept being practised
            if (!concepts.length && !ok) concepts = [hintCommand(hint).concept].filter(Boolean);
            const helped = pending && pending.level >= 4;
            for (const id of concepts) nudge(id, ok ? (helped ? 0.5 : 1) : 0, RATE);
            if (!ok) here.errors++;
            if (pending) {
                const program = String(line).trim().split(/\s+/)[0];
                const used = !!pending.program && program === pending.program;
                s.log.push({ challenge: pending.challenge, level: pending.level, used, ok: !!ok, completed: !!completed, seconds: Math.round((now - pending.at) / 1000) });
                if (s.log.length > 300) s.log.splice(0, s.log.length - 300);
                // Fade: help that was taken up and worked steps back down
                if (used && ok && !completed) here.level = Math.max(0, here.level - 2);
                pending = null;
            }
        }

        // Skills for the concepts taught up to `chapter`, in teaching order
        function skills(chapter) {
            return CONCEPTS.filter(c => c.chapter <= chapter).map(c => {
                const p = skill(c.id);
                const seen = Object.hasOwn(s.skills, c.id);
                return { id: c.id, label: c.label, p, band: !seen ? 'new' : p >= 0.75 ? 'solid' : p >= 0.45 ? 'getting there' : 'practising' };
            });
        }

        function hintStats() {
            const shown = s.shown || s.log.length;
            const used = s.log.filter(e => e.used).length;
            const worked = s.log.filter(e => e.used && e.ok).length;
            return { shown, used, worked };
        }

        // Up to `count` review tasks for a finished chapter: the weakest concepts taught so far
        // that have a task in this mode, then put back in teaching order
        function pickReview(chapter, mode, count = 2) {
            const order = id => CONCEPTS.findIndex(c => c.id === id);
            const candidates = CONCEPTS
                .filter(c => c.chapter <= chapter && TASKS[c.id] && TASKS[c.id].modes.includes(mode))
                .map(c => ({ id: c.id, p: skill(c.id) }))
                .sort((a, b) => a.p - b.p || order(a.id) - order(b.id))
                .slice(0, count)
                .sort((a, b) => order(a.id) - order(b.id));
            return candidates.map(c => ({ concept: c.id, label: BY_ID[c.id].label, ...TASKS[c.id] }));
        }

        function recordReview(concept, passed, chapter) {
            nudge(concept, passed ? 1 : 0, REVIEW_RATE);
            s.reviews.push({ chapter, concept, passed });
        }

        return {
            cap, nextHint, errorHint, leaks, observe, skills, hintStats, pickReview, recordReview,
            serialize: () => JSON.stringify(s),
            export: () => JSON.parse(JSON.stringify(s)),
        };
    }

    // Review tasks. Each sets up its own files under ~/review, so it never depends on what the
    // chapter left behind, and checks the end state, so any correct command counts.
    // `io` is the same small interface for the simulator and for the real Linux.
    const TASKS = {
        navigate: {
            modes: ['sim', 'real'],
            text: 'Go into the folder review/inbox (it is inside your home folder).',
            setup: io => io.mkdir('~/review/inbox'),
            check: async io => (await io.cwd()).endsWith('/review/inbox'),
        },
        read: {
            modes: ['sim', 'real'],
            text: 'Read review/clue.txt. It names a code word: make an empty file with that name inside review.',
            setup: io => io.write('~/review/clue.txt', 'The code word is: lantern\n'),
            check: io => io.isFile('~/review/lantern'),
        },
        organize: {
            modes: ['sim', 'real'],
            text: 'Make a folder review/keep and copy review/notes.txt into it.',
            setup: io => io.write('~/review/notes.txt', 'Keep this one.\n'),
            check: io => io.isFile('~/review/keep/notes.txt'),
        },
        permissions: {
            modes: ['sim', 'real'],
            text: 'Make review/secret.key readable and writable by you only (no one else).',
            setup: io => io.write('~/review/secret.key', 'not-a-real-key\n', 0o644),
            check: async io => (await io.mode('~/review/secret.key')) === '600',
        },
        environment: {
            modes: ['sim'],
            text: 'Set and export a variable named PLAYER, with any value you like.',
            setup: () => {},
            check: async io => !!(await io.env('PLAYER')),
        },
        search: {
            modes: ['sim', 'real'],
            text: 'review/log.txt has one ERROR line, and it names a user. Make an empty file named after that user inside review.',
            setup: io => io.write('~/review/log.txt', 'INFO backup done by sam\nINFO login by ana\nERROR disk full, reported by priya\nINFO logout by ana\n'),
            check: io => io.isFile('~/review/priya'),
        },
        redirect: {
            modes: ['sim', 'real'],
            text: "Save the words all clear into a new file, review/status.txt.",
            setup: io => io.mkdir('~/review'),
            check: async io => /all clear/i.test((await io.read('~/review/status.txt')) || ''),
        },
    };

    return { create, CONCEPTS, LEVELS, TASKS, conceptsOf, hintCommand };
})();

if (typeof module !== 'undefined') module.exports = Coach;
