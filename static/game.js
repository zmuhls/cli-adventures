// Page controller: connects the terminal window and sidebar to the CLIGame engine (engine.js)
document.addEventListener('DOMContentLoaded', () => {
    const output = document.getElementById('output');
    const form = document.getElementById('commandForm');
    const input = document.getElementById('commandInput');
    const promptPath = document.getElementById('promptPath');
    const addressPath = document.getElementById('addressPath');
    const cwdPath = document.getElementById('cwdPath');
    const statusChallenge = document.getElementById('statusChallenge');
    const stepCount = document.getElementById('stepCount');
    const progressBar = document.getElementById('progressBar');
    const challengeText = document.getElementById('currentChallenge');
    const hintText = document.getElementById('challengeHint');
    const lessonList = document.getElementById('lessonList');
    const terminalWindow = document.getElementById('terminalWindow');
    const expandButton = document.getElementById('expandButton');

    const COMMANDS = ['cat', 'cd', 'clear', 'cp', 'exit', 'help', 'ls', 'mkdir', 'mv', 'pwd', 'reset', 'rm', 'touch', 'unzip'];
    const CLEAR_SCREEN = '\u001b[2J\u001b[H';
    const ANSI_CLASSES = { '31': 'ansi-err', '32': 'ansi-ok', '34': 'ansi-dir' };

    const game = new CLIGame();
    const commandHistory = [];
    let historyIndex = 0;
    let lastTabValue = null;

    // ---------- Rendering ----------

    // Turn text with ANSI colour codes into DOM nodes (never HTML, since it can echo user input)
    function renderAnsi(text) {
        const fragment = document.createDocumentFragment();
        let className = '';
        text.split(/\u001b\[(\d+)m/).forEach((part, i) => {
            if (i % 2) {
                className = ANSI_CLASSES[part] || '';
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
        text.split(/'([^']+)'/).forEach((part, i) => {
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

    function print(content, className) {
        const line = document.createElement('div');
        line.className = className ? `line ${className}` : 'line';
        line.append(typeof content === 'string' ? renderAnsi(content) : content);
        output.append(line);
    }

    function echo(command) {
        const prompt = document.createElement('span');
        prompt.className = 'prompt';
        prompt.textContent = `${game.getPath()} $`;
        const line = document.createDocumentFragment();
        line.append(prompt, command);
        print(line, 'line-cmd');
    }

    function scrollToEnd() {
        output.scrollTop = output.scrollHeight;
    }

    // ---------- Game state -> page ----------

    function updateLocation() {
        const path = game.getPath();
        promptPath.textContent = path;
        cwdPath.textContent = path;
        addressPath.textContent = '/home/fsociety' + path.slice(1);
    }

    function updateChallenge() {
        const total = game.lessons.length;
        const done = game.completed_lessons.size;
        const current = game.getCurrentChallenge();
        const finished = done >= total;

        stepCount.textContent = finished ? `${total} of ${total}` : `${done + 1} of ${total}`;
        progressBar.max = total;
        progressBar.value = done;
        progressBar.textContent = `${done} of ${total}`;
        challengeText.textContent = current.challenge;
        hintText.replaceChildren(renderQuoted(current.hint || ''));
        statusChallenge.textContent = finished
            ? 'All challenges complete'
            : `Challenge ${done + 1} of ${total}: ${current.challenge}`;

        lessonList.replaceChildren(...game.lessons.map(lesson => {
            const item = document.createElement('li');
            const state = game.completed_lessons.has(lesson.id) ? 'done' : lesson === current ? 'current' : 'todo';
            item.className = `is-${state}`;
            if (state === 'current') item.setAttribute('aria-current', 'step');
            const label = document.createElement('span');
            label.append(renderQuoted(lesson.challenge));
            if (state !== 'todo') {
                const status = document.createElement('span');
                status.className = 'visually-hidden';
                status.textContent = state === 'done' ? ' (completed)' : ' (current)';
                label.append(status);
            }
            item.append(label);
            return item;
        }));
    }

    // ---------- Commands ----------

    function run(command) {
        echo(command);
        const before = game.completed_lessons.size;
        let text = game.processCommand(command).result;

        if (text.includes(CLEAR_SCREEN)) {
            output.replaceChildren();
            text = text.slice(text.indexOf(CLEAR_SCREEN) + CLEAR_SCREEN.length);
        }

        // Completion messages lead the result, one per line
        while (text.startsWith('🎉 Challenge completed')) {
            const end = text.indexOf('\n');
            print(end < 0 ? text : text.slice(0, end), 'is-win');
            text = end < 0 ? '' : text.slice(end + 1);
        }
        if (text) {
            print(text, /^error:/i.test(text) ? 'is-error' : '');
        }
        if (game.completed_lessons.size > before) {
            const next = game.getCurrentChallenge();
            print(game.completed_lessons.size < game.lessons.length
                ? `Next: ${next.challenge}`
                : 'Every challenge is done. Keep exploring, or type reset to play again.', 'is-note');
        }

        updateLocation();
        updateChallenge();
        scrollToEnd();
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const command = input.value.trim();
        input.value = '';
        if (!command) return;
        commandHistory.push(command);
        historyIndex = commandHistory.length;
        run(command);
    });

    // Complete the word before the caret. Returns true when Tab was used up;
    // otherwise Tab keeps its usual job of moving focus.
    function complete() {
        const value = input.value;
        if (!value.trim() || input.selectionStart !== value.length) return false;
        const word = value.match(/\S*$/)[0];
        if (word.includes('/')) return false;

        const firstWord = !/\S\s/.test(value);
        const { files, dirs } = game.listing();
        const candidates = firstWord ? COMMANDS : [...dirs.map(dir => dir + '/'), ...files];
        const matches = candidates.filter(name => name.startsWith(word));
        if (!matches.length) return false;

        let prefix = matches[0];
        for (const match of matches) {
            while (!match.startsWith(prefix)) prefix = prefix.slice(0, -1);
        }
        if (matches.length === 1 && !prefix.endsWith('/')) prefix += ' ';

        if (prefix.length > word.length) {
            input.value = value.slice(0, value.length - word.length) + prefix;
            return true;
        }
        // Ambiguous: list the options once, like a shell's double Tab
        if (lastTabValue !== value) {
            print(matches.join('  '), 'is-note');
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
    });

    // Clicking the terminal focuses the prompt, unless the player is selecting text
    document.getElementById('terminal').addEventListener('click', (e) => {
        if (window.getSelection().toString() || e.target.closest('a, button, input')) return;
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
    document.querySelectorAll('[data-insert]').forEach(button => {
        button.addEventListener('click', () => {
            input.value = button.dataset.insert;
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
        });
    });

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

    updateLocation();
    updateChallenge();
    // Jump straight to the prompt where a keyboard is likely; on touch screens wait for a tap
    if (window.matchMedia('(pointer: fine)').matches) {
        input.focus({ preventScroll: true });
    }
});
