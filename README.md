# CLI Adventures [BETA]

A web-based game for learning terminal commands through interactive challenges in a simulated CLI environment. This is currently in beta - please submit a pull request if you find any bugs or have suggestions for improvements.

## About

CLI Adventures is an educational game that helps users learn terminal commands through practical, hands-on scenarios. The game simulates a command-line interface in the browser, allowing users to practice essential commands like `ls`, `cd`, `cat`, and more in a risk-free environment.

## Features

- Terminal simulator inside a browser-window frame whose address bar follows your current directory
- Ten step-by-step challenges with a progress bar, hints and a full challenge list
- Virtual file system for exploration, with real-looking paths (`~/projects/hidden_vault`, `pwd` → `/home/fsociety/...`)
- Command history (↑/↓), Tab completion and Ctrl+L to clear
- Command reference whose entries drop a command at the prompt, handy on phones
- Expand button that lets the terminal fill the screen (Esc restores it)
- Layout that fits one screen on desktop and stacks challenge → terminal → reference on phones

## Accessibility

- Terminal output is a live log, so screen readers announce results and completed challenges
- Every control is a real button, link or disclosure with a visible focus ring; a skip link jumps to the prompt
- Tab completes names but never traps focus: on an empty prompt it moves on as usual
- Text meets WCAG AA contrast; directories are marked with a trailing `/`, not by colour alone
- Respects reduced motion and Windows high-contrast (forced colours)

## Deployment Options

### Cloudflare Worker (Arcade)

The arcade installation is https://cli-adventures.ailab-452.workers.dev/.
Run `npm ci`, `npm run check`, then `npm run deploy`. The Worker serves the original browser game and exposes `/health` with its source release. Games returns to the shared arcade; CUNY Login opens the existing Lab workspace. Game progress stays in the current browser tab and resets on reload.

### GitHub Pages

This version is configured for GitHub Pages deployment:
1. Push this code to your GitHub repository
2. Enable GitHub Pages in your repository settings
3. Set the source to the main branch
4. The game will be available at your GitHub Pages URL

### Static Web Server

Just upload all files to your web server - no server-side processing required.

## Commands Supported

- `ls` - List directory contents
- `cd [directory]` - Change directory
- `cat [file]` - View file contents
- `pwd` - Print working directory
- `mkdir [directory]` - Create directory
- `touch [file]` - Create empty file
- `rm [file]` - Remove file
- `mv [src] [dst]` - Move/rename file
- `cp [src] [dst]` - Copy file
- `unzip [file.zip]` - Extract zip file
- `clear` - Clear the terminal
- `reset` - Reset the game
- `help` - Show available commands

## Challenges

The game includes several challenges designed to progressively teach CLI concepts:
1. Navigation - Learn to move around directories
2. File inspection - View file contents
3. Hidden treasures - Find secret locations and complete the treasure hunt mission

## Technologies Used

- Frontend: HTML, CSS, JavaScript (`static/engine.js` is the game, `static/game.js` drives the page)
- Hosting: Cloudflare Worker serving static assets
- Tests: `npm test` plays the mission through the engine with Node's test runner

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.