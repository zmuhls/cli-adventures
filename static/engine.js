// CLIGame - the client-side game engine. game.js drives it from the page.

// Fresh copies of the starting state, used on load and by 'reset'.
// In every directory except home, exits[0] is the parent directory.
function createWorld() {
    return {
        "home": {
            "description": "Your home directory. A clean, minimal space with a terminal prompt blinking.",
            "items": ["notes.txt", "mission.txt"],
            "exits": ["documents", "downloads", "projects"]
        },
        "documents": {
            "description": "A directory containing important files.",
            "items": ["secret.txt", "manual.pdf"],
            "exits": ["home"]
        },
        "downloads": {
            "description": "A cluttered space with various downloaded files.",
            "items": ["image.jpg", "archive.zip"],
            "exits": ["home"]
        },
        "projects": {
            "description": "Your coding projects directory.",
            "items": ["README.md"],
            "exits": ["home", "hidden_vault"]
        },
        "hidden_vault": {
            "description": "A secret directory containing treasures.",
            "items": ["treasure.json"],
            "exits": ["projects"]
        }
    };
}

function createFiles() {
    return {
        "notes.txt": "Welcome to CLI Adventures!\nType 'help' to see available commands.",
        "mission.txt": "MISSION BRIEFING:\nA precious treasure.json file has been stolen from the archive.zip/relics folder!\nThe thief has hidden it in the hidden_vault directory.\n\nYour mission:\n1. Find and recover the treasure.json file\n2. Use unzip command to extract the archive.zip\n3. Create a 'relics' directory inside the extracted archive if it doesn't exist\n4. Move the treasure.json file to its rightful place in archive/relics\n\nGood luck, agent!",
        "secret.txt": "The password is 'opensesame'",
        "README.md": "# Project Documentation\nUse 'ls' to list files\nUse 'cd' to change directories\nUse 'cat' to read files",
        "treasure.json": JSON.stringify({"reward": "You've mastered basic CLI commands!", "value": "$1,000,000", "origin": "archive/relics"})
    };
}

// Contents of archive.zip, added to the world by 'unzip'
function createArchive() {
    return {
        "archive": {
            "description": "Contents of the extracted archive",
            "items": ["README.txt", "data.csv"],
            "exits": ["downloads"]
        }
    };
}

