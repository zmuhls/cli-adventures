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
    const chapterList = $('chapterList');
    const commandGroups = $('commandGroups');
    const terminalWindow = $('terminalWindow');
    const expandButton = $('expandButton');
    const bitToggle = $('bitToggle');
    const realToggle = $('realToggle');

    const SAVE_KEY = 'cli-adventures-save-v2';
    const BIT_KEY = 'cli-adventures-bit';
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

    const bit = BitSprite.create({
        root: $('sprite'),
        button: $('spriteButton'),
        bubble: $('bubble'),
        text: $('bubbleText'),
        live: $('bitLive'),
        closeButton: $('bubbleClose'),
        canvas: $('confetti'),
        ask: llm,
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
    }

    function save() {
        if (!realMode) storage.set(SAVE_KEY, game.serialize());
    }

    // ---------- Commands ----------

    async function runReal(command) {
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
        for (const c of r.completed) print(`🎉 Challenge completed: ${c.text}`, 'is-win');
        const chapterComplete = r.done && r.completed.length ? { title: real.currentChallenge().chapter, outro: 'You did it on a real Linux. Every command was the real thing.' } : null;
        if (chapterComplete) print(`★ Chapter complete: ${chapterComplete.title}. ${chapterComplete.outro}`, 'is-chapter-done');
        else if (r.completed.length) print(`Next: ${real.currentChallenge().text}`, 'is-note');
        bit.react({
            completed: r.completed, chapterComplete, gameComplete: false, prompt: null,
            error: r.code === 0 ? null : { cmd: command.trim().split(/\s+/)[0], code: 'real', message: r.stderr },
            output: r.stdout + r.stderr, events: [{ meta: {} }],
        }, command);
        refresh();
        scrollToEnd();
    }

    function run(command) {
        if (realMode) return runReal(command);
        echo(command);
        const r = game.run(command);
        if (r.clear) output.replaceChildren();
        if (r.output) print(r.output);
        for (const c of r.completed) print(`🎉 Challenge completed: ${c.text}`, 'is-win');
        if (r.chapterComplete) print(`★ Chapter complete: ${r.chapterComplete.title}. ${r.chapterComplete.outro}`, 'is-chapter-done');
        if (r.gameComplete) print('★ ★ ★  Every adventure is complete. Thanks for playing, agent.', 'is-chapter-done');
        if (r.chapterStarted) chapterIntro(r.chapterStarted);
        else if (r.completed.length && !r.gameComplete) print(`Next: ${game.currentChallenge().text}`, 'is-note');
        for (const effect of r.effects) if (effect.type === 'llm') runAgent(effect);
        bit.react(r, command);
        refresh();
        save();
        scrollToEnd();
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const command = input.value.trim();
        input.value = '';
        if (!command) return;
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

    realToggle.addEventListener('click', async () => {
        if (realMode) {
            realMode = false;
            realToggle.setAttribute('aria-pressed', 'false');
            print('Back in the simulator. Your real Linux keeps running in the background.', 'is-note');
            refresh();
            scrollToEnd();
            input.focus();
            return;
        }
        realToggle.setAttribute('aria-pressed', 'true');
        realToggle.disabled = true;
        output.replaceChildren();
        print('Starting a real Linux inside your browser. The first time downloads about 11 MB…', 'is-note');
        try {
            if (!real) {
                const backend = new RealTerminal.V86Backend();
                const { seconds } = await backend.boot();
                real = new RealChapters.Game(backend, CLIGame.CHAPTERS);
                await real.start();
                print(`Linux is up (${seconds.toFixed(1)} s). Everything you type now runs in a real bash on a real Linux kernel, right here in the tab.`, 'is-note');
            }
            realMode = true;
            chapterIntro({ index: 0, title: real.currentChallenge().chapter, intro: 'Same mission, real machine: the files, errors and output are all genuine.' });
            bit.say("We're on a real Linux now! Same mission, real commands.", { mood: 'happy', hold: 6000 });
        } catch (err) {
            realToggle.setAttribute('aria-pressed', 'false');
            print(`\u001b[31mThe real terminal could not start: ${err.message}\u001b[0m`, 'is-error');
        }
        realToggle.disabled = false;
        refresh();
        scrollToEnd();
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
    // Jump straight to the prompt where a keyboard is likely; on touch screens wait for a tap
    if (window.matchMedia('(pointer: fine)').matches) {
        input.focus({ preventScroll: true });
    }
});
