// Page controller: connects the terminal window, the sidebar and Bit to the CLIGame engine (engine.js)
document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    const output = $('output');
    const form = $('commandForm');
    const input = $('commandInput');
    const prompt = $('prompt');
    const addressPath = $('addressPath');
    const cwdPath = $('cwdPath');
    const statusChallenge = $('statusChallenge');
    const stepCount = $('stepCount');
    const progressBar = $('progressBar');
    const chapterLabel = $('chapterLabel');
    const challengeText = $('currentChallenge');
    const hintText = $('challengeHint');
    const lessonList = $('lessonList');
    const skillList = $('skillList');
    const hintSummary = $('hintSummary');
    const chapterList = $('chapterList');
    const commandGroups = $('commandGroups');
    const terminalWindow = $('terminalWindow');
    const expandButton = $('expandButton');
    const bitToggle = $('bitToggle');
    const realToggle = $('realToggle');

    const SAVE_KEY = 'cli-adventures-save-v2';
    const BIT_KEY = 'cli-adventures-bit';
    const MODE_KEY = 'cli-adventures-mode';
    const COACH_KEY = 'cli-adventures-coach-v1';
    const ANSI_CLASSES = { '31': 'ansi-err', '32': 'ansi-ok', '33': 'ansi-warn', '34': 'ansi-dir', '35': 'ansi-file', '36': 'ansi-agent', '90': 'ansi-dim' };
    const PLACEHOLDERS = new Set(['file', 'dir', 'path', 'src', 'dst', 'program', 'word', 'PID', 'URL', 'NAME=value', 'file.zip', 'script.sh', 'command']);

    // Storage can be missing or blocked (private windows, previews); the game still runs
    const storage = {
        get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
        set(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* not saved */ } },
        remove(key) { try { localStorage.removeItem(key); } catch (_) { /* nothing to clear */ } },
    };

    const welcomeTemplate = output.querySelector('.welcome').cloneNode(true);
    let game = CLIGame.load(storage.get(SAVE_KEY));
    const resumed = !!game;
    if (!game) game = new CLIGame();
    const commandHistory = [];
    let historyIndex = 0;
    let lastTabValue = null;
    let lastReached = -1;
    let llmOff = false;
    // Real terminal: Linux in the browser (realterm.js), playing realchapters.js
    let real = null;
    let realMode = false;
    let booting = false;
    // What the game knows about the player (coach.js): skills, the hint ladder, the review
    const coach = Coach.create(storage.get(COACH_KEY));
    const saveCoach = () => storage.set(COACH_KEY, coach.serialize());
    let review = null;
    const view = () => (realMode ? real : game);

    // ---------- Rendering ----------

    // Turn text with ANSI colour codes into DOM nodes (never HTML, since it can echo user input)
    function renderAnsi(text) {
        const fragment = document.createDocumentFragment();
        let className = '';
        text = text.replace(/\u001b\[[0-9;?]*[A-La-ln-z]|\u001b[()][A-Z0-9]|\r/g, '');
        text.split(/\u001b\[([\d;]*)m/).forEach((part, i) => {
            if (i % 2) {
                const codes = part.split(';').filter(c => ANSI_CLASSES[c]);
                className = codes.length ? ANSI_CLASSES[codes[codes.length - 1]] : '';
            } else if (part && className) {
                const span = document.createElement('span');
                span.className = className;
                span.textContent = part;
                fragment.append(span);
            } else if (part) {
                fragment.append(part);
            }
        });
        return fragment;
    }

    // Plain text with 'quoted' words shown as code
    function renderQuoted(text) {
        const fragment = document.createDocumentFragment();
        text.split(/(?<=^|[\s(])'([^'\n]+?)'(?=[\s.,;:!?)]|$)/).forEach((part, i) => {
            if (i % 2) {
                const code = document.createElement('code');
                code.textContent = part;
                fragment.append(code);
            } else if (part) {
                fragment.append(part);
            }
        });
        return fragment;
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function print(content, className) {
        const line = element('div', className ? `line ${className}` : 'line');
        line.append(typeof content === 'string' ? renderAnsi(content) : content);
        output.append(line);
        return line;
    }

    function echo(command) {
        const line = document.createDocumentFragment();
        line.append(element('span', view().pending ? 'prompt is-approval' : 'prompt', view().promptText()), command);
        print(line, 'line-cmd');
    }

    function chapterIntro(started) {
        const box = element('div', 'line line-chapter');
        box.append(
            element('p', 'chapter-heading', `Chapter ${started.index + 1} · ${started.title}`),
            element('p', '', started.intro),
        );
        const first = element('p', 'chapter-first');
        first.append('First: ', renderQuoted(game.currentChallenge().text));
        box.append(first);
        output.append(box);
    }

    function scrollToEnd() {
        output.scrollTop = output.scrollHeight;
    }

    // ---------- Model calls (through the Worker; null means "use the scripted line") ----------

    async function llm(payload) {
        if (llmOff) return null;
        try {
            const res = await fetch('/api/llm', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(14000),
            });
            if ([404, 405, 501, 503].includes(res.status)) { llmOff = true; return null; }
            if (!res.ok) return null;
            const data = await res.json();
            return typeof data.text === 'string' && data.text.trim() ? data.text.trim() : null;
        } catch (_) {
            return null;
        }
    }

    function context() {
        const c = view().currentChallenge();
        return { chapter: c.chapter, challenge: c.text, hint: c.hint, cwd: view().getPath(), challengeId: `${realMode ? 'real' : ''}${c.chapterIndex}:${c.id || 'done'}` };
    }

    const coachContext = () => ({ ...context(), now: Date.now() });
    const ladder = {
        next: () => coach.nextHint(coachContext()),
        onError: () => coach.errorHint(coachContext()),
        leaks: (reply, level) => coach.leaks(reply, coachContext(), level),
    };

    const bit = BitSprite.create({
        root: $('sprite'),
        button: $('spriteButton'),
        bubble: $('bubble'),
        text: $('bubbleText'),
        live: $('bitLive'),
        closeButton: $('bubbleClose'),
        canvas: $('confetti'),
        ask: llm,
        ladder,
        context,
        onLayout: () => scrollToEnd(),
    });

    async function runAgent(effect) {
        const label = () => element('span', 'ansi-agent', 'agent › ');
        const line = print('', 'line-agent is-thinking');
        line.append(label(), 'thinking…');
        scrollToEnd();
        const reply = await llm({ kind: 'agent', ...effect.payload });
        line.classList.remove('is-thinking');
        line.replaceChildren(label(), reply || effect.fallback);
        if (!reply) line.append(element('span', 'ansi-dim', '  (scripted reply: the model is not connected)'));
        if (effect.sources) {
            const sources = element('div', 'line');
            sources.append(renderAnsi(effect.sources));
            line.after(sources);
        }
        scrollToEnd();
    }

    // ---------- Game state -> page ----------

    function updateLocation() {
        const g = view();
        prompt.textContent = g.promptText();
        prompt.classList.toggle('is-approval', !!g.pending);
        input.setAttribute('aria-label', g.pending ? 'Answer y or n' : realMode ? 'Command for real Linux' : 'Command');
        cwdPath.textContent = g.getPath();
        addressPath.textContent = g.cwd();
    }

    function updateChallenge() {
        if (review) {
            const t = review.tasks[review.i];
            chapterLabel.textContent = `Review · ${t.label} · Bit is napping`;
            stepCount.textContent = `${review.i + 1} of ${review.tasks.length}`;
            progressBar.max = review.tasks.length;
            progressBar.value = review.i;
            progressBar.textContent = `${review.i} of ${review.tasks.length}`;
            challengeText.textContent = t.text;
            hintText.textContent = "No hints in the review: it shows what stuck. Type skip to skip it.";
            statusChallenge.textContent = `Review ${review.i + 1}/${review.tasks.length}: ${t.text}`;
            return;
        }
        const c = view().currentChallenge();
        chapterLabel.textContent = `Chapter ${c.chapterIndex + 1} of ${c.chapters} · ${c.chapter}`;
        stepCount.textContent = c.done ? 'all done' : `${c.index + 1} of ${c.total}`;
        progressBar.max = c.total;
        progressBar.value = c.index;
        progressBar.textContent = `${c.index} of ${c.total}`;
        challengeText.textContent = c.text;
        hintText.replaceChildren(renderQuoted(c.hint || ''));
        statusChallenge.textContent = (realMode ? 'Real Linux · ' : '') + (c.done ? (realMode ? 'Chapter 1 complete' : 'Every adventure complete') : `Ch ${c.chapterIndex + 1} · ${c.index + 1}/${c.total}: ${c.text}`);
    }

    // The real terminal covers Chapter 1 so far; the others stay in the simulator
    function realChapterList() {
        const c = real.currentChallenge();
        return game.chapterList().map((ch, i) => i === c.chapterIndex
            ? { ...ch, status: 'current', challenges: ch.challenges.map((x, j) => ({ ...x, state: j < c.index ? 'done' : j === c.index ? 'current' : 'todo' })) }
            : { ...ch, status: 'locked', realOnly: true });
    }

    function renderChapters() {
        const chapters = realMode ? realChapterList() : game.chapterList();
        chapterList.replaceChildren(...chapters.map(ch => {
            const item = element('li');
            const button = element('button', `chapter-button is-${ch.status}`);
            button.type = 'button';
            button.dataset.chapter = ch.index;
            button.disabled = ch.status === 'locked';
            if (ch.status === 'current') button.setAttribute('aria-current', 'step');
            const finished = ch.status === 'current' && view().currentChallenge().done;
            const state = ch.realOnly ? 'simulator only' : finished ? 'completed' : { done: 'completed', current: 'playing now', open: 'open', locked: 'locked' }[ch.status];
            const words = element('span', 'chapter-text');
            words.append(element('span', 'chapter-title', ch.title), element('span', 'chapter-blurb', ch.blurb));
            button.append(element('span', 'chapter-num', String(ch.index + 1)), words, element('span', 'chapter-state', state));
            item.append(button);
            return item;
        }));
        const current = chapters.find(ch => ch.status === 'current');
        lessonList.replaceChildren(...current.challenges.map(ch => {
            const item = element('li', `is-${ch.state}`);
            if (ch.state === 'current') item.setAttribute('aria-current', 'step');
            const label = element('span');
            label.append(renderQuoted(ch.text));
            if (ch.state !== 'todo') label.append(element('span', 'visually-hidden', ch.state === 'done' ? ' (completed)' : ' (current)'));
            item.append(label);
            return item;
        }));
    }

    function usage(text) {
        const code = element('code');
        text.split(' ').forEach((token, i) => {
            if (i) code.append(' ');
            code.append(i && PLACEHOLDERS.has(token) ? element('var', '', token) : token);
        });
        return code;
    }

    function renderReference() {
        const groups = game.reference();
        if (groups[0].index === lastReached) return;
        lastReached = groups[0].index;
        commandGroups.replaceChildren(...groups.map(group => {
            const section = element('div', 'command-group');
            const list = element('ul', 'command-list');
            for (const command of group.commands) {
                const button = element('button');
                button.type = 'button';
                button.dataset.insert = command.insert;
                button.append(usage(command.usage), element('span', '', command.desc));
                const item = element('li');
                item.append(button);
                list.append(item);
            }
            section.append(element('p', 'command-group-title', `Chapter ${group.index + 1} · ${group.chapter}`), list);
            return section;
        }));
    }

    function refresh() {
        updateLocation();
        updateChallenge();
        renderChapters();
        renderReference();
        renderSkills();
    }

    // Skills for the concepts taught so far, in teaching order, and how hints were used
    function renderSkills() {
        const chapter = realMode ? 0 : game.reached();
        skillList.replaceChildren(...coach.skills(chapter).map(k => {
            const item = element('li', 'skill');
            const meter = document.createElement('meter');
            meter.min = 0; meter.max = 1; meter.low = 0.45; meter.high = 0.75; meter.optimum = 1; meter.value = k.p;
            meter.setAttribute('aria-label', `${k.label}: ${k.band}`);
            item.append(element('span', 'skill-label', k.label), meter, element('span', 'skill-band', k.band));
            return item;
        }));
        const h = coach.hintStats();
        hintSummary.textContent = h.shown ? `Hints: ${h.shown} shown, ${h.used} acted on, ${h.worked} worked.` : 'No hints used yet.';
    }

    // Track one command's result: skills, the challenge's errors, and whether a hint was used
    function observe(before, command, ok, completed) {
        coach.observe({ line: command, ok, completed, challengeId: before.challengeId, hint: before.hint, now: Date.now() });
        saveCoach();
    }

    // ---------- Review: Bit naps, the player tries two tasks alone ----------

    // The same small file interface for the simulator and the real Linux
    function simIO() {
        const { dir, file } = CLIGame.nodes;
        return {
            mkdir: p => { if (!game.isDir(p)) game.put(p, dir(), true); },
            write: (p, text, mode) => { game.put(p, file(text, mode ? { mode } : {}), true); },
            isFile: p => game.isFile(p),
            read: p => game.read(p),
            mode: p => { const n = game.get(p); return n ? (n.mode & 0o777).toString(8) : ''; },
            env: name => game.s.env[name] || '',
            cwd: () => game.cwd(),
        };
    }

    function realIO() {
        const b = real.backend;
        const at = p => p.replace(/^~/, '"$HOME"');
        return {
            mkdir: p => b.script(`mkdir -p ${at(p)}`),
            write: (p, text, mode) => b.script(`mkdir -p "$(dirname ${at(p)})" && printf %s ${RealTerminal.toBase64(text)} | base64 -d > ${at(p)}${mode ? ` && chmod ${mode.toString(8)} ${at(p)}` : ''}`),
            isFile: p => b.probe(`test -f ${at(p)}`),
            read: async p => (await b.script(`cat ${at(p)} 2>/dev/null`)).stdout,
            mode: async p => (await b.script(`stat -c %a ${at(p)} 2>/dev/null`)).stdout.trim(),
            env: async () => '',
            cwd: () => real.cwd(),
        };
    }

    async function startReview(chapter, then) {
        const tasks = coach.pickReview(chapter, realMode ? 'real' : 'sim');
        if (!tasks.length) { then(); return; }
        const io = realMode ? realIO() : simIO();
        for (const t of tasks) await t.setup(io);
        review = { tasks, i: 0, io, then, chapter };
        bit.setAsleep(true);
        print(`Bit is taking a nap. Before the next chapter, ${tasks.length === 1 ? 'one quick task' : `${tasks.length} quick tasks`} on your own, with no hints: they show what stuck. Type skip to skip.`, 'is-review');
        print(`Review 1: ${tasks[0].text}`, 'is-review-task');
        refresh();
        scrollToEnd();
    }

    async function checkReview() {
        const t = review.tasks[review.i];
        if (!(await t.check(review.io))) return;
        coach.recordReview(t.concept, true, review.chapter);
        saveCoach();
        print(`✓ Review task done: ${t.label}`, 'is-win');
        review.i++;
        if (review.i < review.tasks.length) print(`Review ${review.i + 1}: ${review.tasks[review.i].text}`, 'is-review-task');
        else endReview(false);
    }

    function endReview(skipped) {
        const { then } = review;
        review = null;
        bit.setAsleep(false);
        if (skipped) print('Review skipped. It will be there at the end of the next chapter.', 'is-note');
        else {
            print('Review done, all on your own.', 'is-chapter-done');
            bit.say('*yawn* I\'m awake! You did those without me. Nice!', { mood: 'happy', hold: 6000 });
            bit.confetti(false);
        }
        then();
        refresh();
        scrollToEnd();
    }

    function save() {
        if (!realMode) storage.set(SAVE_KEY, game.serialize());
    }

    // ---------- Commands ----------

    async function runReal(command) {
        const before = context();
        echo(command);
        scrollToEnd();
        input.setAttribute('aria-busy', 'true');
        let r;
        try {
            r = await real.run(command);
        } catch (err) {
            print(`\u001b[31m${err.message}\u001b[0m`, 'is-error');
            input.removeAttribute('aria-busy');
            return;
        }
        input.removeAttribute('aria-busy');
        if (/^\s*(clear|reset)\s*$/.test(command)) output.replaceChildren();
        else {
            if (r.stdout.trim()) print(r.stdout.replace(/\n+$/, ''));
            if (r.stderr.trim()) print(r.stderr.replace(/\n+$/, ''), 'is-error');
        }
        for (const c of r.completed) print(`✓ Challenge completed: ${c.text}`, 'is-win');
        const chapterComplete = r.done && r.completed.length ? { title: real.currentChallenge().chapter, outro: 'You did it on a real Linux. Every command was the real thing.' } : null;
        observe(before, command, r.code === 0, r.completed.length > 0);
        if (chapterComplete) {
            print(`★ Chapter complete: ${chapterComplete.title}. ${chapterComplete.outro}`, 'is-chapter-done');
            setTimeout(() => startReview(0, handOff), 2500);
        }
        else if (r.completed.length) print(`Next: ${real.currentChallenge().text}`, 'is-note');
        bit.react({
            completed: r.completed, chapterComplete, gameComplete: false, prompt: null,
            error: r.code === 0 ? null : { cmd: command.trim().split(/\s+/)[0], code: 'real', message: r.stderr },
            output: r.stdout + r.stderr, events: [{ meta: {} }],
        }, command);
        if (review) await checkReview();
        refresh();
        scrollToEnd();
    }

    async function run(command) {
        if (review && /^skip$/i.test(command.trim())) {
            echo(command);
            endReview(true);
            return;
        }
        if (realMode) return runReal(command);
        const before = context();
        echo(command);
        const r = game.run(command);
        observe(before, command, !r.error, r.completed.length > 0);
        if (r.clear) output.replaceChildren();
        if (r.output) print(r.output);
        for (const c of r.completed) print(`✓ Challenge completed: ${c.text}`, 'is-win');
        if (r.chapterComplete) print(`★ Chapter complete: ${r.chapterComplete.title}. ${r.chapterComplete.outro}`, 'is-chapter-done');
        if (r.gameComplete) print('★ ★ ★  Every adventure is complete. Thanks for playing, agent.', 'is-chapter-done');
        // A finished chapter ends with the review; the next chapter's intro waits for it
        if (r.chapterComplete) {
            const started = r.chapterStarted;
            setTimeout(() => startReview(r.chapterComplete.index, () => { if (started) chapterIntro(started); }), 1500);
        } else if (r.chapterStarted) chapterIntro(r.chapterStarted);
        else if (r.completed.length && !r.gameComplete) print(`Next: ${game.currentChallenge().text}`, 'is-note');
        for (const effect of r.effects) if (effect.type === 'llm') runAgent(effect);
        bit.react(r, command);
        if (review) await checkReview();
        refresh();
        save();
        scrollToEnd();
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const command = input.value.trim();
        input.value = '';
        if (!command) return;
        if (booting) {
            input.value = command;
            print('Linux is still starting. Your command will be ready to send in a moment.', 'is-note');
            scrollToEnd();
            return;
        }
        if (!game.pending) {
            commandHistory.push(command);
            historyIndex = commandHistory.length;
        }
        run(command);
    });

    // Complete the word before the caret. Returns true when Tab was used up;
    // otherwise Tab keeps its usual job of moving focus.
    function complete() {
        const value = input.value;
        if (realMode || !value.trim() || game.pending || input.selectionStart !== value.length) return false;
        const { value: next, options } = game.complete(value);
        if (next.length > value.length) {
            input.value = next;
            return true;
        }
        // Ambiguous: list the options once, like a shell's double Tab
        if (options.length > 1 && lastTabValue !== value) {
            print(options.join('  '), 'is-note');
            scrollToEnd();
            lastTabValue = value;
            return true;
        }
        return false;
    }

    input.addEventListener('keydown', (e) => {
        const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
        if (e.key === 'Tab' && plain && !e.shiftKey) {
            if (complete()) e.preventDefault();
        } else if (e.key === 'ArrowUp' && plain) {
            if (historyIndex > 0) {
                historyIndex--;
                input.value = commandHistory[historyIndex];
            }
            e.preventDefault();
        } else if (e.key === 'ArrowDown' && plain) {
            historyIndex = Math.min(historyIndex + 1, commandHistory.length);
            input.value = commandHistory[historyIndex] || '';
            e.preventDefault();
        } else if (e.key.toLowerCase() === 'l' && e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            output.replaceChildren();
        } else if (e.key === 'Escape' && !terminalWindow.classList.contains('is-expanded')) {
            input.value = '';
        }
        if (e.key !== 'Tab') lastTabValue = null;
        bit.activity(() => !input.value);
    });

    // Clicking the terminal focuses the prompt, unless the player is selecting text or using Bit
    $('terminal').addEventListener('click', (e) => {
        if (window.getSelection().toString() || e.target.closest('a, button, input, .bubble')) return;
        input.focus({ preventScroll: true });
    });

    // Pasting anywhere outside a field goes to the prompt
    document.addEventListener('paste', (e) => {
        if (e.target.closest && e.target.closest('input, textarea')) return;
        const text = (e.clipboardData || window.clipboardData).getData('text');
        if (!text) return;
        e.preventDefault();
        input.value = text.trim();
        input.focus();
    });

    // Reference buttons place a command at the prompt without running it
    commandGroups.addEventListener('click', (e) => {
        const button = e.target.closest('[data-insert]');
        if (!button) return;
        input.value = button.dataset.insert;
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
    });

    // ---------- Chapters and saves ----------

    chapterList.addEventListener('click', (e) => {
        const button = e.target.closest('[data-chapter]');
        if (!button || button.disabled || realMode) return;
        const index = Number(button.dataset.chapter);
        const current = game.currentChallenge();
        if (index === current.chapterIndex && !current.done) return;
        if (current.index > 0 && !current.done && !window.confirm(`Leave "${current.chapter}"? Your progress in this chapter will reset.`)) return;
        const started = game.startChapter(index, { fresh: true });
        output.replaceChildren();
        chapterIntro(started);
        refresh();
        save();
        bit.say(`Chapter ${index + 1}: ${started.title}. Let's go!`, { mood: 'happy', hold: 5000 });
        input.focus();
    });

    $('startOver').addEventListener('click', () => {
        if (!window.confirm('Start over from Chapter 1? This clears your saved progress.')) return;
        storage.remove(SAVE_KEY);
        game = new CLIGame();
        lastReached = -1;
        output.replaceChildren(welcomeTemplate.cloneNode(true));
        refresh();
        input.focus();
    });

    // Chapter 1 plays on a real Linux by default. Chapters 2–6 need the simulator, and a
    // player who switched to the simulator, or who asked the browser to save data, stays there.
    function realByDefault() {
        const c = game.currentChallenge();
        const saveData = navigator.connection && navigator.connection.saveData;
        return storage.get(MODE_KEY) !== 'sim' && c.chapterIndex === 0 && !c.done && !saveData && typeof WebAssembly === 'object';
    }

    function leaveReal(note) {
        realMode = false;
        realToggle.setAttribute('aria-pressed', 'false');
        if (note) print(note, 'is-note');
        refresh();
        scrollToEnd();
    }

    async function enterReal({ auto = false } = {}) {
        realToggle.setAttribute('aria-pressed', 'true');
        realToggle.disabled = true;
        booting = true;
        if (!auto) output.replaceChildren();
        if (!real) print('Starting a real Linux inside your browser (about 11 MB the first time)…', 'is-note');
        try {
            if (!real) {
                const backend = new RealTerminal.V86Backend();
                const { seconds } = await backend.boot();
                real = new RealChapters.Game(backend, CLIGame.CHAPTERS);
                await real.start();
                print(`Linux is up in ${seconds.toFixed(1)} s. Everything you type runs in a real bash, on a real Linux kernel, in this tab.`, 'is-note');
            }
            realMode = true;
            chapterIntro({ index: 0, title: real.currentChallenge().chapter, intro: 'Same mission, real machine: the files, errors and output are all genuine.' });
            if (!auto) bit.say("We're on a real Linux now! Same mission, real commands.", { mood: 'happy', hold: 6000 });
        } catch (err) {
            realToggle.setAttribute('aria-pressed', 'false');
            print(`\u001b[31mThe real Linux could not start (${err.message}), so you're in the simulator.\u001b[0m`, 'is-error');
        }
        booting = false;
        realToggle.disabled = false;
        refresh();
        scrollToEnd();
    }

    // Chapter 1 done on real Linux: Chapter 2 picks up in the simulator
    function handOff() {
        const started = game.startChapter(1, { fresh: true });
        game.s.done[CLIGame.CHAPTERS[0].id] = true;
        save();
        leaveReal();
        print('The next chapters use the simulator, which plays the AI agent and its tools.', 'is-note');
        chapterIntro(started);
        refresh();
        scrollToEnd();
    }

    realToggle.addEventListener('click', () => {
        if (booting) return;
        if (realMode) {
            storage.set(MODE_KEY, 'sim');
            leaveReal('Back in the simulator. Your real Linux keeps running in the background.');
        } else {
            storage.remove(MODE_KEY);
            enterReal();
        }
        input.focus();
    });

    function setBit(on) {
        bitToggle.checked = on;
        bit.setEnabled(on);
        storage.set(BIT_KEY, on ? 'on' : 'off');
    }
    bitToggle.addEventListener('change', () => setBit(bitToggle.checked));

    // ---------- Expand / restore the window ----------

    function setExpanded(expanded) {
        terminalWindow.classList.toggle('is-expanded', expanded);
        document.body.classList.toggle('has-expanded-window', expanded);
        expandButton.setAttribute('aria-pressed', String(expanded));
        expandButton.title = expanded ? 'Restore terminal (Esc)' : 'Expand terminal';
        input.focus({ preventScroll: true });
        scrollToEnd();
    }

    expandButton.addEventListener('click', () => {
        setExpanded(!terminalWindow.classList.contains('is-expanded'));
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && terminalWindow.classList.contains('is-expanded')) {
            setExpanded(false);
        }
    });

    // ---------- Start ----------

    if (resumed) {
        const c = game.currentChallenge();
        output.replaceChildren(welcomeTemplate.cloneNode(true));
        output.querySelector('.welcome p').textContent = 'Welcome back, agent. Your progress was saved in this browser.';
        chapterIntro({ index: c.chapterIndex, title: c.chapter, intro: c.done ? 'Every adventure is complete. Replay any chapter from the sidebar.' : 'Picking up where you left off.' });
    }
    refresh();
    setBit(storage.get(BIT_KEY) !== 'off');
    const greeting = setTimeout(() => {
        bit.say(resumed ? 'Welcome back! Click me any time for a hint.' : "Hi, I'm Bit! Click me any time you'd like a hint.", { mood: 'happy', hold: 6000 });
    }, 900);
    form.addEventListener('submit', () => clearTimeout(greeting), { once: true });
    $('spriteButton').addEventListener('click', () => clearTimeout(greeting), { once: true });
    if (realByDefault()) enterReal({ auto: true });
    // Jump straight to the prompt where a keyboard is likely; on touch screens wait for a tap
    if (window.matchMedia('(pointer: fine)').matches) {
        input.focus({ preventScroll: true });
    }
});
