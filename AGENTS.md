# CLI Adventures

A web-based game for learning terminal commands through interactive challenges.

## Deployment

This project deploys to **Kale Deploy** (CAIL Deploy) at https://cli-adventures.cuny.qzz.io.

- **Runtime:** Cloudflare Workers with Hono
- **Static assets:** `index.html` and `static/` are copied to `public/` at build time
- **Bindings:** `DB` (D1), `FILES` (R2), `CACHE` (KV) — provisioned by the deploy service
- **Deploy trigger:** Push to `main` branch on GitHub

## Commands

- `npm run dev` — local development at http://localhost:8787
- `npm run check` — type-check and build validation
- `npm run build` — copy static assets to `public/`

## Structure

- `src/index.ts` — Worker entrypoint (Hono routes)
- `index.html` — main game page
- `static/` — CSS, JS game logic
- `public/` — build output (gitignored)

## Conventions

- Do not use `app.listen(...)` or any long-running server pattern.
- The Worker exports a fetch handler; production bindings are attached by the deploy service.
- Keep the project small and editable.
