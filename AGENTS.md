# CLI Adventures

A web-based game for learning terminal commands through interactive challenges.

## Deployment

The arcade installation deploys directly to Cloudflare Workers at https://cli-adventures.ailab-452.workers.dev/. The earlier Kale installation remains separate.

- **Runtime:** Cloudflare Workers fetch handler
- **Static assets:** `index.html` and `static/` are copied to `public/` at build time
- **Bindings:** `ASSETS`, `RELEASE`, `CAIL_GATEWAY_URL`, `LLM_MODEL` and the `LLM_LIMITER` rate limiter; the optional `CAIL_GATEWAY_API_KEY` secret turns on `/api/llm`. The game itself uses an in-memory browser filesystem saved to localStorage
- **Deploy:** `npm run check`, then `npm run deploy`; verify `/health` against the source commit

## Commands

- `npm run dev` — local development at http://localhost:8787
- `npm test` — engine tests (plays every chapter headlessly) and `/api/llm` tests against a fake gateway
- `npm run check` — type-check, tests and build validation
- `npm run build` — copy static assets to `public/`

## Structure

- `src/index.ts` — Worker entrypoint (static assets, health, `/api/llm`)
- `src/llm.ts` — Bit's lines and the in-game agent's cloud answers through the CAIL gateway
- `index.html` — main game page
- `static/engine.js` — game engine (`CLIGame`: virtual filesystem, shell, commands, chapters and challenges)
- `static/coach.js` — what the game knows about the player (`Coach`): skills per concept, the hint ladder and its cap, the hint log, and the end-of-chapter review tasks
- `static/sprite.js` — Bit, the sprite by the prompt (bubbles, hints, jump, confetti)
- `static/game.js` — page controller (terminal window, sidebar, saves, keyboard handling)
- `static/realterm.js` — the real terminal adapter (`RealTerminal`): the v86 backend, and a stub for the lab sandbox service
- `static/realchapters.js` — chapters played on the real terminal (`RealChapters`): setup scripts and checks against real files
- `static/vm/` — emulator, BIOS, kernel and initrd for the real terminal (built by `vm/build.sh`; see `vm/README.md`)
- `static/style.css` — layout and theme; `static/suite-navigation.css` is shared with the arcade
- `test/` — engine tests
- `public/` — build output (gitignored)

## Conventions

- Do not use `app.listen(...)` or any long-running server pattern.
- The Worker exports a fetch handler; production bindings are declared in wrangler.jsonc.
- Keep the project small and editable.
- Challenge checks read game state and the commands the player ran, never model output, so the game plays the same with or without `/api/llm`.
- How much a hint may reveal is decided in `coach.js` from trusted state (errors, time, skills), never from what the player types, and never by the model. Only the top step sends the exact command to the model.
- Real-terminal checks run shell tests in the VM (`probe`) or read the command, exit code and cwd; they never parse model output either.
- A new chapter needs `setup` (adds its files), `solve` (its end state, used when a later chapter is started directly) and challenges; add its commands to the `COMMANDS` reference and a walkthrough to `test/engine.test.mjs`.
