# CLI Adventures [BETA]

A web-based game for learning terminal commands through interactive challenges in a simulated CLI environment. This is currently in beta - please submit a pull request if you find any bugs or have suggestions for improvements.

## About

CLI Adventures is an educational game that helps users learn terminal commands through practical, hands-on scenarios. The game simulates a command-line interface in the browser, allowing users to practice essential commands like `ls`, `cd`, `cat`, and more in a risk-free environment.

## Features

- Interactive terminal simulator with vintage aesthetic
- Step-by-step challenges to learn core CLI commands
- Virtual file system for exploration
- Command history and navigation (arrow keys)
- Responsive design for desktop and mobile
- Hint system for beginners

## Deployment Options

### GitHub Pages (Current)

This version is configured for GitHub Pages deployment:
1. Push this code to your GitHub repository
2. Enable GitHub Pages in your repository settings
3. Set the source to the main branch
4. The game will be available at your GitHub Pages URL

### Static Web Server

Just upload all files to your web server - no server-side processing required.

### Flask App (Python)

For additional features or server-side processing:

1. Install the required packages: `pip install -r requirements.txt`
2. Run the Flask app: `python app.py`
3. Access at http://localhost:5000

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

- Frontend: HTML, CSS, JavaScript
- Backend: Pure JavaScript (GitHub Pages version) or Python with Flask (optional)
- Styling: Custom CSS with terminal aesthetics

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.