function CLIGame() {
    this.current_location = "home";
    this.inventory = [];
    this.completed_lessons = new Set();
    this.history = [];
    this.world = createWorld();
    this.files = createFiles();
    
    // Flag to track if mission is complete
    this.mission_complete = false;
    
    // Lessons and challenges. Conditions run after the command, so they see where the
    // player ended up; `ok` is false when the command printed an error.
    this.lessons = [
        {
            "id": "ls",
            "description": "List directory contents using 'ls'",
            "challenge": "List the contents of your home directory",
            "success_condition": (cmd, args) => cmd === "ls" && !args.length,
            "hint": "Just type 'ls' and press Enter"
        },
        {
            "id": "cd",
            "description": "Change directories using 'cd'",
            "challenge": "Navigate to any directory from home",
            "success_condition": (cmd, args, ok) => cmd === "cd" && ok && ["documents", "downloads", "projects"].includes(this.current_location),
            "hint": "Type 'cd' followed by a directory name like 'cd documents' or 'cd downloads'"
        },
        {
            "id": "cat",
            "description": "View file contents using 'cat'",
            "challenge": "Read the contents of any text file",
            "success_condition": (cmd, args, ok) => cmd === "cat" && args.length && ok,
            "hint": "First 'cd' to a directory, then 'cat filename' to view its contents"
        },
        {
            "id": "pwd",
            "description": "Print working directory using 'pwd'",
            "challenge": "Check your current location using pwd",
            "success_condition": (cmd, args) => cmd === "pwd",
            "hint": "Type 'pwd' to see your current location in the file system"
        },
        {
            "id": "cd_parent",
            "description": "Navigate to parent directory using 'cd ..'",
            "challenge": "Go to a directory and then return to the parent directory",
            "success_condition": (cmd, args, ok) => cmd === "cd" && args[0] === ".." && ok,
            "hint": "First 'cd' to a directory, then type 'cd ..' to go back up one level"
        },
        {
            "id": "mission_brief",
            "description": "Read your mission briefing",
            "challenge": "Read the mission.txt file in your home directory",
            "success_condition": (cmd, args, ok) => cmd === "cat" && args[0] === "mission.txt" && ok,
            "hint": "Use 'cat mission.txt' in your home directory to read your mission briefing"
        },
        {
            "id": "find_treasure",
            "description": "Locate the stolen treasure",
            "challenge": "Navigate to the hidden_vault and verify the treasure.json file is there",
            "success_condition": (cmd) => (cmd === "ls" || cmd === "cd") && this.current_location === "hidden_vault",
            "hint": "First go to the projects directory with 'cd projects', then to 'cd hidden_vault'"
        },
        {
            "id": "unzip_archive",
            "description": "Extract the archive.zip file",
            "challenge": "Use the unzip command on archive.zip in the downloads directory",
            "success_condition": (cmd, args) => cmd === "unzip" && args[0] === "archive.zip" && "archive" in this.world,
            "hint": "First navigate to your home directory with 'cd ~', then go to downloads with 'cd downloads', then use 'unzip archive.zip'"
        },
        {
            "id": "create_relics",
            "description": "Create the missing relics directory",
            "challenge": "Create a relics directory inside the archive directory",
            "success_condition": (cmd, args) => cmd === "mkdir" && args[0] === "relics" && this.current_location === "archive" && this.world["archive"].exits.includes("relics"),
            "hint": "Navigate to the archive directory and use 'mkdir relics'"
        },
        {
            "id": "mission_complete",
            "description": "Return the treasure to its rightful place",
            "challenge": "Move the treasure.json file from hidden_vault to archive/relics",
            "success_condition": () => this.mission_complete,
            "hint": "First get the treasure.json file, then move it to the archive/relics directory"
        }
    ];
    
    // Process commands
    this.processCommand = function(command) {
        const parts = command.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) {
            return this._response("\u001b[31mError: No command entered. Type 'help' for a list of available commands.\u001b[0m");
        }
        
        const cmd = parts[0].toLowerCase();
        // Accept 'dir/' and paths under /home/fsociety the way a real shell would
        const args = parts.slice(1).map(arg => arg.replace(/^\/home\/fsociety(?=\/|$)/, "~").replace(/(.)\/+$/, "$1"));
        
        // Save command to history
        this.history.push(command);
        
        let result;
        if (cmd === "cd" && args.length === 0) {
            // 'cd' without args goes to the home directory
            this.current_location = "home";
            result = "Changed directory to home";
        } else if (this.world[this.current_location].items.includes(cmd)) {
            // A common beginner error: running a filename as a command
            result = `\u001b[31mError: Cannot execute '${cmd}'. To view this file, type 'cat ${cmd}' instead.\u001b[0m`;
        } else {
            result = this._executeCommand(cmd, args);
        }
        
        // Check the next incomplete lesson against the command's outcome;
        // finishing one lets the following lesson be checked too
        const ok = !result.startsWith("\u001b[31m");
        const completed = [];
        let lesson = this.getCurrentChallenge();
        while (lesson.success_condition && lesson.success_condition(cmd, args, ok)) {
            this.completed_lessons.add(lesson.id);
            completed.push(`🎉 Challenge completed: ${lesson.description}`);
            lesson = this.getCurrentChallenge();
        }
        if (completed.length) {
            result = completed.join("\n") + "\n" + result;
        }
        
        return this._response(result);
    };
    
    this._response = function(result) {
        const next = this.getCurrentChallenge();
        return {
            result: result,
            location: this.current_location,
            path: this.getPath(),
            challenge: next.challenge,
            challenge_hint: next.hint || ""
        };
    };
    
    // In every directory except home, exits[0] is the parent
    this.parentOf = function(location) {
        return location === "home" || !this.world[location] ? null : this.world[location].exits[0];
    };
    
    // Clashing directory names are stored as "parent_child"; show the plain name
    this.nameOf = function(location) {
        const parent = this.parentOf(location);
        return parent && location.startsWith(parent + "_") ? location.slice(parent.length + 1) : location;
    };
    
    // Path relative to home, e.g. "~/projects/hidden_vault"
    this.getPath = function(location = this.current_location) {
        const names = [];
        while (location && location !== "home" && names.length < 32) {
            names.unshift(this.nameOf(location));
            location = this.parentOf(location);
        }
        return ["~", ...names].join("/");
    };
    
    // Child directories of a location (every exit except the parent)
    this.childrenOf = function(location) {
        return this.world[location].exits.slice(location === "home" ? 0 : 1);
    };
    
    // Files and child directories here, for tab completion
    this.listing = function() {
        return {
            files: [...this.world[this.current_location].items],
            dirs: this.childrenOf(this.current_location)
        };
    };
    
    // Execute command logic
    this._executeCommand = function(cmd, args) {
        if (cmd === "help") {
            return `Available commands:
- help: Show this help message
- ls: List contents of current directory
- cd [directory]: Change to specified directory (use .. to go up one level, ~ to go home)
- cat [file]: View contents of a file
- pwd: Print working directory
- mkdir [directory]: Create a new directory
- touch [file]: Create a new empty file
- rm [file]: Remove a file
- mv [source] [destination]: Move or rename a file
- cp [source] [destination]: Copy a file
- clear: Clear the terminal
- reset: Reset the game to its initial state
- unzip [file.zip]: Extract contents of a zip file
- exit: Exit the game`;
        }
        
        else if (cmd === "ls") {
            // Check if user is trying to list a specific directory
            if (args.length > 0) {
                const targetDir = args[0];
                
                // Check if directory exists in current location
                if (this.world[this.current_location].exits.includes(targetDir)) {
                    return `\u001b[31mError: To view contents of '${targetDir}', first use 'cd ${targetDir}', then 'ls'.\u001b[0m`;
                } else if (this.world[targetDir]) {
                    // This is for directories that exist but aren't accessible from current location
                    return `\u001b[31mError: Cannot access '${targetDir}' from current location. Use 'cd' to navigate there first.\u001b[0m`;
                } else {
                    return `\u001b[31mError: No such directory: '${targetDir}'.\u001b[0m`;
                }
            }
            
            const location = this.world[this.current_location];
            
            // Format child directories (not the parent) with ANSI blue color code
            const coloredDirs = this.childrenOf(this.current_location).map(exit => `\u001b[34m${exit}\u001b[0m`);
            
            // Join files and directories with space between them, ensuring both are displayed
            const items = location.items.join(" ");
            const dirs = coloredDirs.join(" ");
            return items + (items && dirs ? " " : "") + dirs;
        }
        
        else if (cmd === "cd") {
            if (!args.length) {
                return "\u001b[31mError: No directory specified. Use 'cd [directory]' to navigate.\u001b[0m";
            }
            
            // Check if the path includes multiple directories (e.g., "projects/hidden_vault")
            const path = args[0];
            if (path.includes('/')) {
                const pathParts = path.split('/').filter(part => part.length > 0);
                
                // Start from current location or home if path starts with "/"
                let currentPath = path.startsWith('/') ? 'home' : this.current_location;
                let successMessage = '';
                
                // Navigate through each part of the path
                for (let i = 0; i < pathParts.length; i++) {
                    const part = pathParts[i];
                    
                    // Special cases
                    if (part === '~') {
                        currentPath = 'home';
                        continue;
                    } else if (part === '..') {
                        // Handle parent directory navigation
                        if (currentPath === 'home') {
                            return "\u001b[31mError: Already at the root directory; you cannot go any higher.\u001b[0m";
                        }
                        
                        currentPath = this.parentOf(currentPath);
                        continue;
                    }
                    
                    // Check if the directory exists here
                    if (!this.childrenOf(currentPath).includes(part)) {
                        return `\u001b[31mError: Directory '${part}' not found in the path ${path}.\u001b[0m`;
                    }
                    
                    // Check if it's a file
                    if (this.world[currentPath].items.includes(part)) {
                        return `\u001b[31mError: '${part}' is a file. You can only 'cd' into directories.\u001b[0m`;
                    }
                    
                    // Check for namespaced directories
                    const namespacedKey = `${currentPath}_${part}`;
                    if (namespacedKey in this.world) {
                        currentPath = namespacedKey;
                    } else if (part in this.world) {
                        currentPath = part;
                    } else {
                        return `\u001b[31mError: Cannot access '${part}' in the path ${path}.\u001b[0m`;
                    }
                }
                
                // Successfully navigated the entire path
                this.current_location = currentPath;
                return `Changed directory to ${path}`;
            }
            
            // Single directory navigation (original behavior)
            const destination = path;
            
            // Check if user tried to cd into a file
            if (this.world[this.current_location].items.includes(destination)) {
                return `\u001b[31mError: '${destination}' is a file. You can only 'cd' into directories.\u001b[0m`;
            }
            
            // Handle cd .. (move to parent directory)
            if (destination === "..") {
                // Special handling for home directory
                if (this.current_location === "home") {
                    return "\u001b[31mError: Already at the root directory; you cannot go any higher.\u001b[0m";
                }

                this.current_location = this.parentOf(this.current_location);
                return `Changed directory to ${this.nameOf(this.current_location)}`;
            }
            
            // Handle cd ~ to return to home
            else if (destination === "~") {
                this.current_location = "home";
                return "Changed directory to home";
            }
            
            // The parent shows up in exits, but it is reached with 'cd ..'
            else if (this.current_location !== "home" && destination === this.nameOf(this.parentOf(this.current_location))) {
                if (destination === "home") {
                    return `\u001b[31mError: Cannot access home directory directly from subdirectories. Use 'cd ~' instead.\u001b[0m`;
                }
                return `\u001b[31mError: Cannot directly access parent directory '${destination}' from '${this.nameOf(this.current_location)}'. Use 'cd ..' instead.\u001b[0m`;
            }
            
            // Normal directory navigation into a child
            else if (this.childrenOf(this.current_location).includes(destination)) {
                // Clashing names are stored under a namespaced key
                const namespacedKey = `${this.current_location}_${destination}`;
                this.current_location = namespacedKey in this.world ? namespacedKey : destination;
                return `Changed directory to ${destination}`;
            }
            else {
                return `\u001b[31mError: Directory '${destination}' not found here. Check your spelling or use 'ls' to verify available directories.\u001b[0m`;
            }
        }
        
        else if (cmd === "cat") {
            if (!args.length) {
                return "\u001b[31mError: Specify a file to view its contents. Usage: 'cat [filename]'.\u001b[0m";
            }
            
            const filename = args[0];
            
            // Check if user tried to cat a directory
            if (this.world[this.current_location].exits.includes(filename)) {
                return `\u001b[31mError: '${filename}' is a directory. You can only use 'cat' to view file contents.\u001b[0m`;
            }
            
            if (!this.world[this.current_location].items.includes(filename)) {
                return `\u001b[31mError: File '${filename}' does not exist here. Use 'ls' to verify available files.\u001b[0m`;
            }
            
            if (!(filename in this.files)) {
                return `\u001b[31mError: Cannot display contents of '${filename}'.\u001b[0m`;
            }
            
            // Special hint for treasure.json if user repeatedly tries to cat it
            if (filename === "treasure.json" && this.history.filter(cmd => cmd.startsWith("cat treasure")).length > 2) {
                const treasureContent = this.files[filename];
                return treasureContent + "\n\nHint: 'treasure.json' seems like something you'd want to move, not just read.";
            }
            
            return this.files[filename];
        }
        
        else if (cmd === "pwd") {
            // ~ is short for the home directory, /home/fsociety
            return "/home/fsociety" + this.getPath().slice(1);
        }
        
        else if (cmd === "clear") {
            return "\u001b[2J\u001b[H";
        }
        
        else if (cmd === "reset") {
            // Reset the game state
            this.current_location = "home";
            this.inventory = [];
            this.completed_lessons = new Set();
            this.history = [];
            this.mission_complete = false;
            this.world = createWorld();
            this.files = createFiles();
            
            return "\u001b[2J\u001b[H\u001b[32m=== Game Reset ===\u001b[0m\nWelcome to CLI Adventures! Type 'help' to see available commands.";
        }
        
        else if (cmd === "mkdir") {
            if (!args.length) {
                return "\u001b[31mError: Specify a name. Usage: 'mkdir [dirname]'.\u001b[0m";
            }
            
            if (args.length > 1) {
                return "\u001b[31mError: Too many arguments provided. Usage: 'mkdir [dirname]'.\u001b[0m";
            }
            
            const newDir = args[0];
            if (this.world[this.current_location].exits.includes(newDir)) {
                return `\u001b[31mError: Directory '${newDir}' already exists.\u001b[0m`;
            }
            
            // Check if trying to create directory with same name as a file
            if (this.world[this.current_location].items.includes(newDir)) {
                return `\u001b[31mError: Cannot create directory '${newDir}'. A file with that name already exists.\u001b[0m`;
            }
            
            // Create a new directory
            this.world[this.current_location].exits.push(newDir);
            
            // Create a new directory entry in the world
            let dirKey = newDir;
            if (newDir in this.world) {
                // Create a namespaced key for this directory to avoid conflicts
                dirKey = `${this.current_location}_${newDir}`;
            }
            
            this.world[dirKey] = {
                "description": `A directory you created named ${newDir}.`,
                "items": [],
                "exits": [this.current_location]  // Link back to parent
            };
            
            // Special case for creating relics directory in archive
            if (newDir === "relics" && this.current_location === "archive") {
                this.world["relics"] = {
                    "description": "A secure directory for storing valuable treasures",
                    "items": [],
                    "exits": ["archive"]
                };
                
                // Special hint if user is nearing mission completion
                if (this.world["hidden_vault"] && this.world["hidden_vault"].items.includes("treasure.json")) {
                    return `Created directory: ${newDir}\n\nHint: Now you can move the treasure.json from hidden_vault to archive/relics!`;
                }
            }
            
            return `Created directory: ${newDir}`;
        }
        
        else if (cmd === "touch") {
            if (!args.length) {
                return "\u001b[31mError: Specify a name. Usage: 'touch [filename]'.\u001b[0m";
            }
            
            if (args.length > 1) {
                return "\u001b[31mError: Too many arguments provided. Usage: 'touch [filename]'.\u001b[0m";
            }
            
            const filename = args[0];
            
            // Check if trying to create a file with the same name as a directory
            if (this.world[this.current_location].exits.includes(filename)) {
                return `\u001b[31mError: Cannot create file '${filename}'. A directory with that name already exists.\u001b[0m`;
            }
            
            if (this.world[this.current_location].items.includes(filename)) {
                return `Updated timestamp of ${filename}`;
            }
            
            // Create new empty file
            this.world[this.current_location].items.push(filename);
            this.files[filename] = "";
            
            return `Created file: ${filename}`;
        }
        
        else if (cmd === "rm") {
            if (!args.length) {
                return "\u001b[31mError: Specify a file to remove. Usage: 'rm [filename]'.\u001b[0m";
            }
            
            const filename = args[0];
            
            // Check if trying to remove a directory
            if (this.world[this.current_location].exits.includes(filename)) {
                return `\u001b[31mError: '${filename}' is a directory. Current permissions do not allow directory removal.\u001b[0m`;
            }
            
            if (!this.world[this.current_location].items.includes(filename)) {
                return `\u001b[31mError: Cannot remove '${filename}': File does not exist.\u001b[0m`;
            }
            
            // Special warning for important files like treasure.json
            if (filename === "treasure.json" || filename === "mission.txt") {
                // Check if this is the second attempt to remove this file
                const rmAttempts = this.history.filter(cmd => cmd === `rm ${filename}`).length;
                
                if (rmAttempts === 1) {
                    return `\u001b[31mError: You're attempting to remove a crucial file '${filename}'. This action may impact your mission progress. Confirm by running the command again.\u001b[0m`;
                }
            }
            
            // Remove the file
            const index = this.world[this.current_location].items.indexOf(filename);
            this.world[this.current_location].items.splice(index, 1);
            
            if (filename in this.files) {
                delete this.files[filename];
            }
            
            return `Removed: ${filename}`;
        }
        
        else if (cmd === "mv") {
            if (args.length < 2) {
                return "\u001b[31mError: Missing arguments. Proper usage is 'mv [source] [destination]'.\u001b[0m";
            }
            
            if (args.length > 2) {
                return "\u001b[31mError: Too many arguments provided. Use 'help' to confirm proper command usage.\u001b[0m";
            }
            
            const source = args[0];
            const destination = args[1];
            
            // Handle paths in source - users trying to reference files from other directories
            if (source.includes('/')) {
                // Extract the path components
                const pathParts = source.split('/');
                const filename = pathParts.pop(); // Get the filename (last part)
                const firstDir = pathParts[0];
                
                // Specifically handle the example case from the challenge
                if (source.includes('projects/hidden_vault/treasure.json')) {
                    return `\u001b[31mError: Cannot move '${source}': File does not exist here.\n\nTo access this file, you need to navigate to it first:\ncd projects\ncd hidden_vault\nmv treasure.json ${destination}\u001b[0m`;
                }
                
                // Generic path handling
                if (firstDir === '~' || firstDir === 'home' || this.world[this.current_location].exits.includes(firstDir)) {
                    return `\u001b[31mError: Cannot move '${source}': You must first navigate to the directory containing the file.\u001b[0m`;
                }
                
                return `\u001b[31mError: Cannot move '${source}': File does not exist here.\u001b[0m`;
            }
            
            // Check if source exists in current location (except for special cases below)
            if (!this.world[this.current_location].items.includes(source) && source !== "treasure.json") {
                return `\u001b[31mError: Cannot move '${source}': File does not exist here.\u001b[0m`;
            }
            
            // Check if trying to move into itself
            if (source === destination) {
                return `\u001b[31mError: Invalid operation. Cannot move '${source}' into itself.\u001b[0m`;
            }
            
            // Special case for moving treasure.json to archive/relics to complete mission
            if (source === "treasure.json" && 
                this.current_location === "hidden_vault" && 
                (destination === "archive/relics/treasure.json" || 
                 destination === "~/home" || 
                 destination.startsWith("/") ||
                 destination.includes("archive"))) {
                
                // Check if we're moving to home directory
                if (destination === "~/home" || destination === "/home") {
                    // Remove from hidden_vault
                    const index = this.world["hidden_vault"].items.indexOf("treasure.json");
                    this.world["hidden_vault"].items.splice(index, 1);
                    
                    // Add to home
                    if (!this.world["home"].items.includes("treasure.json")) {
                        this.world["home"].items.push("treasure.json");
                    }
                    
                    return `Moved treasure.json to ${destination}`;
                }
                // Check if archive and relics exist for mission completion
                else if ("archive" in this.world && this.world["archive"].exits.includes("relics") && "relics" in this.world) {
                    // Remove from hidden_vault
                    const index = this.world["hidden_vault"].items.indexOf("treasure.json");
                    this.world["hidden_vault"].items.splice(index, 1);
                    
                    // Add to relics
                    if (!this.world["relics"].items.includes("treasure.json")) {
                        this.world["relics"].items.push("treasure.json");
                    }
                    
                    // Set mission complete flag
                    this.mission_complete = true;
                    
                    return "\u001b[32m🎉 MISSION ACCOMPLISHED! 🎉\u001b[0m\nYou've successfully returned the treasure to its rightful place in archive/relics!";
                } else {
                    if (!("archive" in this.world)) {
                        return `\u001b[31mError: Cannot move '${source}': Destination 'archive' not found.\u001b[0m\n\nHint: You need to extract archive.zip first using 'unzip archive.zip' in the downloads directory.`;
                    } else {
                        return "\u001b[31mError: Cannot move to 'relics': Directory not found.\u001b[0m\n\nHint: You need to create the relics directory inside archive using 'mkdir relics'.";
                    }
                }
            }
            
            // Additional support for moving files with paths, similar to treasure.json
            if (destination.startsWith('/') || destination.includes('/')) {
                // Only allow this for files that exist in the current location
                if (this.world[this.current_location].items.includes(source)) {
                    // Parse the destination path
                    const pathParts = destination.replace(/^\/+/, '').split('/');
                    
                    // For paths like /downloads/archive/relics
                    if (pathParts.length >= 2) {
                        const targetDir = pathParts[0];
                        
                        // Check if the target directory exists
                        if (targetDir in this.world) {
                            // Basic check for direct children
                            if (this.world[targetDir].exits.includes(pathParts[1])) {
                                // Move the file
                                const index = this.world[this.current_location].items.indexOf(source);
                                if (index > -1) {
                                    this.world[this.current_location].items.splice(index, 1);
                                }
                                
                                // Add to target directory
                                const targetSubdir = pathParts[1]; 
                                if (this.world[targetSubdir] && !this.world[targetSubdir].items.includes(source)) {
                                    this.world[targetSubdir].items.push(source);
                                    return `Moved ${source} to ${targetDir}/${targetSubdir}`;
                                }
                            }
                        }
                    }
                }
                
                // Default error message for path-based moves
                return `\u001b[31mError: Cannot move files between directories using paths. You need to:\n1. Navigate to the source directory with 'cd'\n2. Move the file to the destination directory\n\nExample:\ncd downloads\ncd archive\nmv file.txt relics\u001b[0m`;
            }
            
            // Additional check for source file (should not be triggered due to our earlier check, but keeping for safety)
            if (!this.world[this.current_location].items.includes(source)) {
                return `\u001b[31mError: Cannot move '${source}': File does not exist.\u001b[0m`;
            }
            
            // Check if destination is a relative or absolute path
            if (destination.includes('/') || destination.startsWith('~') || destination === '..' || destination.startsWith('./')) {
                // Handle parent directory case
                if (destination === '..') {
                    // Find parent directory
                    let parentDir = null;
                    
                    // Look for the parent of the current location
                    for (const [dir, data] of Object.entries(this.world)) {
                        if (data.exits.includes(this.current_location)) {
                            parentDir = dir;
                            break;
                        }
                    }
                    
                    if (!parentDir) {
                        return `\u001b[31mError: Cannot determine parent directory.\u001b[0m`;
                    }
                    
                    // Special case for moving treasure.json from hidden_vault to its parent (projects)
                    if (source === "treasure.json" && this.current_location === "hidden_vault") {
                        // Remove from hidden_vault
                        const index = this.world["hidden_vault"].items.indexOf("treasure.json");
                        if (index > -1) {
                            this.world["hidden_vault"].items.splice(index, 1);
                        }
                        
                        // Add to parent directory
                        if (!this.world[parentDir].items.includes("treasure.json")) {
                            this.world[parentDir].items.push("treasure.json");
                        }
                        
                        return `Moved ${source} to ${parentDir}`;
                    }
                    
                    // For other files and directories, handle parent directory move
                    if (source !== "treasure.json") {
                        return `\u001b[31mError: For security reasons, moving to parent directory is only supported for the special treasure.json file.\u001b[0m`;
                    }
                    
                    // Allow moving treasure.json to parent directory from any location, not just hidden_vault
                    const index = this.world[this.current_location].items.indexOf("treasure.json");
                    if (index > -1) {
                        this.world[this.current_location].items.splice(index, 1);
                        
                        // Add to parent directory
                        if (!this.world[parentDir].items.includes("treasure.json")) {
                            this.world[parentDir].items.push("treasure.json");
                        }
                        
                        return `Moved ${source} to ${parentDir}`;
                    }
                }
                
                // Parse the path components for other paths
                let targetDir = destination.split('/')[0];
                
                // Handle home shortcut
                if (targetDir === '~' || targetDir === '' || targetDir === '.') {
                    targetDir = 'home';
                }
                
                // Check if the specified directory exists
                if (!(targetDir in this.world)) {
                    return `\u001b[31mError: Cannot move to '${destination}'. Directory '${targetDir}' does not exist.\u001b[0m`;
                }
                
                // Special case for treasure.json - this is required for the game mission
                if (source === "treasure.json" && (
                    destination.includes("archive/relics") || 
                    destination.startsWith("archive/") ||
                    destination.startsWith("/archive/") ||
                    destination === "archive" ||
                    destination === "relics"
                )) {
                    // Check if archive exists
                    if (!("archive" in this.world)) {
                        return `\u001b[31mError: Directory 'archive' does not exist. You need to unzip the archive.zip file first.\u001b[0m`;
                    }
                    
                    // Check if relics exists 
                    if (!this.world["archive"].exits.includes("relics") && destination.includes("relics")) {
                        return `\u001b[31mError: Directory 'relics' does not exist. Create it with 'mkdir relics' when in the archive directory.\u001b[0m`;
                    }
                    
                    // If in the hidden_vault with treasure.json, allow the move to archive/relics
                    if (this.current_location === "hidden_vault") {
                        // Remove treasure from hidden_vault
                        const index = this.world["hidden_vault"].items.indexOf("treasure.json");
                        if (index > -1) {
                            this.world["hidden_vault"].items.splice(index, 1);
                        }
                        
                        // Add to relics directory - properly check if relics exists
                        if ("archive" in this.world && this.world["archive"].exits.includes("relics") && "relics" in this.world && !this.world["relics"].items.includes("treasure.json")) {
                            this.world["relics"].items.push("treasure.json");
                            this.mission_complete = true;
                            return "\u001b[32m🎉 MISSION ACCOMPLISHED! 🎉\u001b[0m\nYou've successfully returned the treasure to its rightful place in archive/relics!";
                        } else {
                            // Add to archive if relics doesn't exist yet
                            this.world["archive"].items.push("treasure.json");
                            return `Moved treasure.json to archive. Now create the relics directory and move it there to complete your mission.`;
                        }
                    } else if (this.world[this.current_location].items.includes("treasure.json")) {
                        // Allow moving treasure.json from any location to archive/relics
                        const index = this.world[this.current_location].items.indexOf("treasure.json");
                        if (index > -1) {
                            this.world[this.current_location].items.splice(index, 1);
                            
                            if ("relics" in this.world && this.world["archive"].exits.includes("relics")) {
                                this.world["relics"].items.push("treasure.json");
                                this.mission_complete = true;
                                return "\u001b[32m🎉 MISSION ACCOMPLISHED! 🎉\u001b[0m\nYou've successfully returned the treasure to its rightful place in archive/relics!";
                            } else {
                                this.world["archive"].items.push("treasure.json");
                                return `Moved treasure.json to archive. Now create the relics directory and move it there to complete your mission.`;
                            }
                        }
                    } else {
                        return `\u001b[31mError: The treasure.json file is not in the current directory.\u001b[0m`;
                    }
                }
                
                // This section should no longer be reached due to our earlier changes,
                // but keeping it as a fallback error handler for compatibility
                if (destination.includes('/') || source.includes('/')) {
                    // Extra support for moving normal files with paths, similar to treasure.json
                    // This block will only run for normal files with paths that weren't caught earlier
                    
                    // Check if we're moving to a specific subdirectory
                    if (destination.startsWith('/') || destination.includes('/')) {
                        // For paths that match directory structures like /downloads/archive/relics
                        const targetParts = destination.replace(/^\/+/, '').split('/');
                        if (targetParts.length >= 2) {
                            const targetDir = targetParts[0];
                            
                            // Only show the hint if there's a valid structure
                            if (targetDir in this.world) {
                                return `\u001b[31mError: Cannot move files between directories using paths. You need to:\n1. Navigate to the source directory with 'cd'\n2. Move the file to the destination directory\n\nExample:\ncd downloads\ncd archive\nmv file.txt relics\u001b[0m`;
                            }
                        }
                    }
                    
                    // Check if this is a common path pattern like "home/directory/file"
                    const invalidPaths = ["home/projects", "projects/hidden_vault", "downloads/archive"];
                    for (const invalidPath of invalidPaths) {
                        if (source.includes(invalidPath) || destination.includes(invalidPath)) {
                            return `\u001b[31mError: Cannot move files between directories using paths. You need to:\n1. Navigate to the source directory with 'cd'\n2. Move the file to the destination directory\n\nExample:\ncd ${invalidPath.split('/')[0]}\ncd ${invalidPath.split('/')[1]}\nmv ${source.split('/').pop()} ${destination.split('/').pop()}\u001b[0m`;
                        }
                    }
                    
                    // Generic message for other cross-directory moves
                    return `\u001b[31mError: Cannot perform this cross-directory move. You need to navigate to the directory containing the file first.\n\nTip: Only the mission objective (moving treasure.json to archive/relics) supports cross-directory paths.\u001b[0m`;
                }
            }
            
            // Regular move/rename within the same directory
            const index = this.world[this.current_location].items.indexOf(source);
            this.world[this.current_location].items.splice(index, 1);
            this.world[this.current_location].items.push(destination);
            
            if (source in this.files) {
                this.files[destination] = this.files[source];
                delete this.files[source];
            }
            
            return `Moved ${source} to ${destination}`;
        }
        
        else if (cmd === "cp") {
            if (args.length < 2) {
                return "\u001b[31mError: Missing arguments. Proper usage is 'cp [source] [destination]'.\u001b[0m";
            }
            
            if (args.length > 2) {
                return "\u001b[31mError: Too many arguments provided. Use 'help' to confirm proper command usage.\u001b[0m";
            }
            
            const source = args[0];
            const destination = args[1];
            
            // Check if trying to copy into itself
            if (source === destination) {
                return `\u001b[31mError: Invalid operation. Cannot copy '${source}' into itself.\u001b[0m`;
            }
            
            // Check if source exists
            if (!this.world[this.current_location].items.includes(source)) {
                return `\u001b[31mError: Cannot copy '${source}': File does not exist here.\u001b[0m`;
            }
            
            // Check if destination already exists
            if (this.world[this.current_location].items.includes(destination)) {
                return `\u001b[31mError: '${destination}' already exists. Cannot overwrite existing file.\u001b[0m`;
            }
            
            // Copy the file
            this.world[this.current_location].items.push(destination);
            
            if (source in this.files) {
                this.files[destination] = this.files[source];
            }
            
            return `Copied ${source} to ${destination}`;
        }
        
        else if (cmd === "unzip") {
            if (!args.length) {
                return "\u001b[31mError: Specify a file to unzip. Usage: 'unzip [filename.zip]'.\u001b[0m";
            }
            
            const zipfile = args[0];
            
            // Check if file exists
            if (!this.world[this.current_location].items.includes(zipfile)) {
                return `\u001b[31mError: Zip archive '${zipfile}' not found.\u001b[0m`;
            }
            
            // Check if it's a zip file
            if (!zipfile.endsWith('.zip')) {
                return `\u001b[31mError: '${zipfile}' is not a zip file. Use 'ls' to check available files.\u001b[0m`;
            }
            
            // Check for archive.zip specifically in downloads
            if (this.current_location !== "downloads" || zipfile !== "archive.zip") {
                return `\u001b[31mError: '${zipfile}' is not a valid zip archive for this mission.\u001b[0m`;
            }
            
            // Check if already extracted
            if ("archive" in this.world) {
                return `\u001b[31mWarning: Archive already extracted. Files already exist here.\u001b[0m\n\nHint: Archive is already extracted. Continue with your mission!`;
            }
            
            // "Extract" the archive by adding it to the world
            Object.assign(this.world, createArchive());
            this.world["downloads"].exits.push("archive");
            
            // Add contents to the files dict
            this.files["README.txt"] = "Archive contents. These files were recovered from an ancient system.";
            this.files["data.csv"] = "item,value\napple,1\nbanana,2\ntreasure,1000000";
            
            return "Archive extracted successfully. You can now access the 'archive' directory.";
        }
        
        else if (cmd === "exit") {
            return "Thanks for playing CLI Adventures!";
        }
        
        else {
            // Suggest similar commands for typos
            const availableCommands = ['help', 'ls', 'cd', 'cat', 'pwd', 'mkdir', 'touch', 'rm', 'mv', 'cp', 'clear', 'reset', 'unzip', 'exit'];
            
            // Find the closest command using basic string similarity
            let closestCommand = '';
            let closestDistance = Infinity;
            
            for (const command of availableCommands) {
                // Simple way to calculate string distance (not true Levenshtein)
                const distance = Math.abs(command.length - cmd.length);
                
                // Check if the command contains at least half of the letters from the input
                let matchingChars = 0;
                for (let i = 0; i < cmd.length; i++) {
                    if (command.includes(cmd[i])) {
                        matchingChars++;
                    }
                }
                
                // If enough characters match and distance is low, consider it a potential match
                if (matchingChars >= cmd.length / 2 && distance < closestDistance) {
                    closestDistance = distance;
                    closestCommand = command;
                }
            }
            
            // If we found a reasonably close command and it's not an exact match
            if (closestCommand && closestCommand !== cmd && cmd.length > 1) {
                return `\u001b[31mError: Command '${cmd}' not recognized. Did you mean '${closestCommand}'?\u001b[0m`;
            }
            
            return `\u001b[31mError: Command not recognized. Type 'help' for a list of valid commands.\u001b[0m`;
        }
    };
    
    // Get current challenge
    this.getCurrentChallenge = function() {
        const incomplete = this.lessons.filter(lesson => !this.completed_lessons.has(lesson.id));
        if (incomplete.length > 0) {
            return incomplete[0];
        }
        return {
            "description": "All challenges completed! Explore freely!",
            "challenge": "All challenges completed! Explore freely.",
            "hint": "Try creating, copying, moving and removing your own files."
        };
    };
}
