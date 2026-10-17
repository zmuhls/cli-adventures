// Chapters for the real terminal. Story, challenge text and hints come from the simulated
// chapters (engine.js); here each challenge gets a check against the real machine: what the
// player typed, the exit code, the real working directory, or a test of the real filesystem.
const RealChapters = (() => {
    'use strict';

    const H = '/home/fsociety';
    const first = ctx => ctx.words[0];

    const TREASURE_SETUP = `set -e
cd "$HOME"
rm -rf documents downloads projects notes.txt mission.txt .cliadv/state
mkdir -p documents downloads projects/hidden_vault
cat > notes.txt <<'TXT'
Welcome to CLI Adventures!
Type 'help' to see available commands.
TXT
cat > mission.txt <<'TXT'
MISSION BRIEFING:
A precious treasure.json file has been stolen from the archive.zip/relics folder!
The thief has hidden it in the hidden_vault directory.

Your mission:
1. Find and recover the treasure.json file
2. Use unzip command to extract the archive.zip
3. Create a 'relics' directory inside the extracted archive if it doesn't exist
4. Move the treasure.json file to its rightful place in archive/relics

Good luck, agent!
TXT
echo "The password is 'opensesame'" > documents/secret.txt
printf '%%PDF-1.7\n%% a manual\n' > documents/manual.pdf
printf '\\377\\330\\377\\340 an image' > downloads/image.jpg
echo 'UEsDBBQAAAAIAIOiUV35SZJhQwAAAEUAAAASAAAAYXJjaGl2ZS9SRUFETUUudHh0cyxKzsgsS1VIzs8rSc0rKdZTCMlILU5VSMvMSS1WKE8tSlUoSk3OLwMyUhTSivJzFRLzgCg5E6hYobiyuCQ1V48LAFBLAwQUAAAACACDolFdprZgnikAAAAtAAAAEAAAAGFyY2hpdmUvZGF0YS5jc3bLLEnN1SlLzClN5UosKMhJ1THkSkrMA0IdI66SotTE4tIioJgBGHABAFBLAQIUAxQAAAAIAIOiUV35SZJhQwAAAEUAAAASAAAAAAAAAAAAAACAAQAAAABhcmNoaXZlL1JFQURNRS50eHRQSwECFAMUAAAACACDolFdprZgnikAAAAtAAAAEAAAAAAAAAAAAAAAgAFzAAAAYXJjaGl2ZS9kYXRhLmNzdlBLBQYAAAAAAgACAH4AAADKAAAAAAA=' | base64 -d > downloads/archive.zip
cat > projects/README.md <<'TXT'
# Project Documentation
Use 'ls' to list files
Use 'cd' to change directories
Use 'cat' to read files
TXT
echo '{"reward":"You have mastered basic CLI commands!","value":"$1,000,000","origin":"archive/relics"}' > projects/hidden_vault/treasure.json`;

    const CHAPTERS = [
        {
            id: 'treasure',
            setup: TREASURE_SETUP,
            checks: {
                ls: ctx => first(ctx) === 'ls' && ctx.code === 0 && ctx.cwd === H,
                cd: ctx => first(ctx) === 'cd' && ctx.code === 0 && ['documents', 'downloads', 'projects'].some(d => ctx.cwd === `${H}/${d}`),
                cat: ctx => first(ctx) === 'cat' && ctx.code === 0 && ctx.words.length > 1,
                pwd: ctx => first(ctx) === 'pwd',
                cd_parent: ctx => first(ctx) === 'cd' && ctx.words[1] === '..' && ctx.code === 0,
                mission_brief: ctx => first(ctx) === 'cat' && ctx.code === 0 && /mission\.txt/.test(ctx.line),
                find_treasure: ctx => ctx.cwd === `${H}/projects/hidden_vault`,
                unzip_archive: ctx => ctx.probe('test -d "$HOME/downloads/archive"'),
                create_relics: ctx => ctx.probe('test -d "$HOME/downloads/archive/relics"'),
                mission_complete: ctx => ctx.probe('test -f "$HOME/downloads/archive/relics/treasure.json"'),
            },
        },
    ];

    // Plays the real chapters against a backend with the same read API the page uses for the simulator
    class Game {
        constructor(backend, simChapters) {
            this.backend = backend;
            this.sim = simChapters;
            this.chapter = 0;
            this.step = 0;
            this.path = H;
            this.pending = null;
            this.isReal = true;
        }

        async start() {
            const r = await this.backend.script(CHAPTERS[this.chapter].setup);
            if (r.code !== 0) throw new Error(r.stderr || 'Chapter setup failed');
            this.step = 0;
            this.path = H;
            await this.backend.script('cd "/root"; printf "cd %q\\n" "/root" > "/root/.cliadv/state"');
        }

        challenges() {
            return this.sim[CHAPTERS[this.chapter].id === 'treasure' ? 0 : this.chapter].challenges;
        }

        async run(line) {
            const r = await this.backend.exec(line);
            if (r.cwd) this.path = r.cwd;
            r.stderr = r.stderr.replace(/^bash: line \d+: /gm, 'bash: ');
            const ctx = { line, words: line.trim().split(/\s+/), code: r.code, cwd: this.path, probe: test => this.backend.probe(test) };
            const completed = [];
            const list = this.challenges();
            const checks = CHAPTERS[this.chapter].checks;
            while (this.step < list.length && await checks[list[this.step].id](ctx)) {
                completed.push({ text: list[this.step].done });
                this.step++;
            }
            return { ...r, completed, done: this.step >= list.length };
        }

        currentChallenge() {
            const list = this.challenges();
            const c = list[this.step];
            const base = { chapterIndex: this.chapter, chapter: this.sim[this.chapter].title, chapters: this.sim.length, total: list.length, index: this.step };
            if (!c) return { ...base, done: true, text: "That's every real-terminal challenge so far. Keep exploring: this is a real Linux.", hint: "Try 'uname -a', 'ps', or write a script with echo and >." };
            return { ...base, id: c.id, text: c.text, hint: c.hint, done: false };
        }

        promptText() { return `${RealTerminal.display(this.path)} $`; }
        getPath() { return RealTerminal.display(this.path); }
        cwd() { return this.path; }
    }

    return { CHAPTERS, Game };
})();
