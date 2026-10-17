# CLI Adventures [BETA]

A browser game that teaches the command line, then uses it to teach how AI agents work. It runs in a simulated terminal, so nothing can break. This is currently in beta - please submit a pull request if you find any bugs or have suggestions for improvements.

## Chapters

1. **The Stolen Treasure**: move around, read files, and put a stolen file back (`ls`, `cd`, `cat`, `pwd`, `mkdir`, `mv`, `unzip`)
2. **Wake the Agent**: find hidden files, vet a package, install a command-line agent, protect its key with `chmod 600`, and sign it in
3. **Bring It Home**: compare model sizes with free disk space (`df -h`), pull a local Gemma model, switch the agent to it, and find it with `ps`
4. **Memory Palace**: build a knowledge base with `grep`, globs and `cp`, keep private notes out of it, count words with `wc`, index it, and see the agent admit what its notes don't say
5. **Standing Orders**: list the agent's tools, write a system prompt with `>` and `>>`, write a skill, grant a tool with approval, and run the skill
6. **Ghost in the Downloads**: find a cryptominer with `ps`, unmask a fake invoice with `file`, survive a prompt injection hidden in it, `kill` the process, remove its `crontab` persistence and hidden copy, and rotate the leaked key

Chapters unlock in order and can be replayed from the sidebar. Progress is saved in the browser.

## Bit, the sprite

Bit sits next to the prompt. It jumps when you complete a challenge, looks worried and explains when a command fails, gives a hint (then a bigger one) when clicked, and throws confetti when a chapter or the whole game is done. It can be switched off in the sidebar, and it stays still when the system asks for reduced motion.

When the Worker has a gateway key, Bit's lines and the in-game agent's cloud answers come from a fast language model (DeepSeek V4 Flash through the CUNY AI Lab gateway). Otherwise both use scripted lines. Challenges never depend on what the model says, so the game plays the same either way. The local model in Chapter 3 is simulated and never makes a network call, which matches what the game tells players.

## Real Linux (beta)

The **Real Linux** button in the window's tab bar swaps the simulator for a real Linux 6.12 with bash, booted inside the tab by the [v86](https://github.com/copy/v86) emulator. Nothing runs on a server. The first start downloads about 11 MB and takes a few seconds; after that, every command, error and output is the real thing. Chapter 1 plays there so far, with challenges checked against the real files; the other chapters stay in the simulator. Click the button again to go back, with your simulator progress where you left it. How the image is built, and its licenses, are in [`vm/README.md`](vm/README.md).

## Features

- Terminal simulator inside a browser-window frame whose address bar follows your current directory
- A small shell: paths with `~` and `..`, hidden dotfiles, permissions, `*` globs, pipes (`|`), `>` and `>>`, `&&`, `$VARIABLES`, and scripts
- Beginner-friendly errors with a tip under each one
- Command history (↑/↓), Tab completion for commands, sub-commands and paths, and Ctrl+L to clear
- A command reference that grows with each chapter; its entries drop a command at the prompt, handy on phones
- Expand button that lets the terminal fill the screen (Esc restores it)
- Layout that fits one screen on desktop and stacks challenge → terminal → reference on phones

## Accessibility

- Terminal output is a live log, so screen readers announce results and completed challenges; Bit's lines go to a status region
- Every control is a real button, link or disclosure with a visible focus ring; a skip link jumps to the prompt
- Tab completes names but never traps focus: on an empty prompt it moves on as usual
- Text meets WCAG AA contrast; directories are marked with a trailing `/`, not by colour alone
- Respects reduced motion (no jumping, no confetti) and Windows high-contrast (forced colours)

## Deployment

### Cloudflare Worker (Arcade)

The arcade installation is https://cli-adventures.ailab-452.workers.dev/.
Run `npm ci`, `npm run check`, then `npm run deploy`. The Worker serves the game, exposes `/health` with its source release, and answers `POST /api/llm` for Bit and the in-game agent. Games returns to the shared arcade; CUNY Login opens the existing Lab workspace.

To turn the language model on, give the Worker an app key (`sk-cail-…`) from the CAIL Model Access Registry:

```sh
npx wrangler secret put CAIL_GATEWAY_API_KEY
```

The gateway address and model are the `CAIL_GATEWAY_URL` and `LLM_MODEL` vars in `wrangler.jsonc` (`deepseek-v4-flash-0731` by default). `/api/llm` only accepts the game's own requests: same-origin, capped input lengths, short replies, and at most 20 requests a minute per visitor (the `LLM_LIMITER` binding). Without the secret it answers 503 and the page uses its scripted lines. For local development, put the key in `.dev.vars`.

### Static hosting

`index.html` and `static/` also run from any static host or GitHub Pages. Without the Worker there is no `/api/llm`, so Bit and the agent use their scripted lines.

## Technologies Used

- Frontend: HTML, CSS, JavaScript. `static/engine.js` is the game (filesystem, shell, chapters), `static/sprite.js` is Bit, and `static/game.js` drives the page
- Hosting: Cloudflare Worker (`src/index.ts`, with `src/llm.ts` for the model endpoint)
- Tests: `npm test` plays every chapter through the engine and checks `/api/llm` against a fake gateway

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
