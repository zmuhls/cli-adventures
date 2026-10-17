# CLI Adventures

A web-based game for learning terminal commands through interactive challenges.

## Deployment

The arcade installation deploys directly to Cloudflare Workers at https://cli-adventures.ailab-452.workers.dev/. The earlier Kale installation remains separate.

- **Runtime:** Cloudflare Workers fetch handler
- **Static assets:** `index.html` and `static/` are copied to `public/` at build time
- **Bindings:** `ASSETS` and `RELEASE`; the game uses an in-memory browser filesystem
- **Deploy:** `npm run check`, then `npm run deploy`; verify `/health` against the source commit

## Commands

- `npm run dev` — local development at http://localhost:8787
- `npm test` — engine tests (plays the mission headlessly)
- `npm run check` — type-check, tests and build validation
- `npm run build` — copy static assets to `public/`

## Structure

- `src/index.ts` — Worker entrypoint (static assets and health)
- `index.html` — main game page
- `static/engine.js` — game engine (`CLIGame`: world, commands, challenges)
- `static/game.js` — page controller (terminal window, sidebar, keyboard handling)
- `static/style.css` — layout and theme; `static/suite-navigation.css` is shared with the arcade
- `test/` — engine tests
- `public/` — build output (gitignored)

## Conventions

- Do not use `app.listen(...)` or any long-running server pattern.
- The Worker exports a fetch handler; production bindings are declared in wrangler.jsonc.
- Keep the project small and editable.
