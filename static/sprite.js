// Bit: the little sprite who lives by the prompt. It cheers when a challenge is done,
// nudges after a mistake, and gives hints when clicked. When the gateway is configured
// a small language model words its bubbles; otherwise it uses the scripted lines below.
const BitSprite = (() => {
    'use strict';

    const CHEERS = ['Nice one!', 'Yes! You got it.', 'Look at you go!', 'Smooth.', "That's the one!", 'Beep boop: correct!', 'Ooh, tidy work.', 'Nailed it!'];

    const ERROR_LINES = {
        not_found: "Hmm, I can't find that name here. 'ls' shows the exact spellings.",
        not_dir: "That's a file, not a folder. Files are for 'cat', folders are for 'cd'.",
        is_dir: "That one's a folder! 'ls' peeks inside, 'cd' steps in.",
        file_as_command: "Files aren't commands! Put 'cat' in front to read it.",
        dir_as_command: "That's a folder name. Put 'cd' in front to go there.",
        missing_arg: 'Almost! That command needs a name after it.',
        permission: 'Locked! Read the tip under the error; it says what to change.',
        syntax: 'A quote or symbol is missing. Quotes come in pairs!',
        not_installed: "That program isn't installed yet.",
        unsafe: 'Phew, pkg said no. Unverified packages are risky!',
        no_space: 'Too big for this disk! Try a smaller model.',
        not_logged_in: 'The agent needs its key before it can talk to the cloud.',
        tool_disabled: "That tool is switched off. 'agent tools' shows what's on.",
        guarded: 'Whoa, careful! We still need that.',
        exists: 'That name is already taken here.',
        no_match: "No matches. Try another word, or add -i to ignore upper and lower case.",
        offline: "This laptop is offline in the game, so downloads go nowhere. (Phew.)",
        typo: 'So close! Check the spelling of that command, letter by letter.',
        wrong_command: "That command is real, but it isn't the one this challenge needs. Click me for a hint!",
    };

    // 'quoted' commands, but not the apostrophes in words like you're
    const QUOTED = /(?<=^|[\s(])'([^'\n]+?)'(?=[\s.,;:!?)]|$)/g;
    const stripAnsi = text => text.replace(/\u001b\[[\d;]*m/g, '');

    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pick = list => list[Math.floor(Math.random() * list.length)];

    function create({ root, button, bubble, text, live, closeButton, canvas, ask, decide, context, onLayout }) {
        let enabled = true;
        let hideTimer = null;
        let moodTimer = null;
        let idleTimer = null;
        let request = 0;
        let streak = { id: null, errors: 0, hints: 0, nudged: false };

        function setMood(mood, hold = 2400) {
            root.dataset.mood = mood;
            clearTimeout(moodTimer);
            if (mood !== 'idle') moodTimer = setTimeout(() => { root.dataset.mood = 'idle'; }, hold);
        }

        function animate(name) {
            root.classList.remove('is-jumping', 'is-shaking');
            if (reduceMotion()) return;
            void root.offsetWidth;
            root.classList.add(name);
        }

        // Room under the output while a bubble shows, so it never covers the latest lines
        function layout() {
            const terminal = root.parentElement;
            terminal.classList.toggle('has-bubble', !bubble.hidden);
            if (!bubble.hidden) terminal.style.setProperty('--bubble-space', `${bubble.offsetHeight + 16}px`);
            if (onLayout) onLayout();
        }

        function hide() {
            bubble.hidden = true;
            clearTimeout(hideTimer);
            layout();
        }

        function scheduleHide(ms) {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (bubble.matches(':hover, :focus-within')) scheduleHide(2000);
                else hide();
            }, ms);
        }

        // Plain text with 'quoted' commands shown as code
        function render(message) {
            text.replaceChildren();
            message.split(QUOTED).forEach((part, i) => {
                if (i % 2) {
                    const code = document.createElement('code');
                    code.textContent = part;
                    text.append(code);
                } else if (part) {
                    text.append(part);
                }
            });
        }

        function say(message, { mood = 'idle', hold = 9000 } = {}) {
            if (!enabled || !message) return;
            request++;
            bubble.classList.remove('is-thinking');
            render(message);
            live.textContent = `Bit says: ${message.replace(QUOTED, '$1')}`;
            bubble.hidden = false;
            layout();
            setMood(mood, Math.min(hold, 4000));
            scheduleHide(hold);
        }

        // Ask the model for a line, showing dots meanwhile; fall back to the scripted line
        async function sayFromModel(payload, fallback, options) {
            if (!enabled) return;
            const mine = ++request;
            bubble.classList.add('is-thinking');
            text.textContent = 'Bit is thinking…';
            bubble.hidden = false;
            layout();
            clearTimeout(hideTimer);
            const reply = await ask(payload);
            if (mine !== request) return;
            say(reply || fallback, options);
        }

        function payload(event, extra = {}) {
            const ctx = context();
            return { kind: 'sprite', event, chapter: ctx.chapter, challenge: ctx.challenge, hint: ctx.hint, cwd: ctx.cwd, ...extra };
        }

        function track() {
            const id = context().challengeId;
            if (streak.id !== id) streak = { id, errors: 0, hints: 0, nudged: false };
        }

        function hint() {
            track();
            streak.hints++;
            const ctx = context();
            const level = Math.min(3, streak.hints);
            const fallback = level === 1 ? `Hint: ${ctx.hint}` : `${ctx.hint} Type it exactly like that, then press Enter.`;
            sayFromModel(payload('hint', { level }), fallback, { mood: 'idle', hold: 14000 });
        }

        function confetti(big) {
            if (reduceMotion() || !canvas.getContext) return;
            const ctx = canvas.getContext('2d');
            const ratio = window.devicePixelRatio || 1;
            canvas.width = innerWidth * ratio;
            canvas.height = innerHeight * ratio;
            canvas.hidden = false;
            const colors = ['#50fa7b', '#c3a6ff', '#ff92d0', '#f1fa8c', '#8be9fd', '#ffb86c'];
            const from = root.getBoundingClientRect();
            const pieces = Array.from({ length: big ? 220 : 90 }, () => {
                const x = big ? Math.random() * innerWidth : from.left + from.width / 2;
                const y = big ? -20 - Math.random() * innerHeight * 0.3 : from.top;
                const angle = big ? Math.PI / 2 + (Math.random() - 0.5) : -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
                const speed = big ? 2 + Math.random() * 3 : 6 + Math.random() * 7;
                return {
                    x: x * ratio, y: y * ratio, vx: Math.cos(angle) * speed * ratio, vy: Math.sin(angle) * speed * ratio,
                    size: (5 + Math.random() * 6) * ratio, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.3,
                    color: pick(colors), round: Math.random() < 0.3,
                };
            });
            const start = performance.now();
            const length = big ? 4200 : 2600;
            const frame = now => {
                const t = now - start;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = Math.max(0, Math.min(1, (length - t) / 700));
                for (const p of pieces) {
                    p.vy += 0.18 * ratio;
                    p.vx *= 0.99;
                    p.x += p.vx;
                    p.y += p.vy;
                    p.rot += p.spin;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rot);
                    ctx.fillStyle = p.color;
                    if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2); ctx.fill(); }
                    else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
                    ctx.restore();
                }
                if (t < length) requestAnimationFrame(frame);
                else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.hidden = true; }
            };
            requestAnimationFrame(frame);
        }

        // Real bash errors carry no error code; Clef-flash sorts them into one (or 'other')
        async function diagnose(command, output) {
            if (!decide) return null;
            const kind = await decide({ command, output, cwd: context().cwd, challenge: context().challenge });
            return kind && kind !== 'other' && ERROR_LINES[kind] ? kind : null;
        }

        // React to one command's result from the engine
        async function react(result, command) {
            track();
            if (result.gameComplete) {
                animate('is-jumping');
                say("You did it! Every adventure, done. You're a real command-line agent now.", { mood: 'happy', hold: 16000 });
                confetti(true);
                return;
            }
            if (result.chapterComplete) {
                animate('is-jumping');
                say(`Chapter complete: ${result.chapterComplete.title}! ${result.chapterComplete.outro}`, { mood: 'happy', hold: 12000 });
                confetti(false);
                return;
            }
            if (result.completed.length) {
                animate('is-jumping');
                say(pick(CHEERS), { mood: 'happy', hold: 3500 });
                return;
            }
            if (result.prompt === 'approval') {
                say("The agent is asking permission. Read exactly what it wants to run, then answer 'y' or 'n'.", { mood: 'worried', hold: 14000 });
                return;
            }
            if (!result.error) return;
            streak.errors++;
            animate('is-shaking');
            const output = stripAnsi(result.output).slice(0, 600);
            let code = result.error.code;
            if (!ERROR_LINES[code] && code !== 'unknown_command') {
                const mine = request;
                const kind = await diagnose(command, output);
                if (mine !== request) return;
                if (kind) code = kind;
            }
            let fallback = ERROR_LINES[code] || "Not quite. Click me if you'd like a hint!";
            if (code === 'unknown_command' && result.events[0] && result.events[0].meta.suggestion) {
                fallback = `I don't know '${result.error.cmd}'. Did you mean '${result.events[0].meta.suggestion}'?`;
            }
            if (streak.errors >= 3) fallback = `Tricky one! ${context().hint}`;
            if (code === 'no_match' || code === 'guarded' || code === 'unsafe') {
                say(fallback, { mood: 'worried' });
                return;
            }
            sayFromModel(
                payload(streak.errors >= 3 ? 'stuck' : 'error', { command, output, mistake: ERROR_LINES[code] ? code : '', level: streak.errors >= 2 ? 2 : 1 }),
                fallback,
                { mood: 'worried', hold: 11000 },
            );
        }

        // A gentle nudge after a quiet minute on the same challenge
        function activity(inputEmpty) {
            clearTimeout(idleTimer);
            if (!enabled) return;
            idleTimer = setTimeout(() => {
                track();
                if (!streak.nudged && inputEmpty() && bubble.hidden) {
                    streak.nudged = true;
                    say('Psst. Stuck? Click me for a hint.', { mood: 'idle', hold: 7000 });
                }
            }, 60000);
        }

        root.addEventListener('animationend', e => {
            if (e.animationName === 'bit-jump' || e.animationName === 'bit-shake') root.classList.remove('is-jumping', 'is-shaking');
        });
        button.addEventListener('click', () => {
            animate('is-jumping');
            hint();
        });
        closeButton.addEventListener('click', hide);
        bubble.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });

        return {
            say, react, hint, confetti, activity, hide,
            setEnabled(on) {
                enabled = on;
                root.hidden = !on;
                if (!on) hide();
            },
        };
    }

    return { create };
})();
