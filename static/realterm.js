// The real terminal: boots a small Linux in v86 (static/vm) and runs one command at a time
// through cliadv-runner on its serial port. Every backend the page can use answers the same
// exec() shape: { code, cwd, stdout, stderr }.
const RealTerminal = (() => {
    'use strict';

    const BASE = 'static/vm/';
    const HOME = '/home/fsociety';
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const toBase64 = text => {
        let binary = '';
        for (const byte of encoder.encode(text)) binary += String.fromCharCode(byte);
        return btoa(binary);
    };
    const fromBase64 = text => {
        if (!text) return '';
        const binary = atob(text);
        return decoder.decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
    };

    let scriptPromise = null;
    function loadEmulator() {
        if (!scriptPromise) {
            scriptPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = `${BASE}libv86.js`;
                script.onload = resolve;
                script.onerror = () => reject(new Error('Could not load the emulator'));
                document.head.append(script);
            });
        }
        return scriptPromise;
    }

    // Linux in the browser (v86). Boots once; requests run one after another.
    class V86Backend {
        constructor() {
            this.buffer = '';
            this.waiting = [];
            this.chain = Promise.resolve();
            this.ready = null;
        }

        boot() {
            if (this.ready) return this.ready;
            this.ready = loadEmulator().then(() => new Promise((resolve, reject) => {
                const started = performance.now();
                this.emulator = new window.V86({
                    wasm_path: `${BASE}v86.wasm`,
                    memory_size: 96 * 1024 * 1024,
                    vga_memory_size: 2 * 1024 * 1024,
                    bios: { url: `${BASE}seabios.bin` },
                    vga_bios: { url: `${BASE}vgabios.bin` },
                    bzimage: { url: `${BASE}bzImage` },
                    initrd: { url: `${BASE}initrd.gz` },
                    cmdline: 'console=ttyS0 quiet',
                    autostart: true,
                    disable_keyboard: true,
                    disable_mouse: true,
                    disable_speaker: true,
                });
                const timer = setTimeout(() => reject(new Error('Linux did not start in time')), 90000);
                this.emulator.add_listener('serial0-output-byte', byte => {
                    this.buffer += String.fromCharCode(byte);
                    if (this.onReady && this.buffer.includes('\u001eREADY\n')) {
                        this.buffer = this.buffer.slice(this.buffer.indexOf('\u001eREADY\n') + 7);
                        this.onReady();
                    }
                    this.drain();
                });
                this.onReady = () => {
                    this.onReady = null;
                    clearTimeout(timer);
                    resolve({ seconds: (performance.now() - started) / 1000 });
                };
            }));
            return this.ready;
        }

        // Replies are one line each: \036R <exit> <cwd> <stdout> <stderr>, base64 fields
        drain() {
            for (;;) {
                const start = this.buffer.indexOf('\u001eR ');
                const end = start < 0 ? -1 : this.buffer.indexOf('\n', start);
                if (end < 0 || !this.waiting.length) return;
                const [code, cwd, stdout, stderr] = this.buffer.slice(start + 3, end).split(' ');
                this.buffer = this.buffer.slice(end + 1);
                this.waiting.shift()({ code: Number(code), cwd: fromBase64(cwd), stdout: fromBase64(stdout), stderr: fromBase64(stderr) });
            }
        }

        request(kind, text) {
            const run = () => this.boot().then(() => new Promise(resolve => {
                this.waiting.push(resolve);
                this.emulator.serial0_send(`${kind}${toBase64(text)}\n`);
            }));
            const result = this.chain.then(run, run);
            this.chain = result.catch(() => {});
            return result;
        }

        // A player's command: their cwd and exported variables carry over between calls
        exec(line) { return this.request('X', line); }
        // Game setup or a challenge check, run as-is
        script(text) { return this.request('P', text); }
        async probe(test) { return (await this.script(test)).code === 0; }
    }

    // The lab's sandbox service would answer the same calls from a real container.
    // It needs a CUNY sign-in and a backend in the Worker, so it is not wired up yet.
    class LabSandboxBackend {
        boot() { return Promise.reject(new Error('The lab sandbox backend is not connected yet')); }
    }

    const display = path => path === HOME ? '~' : path && path.startsWith(HOME + '/') ? '~' + path.slice(HOME.length) : path;

    return { V86Backend, LabSandboxBackend, HOME, display, toBase64 };
})();
