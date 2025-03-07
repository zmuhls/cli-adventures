document.addEventListener('DOMContentLoaded', () => {
    const outputElement = document.getElementById('output');
    const commandInput = document.getElementById('commandInput');
    const promptElement = document.querySelector('.prompt');
    const currentChallengeElement = document.getElementById('current-challenge');
    const hintToggle = document.querySelector('.hint-toggle');
    const hintText = document.querySelector('.hint-text');
    const terminalWindow = document.querySelector('.terminal-window');
    const terminalHeader = document.querySelector('.terminal-header');
    
    let commandHistory = [];
    let historyIndex = -1;
    let currentLocation = 'home';
    
    // Game state
    const game = new CLIGame();
    
    // Make terminal window draggable
    makeDraggable(terminalWindow, terminalHeader);
    
    // Initialize command input focus
    commandInput.focus();
    
    // Support copy-paste functionality
    document.addEventListener('copy', (e) => {
        // Let the browser handle copy normally
        // This allows users to select and copy text normally
    });
    
    document.addEventListener('paste', (e) => {
        // If the command input has focus, let the browser handle paste
        if (document.activeElement === commandInput) {
            return;
        }
        
        // Otherwise, we'll paste into the command input
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        commandInput.value = paste;
        commandInput.focus();
        
        // Prevent the default paste behavior
        e.preventDefault();
    });
    
    // Set focus back to input when clicking anywhere in the terminal, but allow text selection
    document.querySelector('.terminal-body').addEventListener('mouseup', (e) => {
        // Check if text is selected
        const selection = window.getSelection();
        if (selection.toString().length === 0) {
            // Only focus the input if no text is selected
            commandInput.focus();
        }
    });
    
    // Toggle hint visibility
    hintToggle.addEventListener('click', () => {
        if (hintText.style.display === 'block') {
            hintText.style.display = 'none';
        } else {
            hintText.style.display = 'block';
        }
    });
    
    // Handle command execution
    commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const command = commandInput.value.trim();
            
            if (command) {
                // Add command to history
                commandHistory.push(command);
                historyIndex = commandHistory.length;
                
                // Display command
                const commandDiv = document.createElement('div');
                commandDiv.className = 'command-output';
                commandDiv.innerHTML = `<span class="prompt">${promptElement.textContent}</span> ${command}`;
                outputElement.appendChild(commandDiv);
                
                // Process command via our game logic
                processCommand(command);
                
                // Clear input
                commandInput.value = '';
                
                // Scroll to bottom
                outputElement.scrollTop = outputElement.scrollHeight;
            }
        } 
        // Command history navigation
        else if (e.key === 'ArrowUp') {
            if (historyIndex > 0) {
                historyIndex--;
                commandInput.value = commandHistory[historyIndex];
            }
            e.preventDefault();
        } 
        else if (e.key === 'ArrowDown') {
            if (historyIndex < commandHistory.length - 1) {
                historyIndex++;
                commandInput.value = commandHistory[historyIndex];
            } else {
                historyIndex = commandHistory.length;
                commandInput.value = '';
            }
            e.preventDefault();
        }
        // Tab completion (basic)
        else if (e.key === 'Tab') {
            e.preventDefault();
            // Could implement tab completion here
        }
    });
    
    // Process command with client-side game logic
    function processCommand(command) {
        // Get result from game logic
        const data = game.processCommand(command);
        
        // Update location
        if (data.location !== currentLocation) {
            currentLocation = data.location;
            updatePrompt();
        }
        
        // Handle clear command
        if (command === 'clear') {
            // Clear the terminal output except for the last command
            const lastCommand = outputElement.lastChild;
            outputElement.innerHTML = '';
            outputElement.appendChild(lastCommand);
        } else {
            const outputDiv = document.createElement('div');
            outputDiv.className = 'command-output';
            
            // Parse terminal colors in the output
            const formattedOutput = formatOutput(data.result);
            outputDiv.innerHTML = formattedOutput;
            
            outputElement.appendChild(outputDiv);
        }
        
        // Update challenge and hint
        currentChallengeElement.textContent = data.challenge;
        hintText.textContent = data.challenge_hint || 'No hint available for this challenge.';
        
        // Auto-scroll to bottom
        outputElement.scrollTop = outputElement.scrollHeight;
    }
    
    // Format output with ANSI color codes
    function formatOutput(text) {
        if (!text) return '';
        
        // Replace ANSI escape sequences with appropriate HTML classes
        // ANSI blue (directories)
        text = text.replace(/\u001b\[34m([^\u001b]*)\u001b\[0m/g, '<span class="directory">$1</span>');
        // ANSI green (success messages)
        text = text.replace(/\u001b\[32m([^\u001b]*)\u001b\[0m/g, '<span class="success">$1</span>');
        // ANSI red (errors)
        text = text.replace(/\u001b\[31m([^\u001b]*)\u001b\[0m/g, '<span class="error">$1</span>');
        // Clear screen code
        if (text.includes('\u001b[2J\u001b[H')) {
            return ''; // Will trigger a clear
        }
        
        // Replace newlines with <br>
        text = text.replace(/\n/g, '<br>');
        
        return text;
    }
    
    // Update the prompt based on current location
    function updatePrompt() {
        // Extract the actual directory name from the location
        // Handle namespaced directories like "parent_child"
        let displayName = currentLocation;
        
        // If it's a namespaced directory, only show the part after the underscore
        if (currentLocation.includes('_')) {
            displayName = currentLocation.split('_').pop();
        }
        
        promptElement.textContent = `/${displayName}$`;
    }
    
    // Function to make an element draggable with mouse and touch support
    function makeDraggable(element, handle) {
        // Track initial positions and state
        let startX, startY, startLeft, startTop;
        let isDragging = false;
        
        // Detect narrow viewports (less than 50% of standard desktop width)
        const narrowViewportMediaQuery = window.matchMedia("(max-width: 960px)");
        let isNarrowViewport = narrowViewportMediaQuery.matches;
        
        // Mobile detection 
        const mobileMediaQuery = window.matchMedia("(max-width: 768px)");
        let isMobile = mobileMediaQuery.matches;
        
        // Set up drag triggers on the handle or the entire element
        const dragHandle = handle || element;
        updateDragCursor();
        
        // Mouse events
        dragHandle.addEventListener('mousedown', startDrag);
        
        // Touch events (with passive: false to allow preventDefault)
        dragHandle.addEventListener('touchstart', startDragTouch, { passive: false });
        
        // Resize handler to adapt to viewport changes
        window.addEventListener('resize', handleResize);
        
        // Initial positioning setup
        setupInitialPosition();
        
        // Update cursor based on draggability
        function updateDragCursor() {
            dragHandle.style.cursor = isNarrowViewport ? 'default' : 'move';
        }
        
        // Set up initial position based on viewport size
        function setupInitialPosition() {
            if (isMobile) {
                // Mobile: centered, relative positioning
                element.style.position = 'relative';
                element.style.top = '';
                element.style.left = '';
                element.style.margin = '20px auto';
            } else {
                // Desktop: absolute positioning with set coordinates
                element.style.position = 'absolute';
                
                // If not already positioned, set initial position
                if (!element.style.top || element.style.top === '') {
                    element.style.top = '5%';
                }
                if (!element.style.left || element.style.left === '') {
                    element.style.left = '5%';
                }
                
                // Ensure it's within bounds
                constrainToViewport();
            }
        }
        
        // Handle window resize events
        function handleResize() {
            // Update viewport states
            const wasNarrowViewport = isNarrowViewport;
            isNarrowViewport = narrowViewportMediaQuery.matches;
            
            const wasMobile = isMobile;
            isMobile = mobileMediaQuery.matches;
            
            // Update cursor when viewport size changes
            updateDragCursor();
            
            // If switching between mobile and desktop modes, reset positioning
            if (wasMobile !== isMobile || wasNarrowViewport !== isNarrowViewport) {
                // If we're now in a narrow viewport, force the terminal back to default position
                if (isNarrowViewport && element.style.position === 'absolute') {
                    element.style.position = 'relative';
                    element.style.top = '';
                    element.style.left = '';
                    element.style.margin = '20px auto';
                    element.style.zIndex = '';
                } else {
                    setupInitialPosition();
                }
            } else if (!isMobile && !isNarrowViewport) {
                // On regular desktop resize, ensure the window stays in viewport
                constrainToViewport();
            }
        }
        
        // Keep element within viewport bounds
        function constrainToViewport() {
            const rect = element.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Ensure at least part of the element is visible
            const minVisibleWidth = Math.min(150, rect.width / 2);
            const minVisibleHeight = Math.min(100, rect.height / 3);
            
            // Calculate current absolute position
            let currentLeft = parseInt(element.style.left) || 0;
            let currentTop = parseInt(element.style.top) || 0;
            
            // Constrain to viewport edges
            if (rect.right < minVisibleWidth) {
                currentLeft = minVisibleWidth - rect.width;
            } else if (rect.left > viewportWidth - minVisibleWidth) {
                currentLeft = viewportWidth - minVisibleWidth;
            }
            
            if (rect.bottom < minVisibleHeight) {
                currentTop = minVisibleHeight - rect.height;
            } else if (rect.top > viewportHeight - minVisibleHeight) {
                currentTop = viewportHeight - minVisibleHeight;
            }
            
            // Apply constraints
            element.style.left = currentLeft + 'px';
            element.style.top = currentTop + 'px';
        }
        
        // Start dragging (mouse)
        function startDrag(e) {
            e.preventDefault();
            
            // Don't allow dragging in narrow viewport
            if (isNarrowViewport) {
                // Set focus back to command input
                document.getElementById('commandInput').focus();
                return;
            }
            
            isDragging = true;
            
            // Record starting positions
            startX = e.clientX;
            startY = e.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            
            // Add dragging visual indicator
            element.classList.add('dragging');
            
            // Set up move and end event listeners
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        }
        
        // Start dragging (touch)
        function startDragTouch(e) {
            e.preventDefault();
            
            // Don't allow dragging in narrow viewport
            if (isNarrowViewport) {
                return;
            }
            
            isDragging = true;
            
            const touch = e.touches[0];
            
            // Record starting positions
            startX = touch.clientX;
            startY = touch.clientY;
            startLeft = parseInt(element.style.left) || 0;
            startTop = parseInt(element.style.top) || 0;
            
            // Add dragging visual indicator
            element.classList.add('dragging');
            
            // Set up move and end event listeners
            document.addEventListener('touchmove', dragTouch, { passive: false });
            document.addEventListener('touchend', stopDragTouch);
        }
        
        // Handle drag movement (mouse)
        function drag(e) {
            if (!isDragging) return;
            
            e.preventDefault();
            
            // Calculate the distance moved
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // Apply new position with fixed-based calculation (more stable)
            element.style.left = (startLeft + dx) + 'px';
            element.style.top = (startTop + dy) + 'px';
        }
        
        // Handle drag movement (touch)
        function dragTouch(e) {
            if (!isDragging) return;
            
            e.preventDefault();
            
            const touch = e.touches[0];
            
            // Calculate the distance moved
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            
            // Apply new position with fixed-based calculation (more stable)
            element.style.left = (startLeft + dx) + 'px';
            element.style.top = (startTop + dy) + 'px';
        }
        
        // Stop dragging (mouse)
        function stopDrag() {
            if (!isDragging) return;
            
            isDragging = false;
            element.classList.remove('dragging');
            
            // Clean up event listeners
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
            
            // Ensure the element is within bounds
            constrainToViewport();
            
            // Set z-index high to keep terminal on top after dragging
            element.style.zIndex = '100';
            
            // Refocus the command input
            document.getElementById('commandInput').focus();
        }
        
        // Stop dragging (touch)
        function stopDragTouch() {
            if (!isDragging) return;
            
            isDragging = false;
            element.classList.remove('dragging');
            
            // Clean up event listeners
            document.removeEventListener('touchmove', dragTouch);
            document.removeEventListener('touchend', stopDragTouch);
            
            // Ensure the element is within bounds
            constrainToViewport();
            
            // Set z-index high to keep terminal on top after dragging
            element.style.zIndex = '100';
            
            // Refocus the command input
            document.getElementById('commandInput').focus();
        }
    }

    // CLIGame class - client-side implementation of game logic
    function CLIGame() {
        this.current_location = "home";
        this.inventory = [];
        this.completed_lessons = new Set();
        this.history = [];
        
        // Game map/world
        this.world = {
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
        
        // File contents
        this.files = {
            "notes.txt": "Welcome to CLI Adventures!\nType 'help' to see available commands.",
            "mission.txt": "MISSION BRIEFING:\nA precious treasure.json file has been stolen from the archive.zip/relics folder!\nThe thief has hidden it in the hidden_vault directory.\n\nYour mission:\n1. Find and recover the treasure.json file\n2. Use unzip command to extract the archive.zip\n3. Create a 'relics' directory inside the extracted archive if it doesn't exist\n4. Move the treasure.json file to its rightful place in archive/relics\n\nGood luck, agent!",
            "secret.txt": "The password is 'opensesame'",
            "README.md": "# Project Documentation\nUse 'ls' to list files\nUse 'cd' to change directories\nUse 'cat' to read files",
            "treasure.json": JSON.stringify({"reward": "You've mastered basic CLI commands!", "value": "$1,000,000", "origin": "archive/relics"})
        };
        
        // Archive contents (to be "extracted" when unzip is used)
        this.archive_contents = {
            "archive": {
                "description": "Contents of the extracted archive",
                "items": ["README.txt", "data.csv"],
                "exits": ["downloads"]
            }
        };
        
        // Flag to track if mission is complete
        this.mission_complete = false;
        
        // Lessons and challenges
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
                "success_condition": (cmd, args) => cmd === "cd" && args.length && ["documents", "downloads", "projects"].includes(args[0]),
                "hint": "Type 'cd' followed by a directory name like 'cd documents' or 'cd downloads'"
            },
            {
                "id": "cat",
                "description": "View file contents using 'cat'",
                "challenge": "Read the contents of any text file",
                "success_condition": (cmd, args) => cmd === "cat" && args.length && 
                    this.world[this.current_location].items.includes(args[0]) && this.files[args[0]] !== undefined,
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
                "success_condition": (cmd, args) => cmd === "cd" && args.length && args[0] === "..",
                "hint": "First 'cd' to a directory, then type 'cd ..' to go back up one level"
            },
            {
                "id": "mission_brief",
                "description": "Read your mission briefing",
                "challenge": "Read the mission.txt file in your home directory",
                "success_condition": (cmd, args) => cmd === "cat" && args.length && args[0] === "mission.txt",
                "hint": "Use 'cat mission.txt' in your home directory to read your mission briefing"
            },
            {
                "id": "find_treasure",
                "description": "Locate the stolen treasure",
                "challenge": "Navigate to the hidden_vault and verify the treasure.json file is there",
                "success_condition": (cmd, args) => cmd === "ls" && this.current_location === "hidden_vault",
                "hint": "First go to the projects directory with 'cd projects', then to 'cd hidden_vault'"
            },
            {
                "id": "unzip_archive",
                "description": "Extract the archive.zip file",
                "challenge": "Use the unzip command on archive.zip in the downloads directory",
                "success_condition": (cmd, args) => cmd === "unzip" && args.length && args[0] === "archive.zip" && this.current_location === "downloads",
                "hint": "First go to downloads with 'cd downloads', then use 'unzip archive.zip'"
            },
            {
                "id": "create_relics",
                "description": "Create the missing relics directory",
                "challenge": "Create a relics directory inside the archive directory",
                "success_condition": (cmd, args) => cmd === "mkdir" && args.length && args[0] === "relics" && this.current_location === "archive",
                "hint": "Navigate to the archive directory and use 'mkdir relics'"
            },
            {
                "id": "mission_complete",
                "description": "Return the treasure to its rightful place",
                "challenge": "Move the treasure.json file from hidden_vault to archive/relics",
                "success_condition": (cmd, args) => this.mission_complete,
                "hint": "First get the treasure.json file, then move it to the archive/relics directory"
            }
        ];
        
        // Process commands
        this.processCommand = function(command) {
            if (!command) {
                return {
                    result: "Please enter a command",
                    location: this.current_location,
                    challenge: this.getCurrentChallenge().description,
                    challenge_hint: this.getCurrentChallenge().hint || ""
                };
            }
            
            const parts = command.trim().split(' ');
            const cmd = parts[0].toLowerCase();
            const args = parts.slice(1);
            
            // Save command to history
            this.history.push(command);
            
            // Check for lesson completion - only check the next incomplete lesson
            const incompleteLessons = this.lessons.filter(lesson => !this.completed_lessons.has(lesson.id));
            if (incompleteLessons.length > 0 && incompleteLessons[0].success_condition(cmd, args)) {
                const lesson = incompleteLessons[0];
                this.completed_lessons.add(lesson.id);
                const result = `🎉 Challenge completed: ${lesson.description}\n` + this._executeCommand(cmd, args);
                
                return {
                    result: result,
                    location: this.current_location,
                    challenge: this.getCurrentChallenge().description,
                    challenge_hint: this.getCurrentChallenge().hint || ""
                };
            }
            
            const result = this._executeCommand(cmd, args);
            return {
                result: result,
                location: this.current_location,
                challenge: this.getCurrentChallenge().description,
                challenge_hint: this.getCurrentChallenge().hint || ""
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
                const location = this.world[this.current_location];
                
                // Filter exits to prevent circular references
                const filteredExits = [];
                for (const exitDir of location.exits) {
                    // Skip parent directory (already accessed via cd ..)
                    if (this.current_location.includes("_") && exitDir === this.current_location.split("_")[0]) {
                        continue;
                    }
                    
                    // Skip directories that would cause a double navigation
                    const namespacedKey = `${this.current_location}_${exitDir}`;
                    if (exitDir in this.world && !(namespacedKey in this.world)) {
                        // Check if current location is already a child of this exit
                        let isParent = false;
                        for (const parentExit of this.world[exitDir].exits) {
                            if (parentExit === this.current_location || 
                                (this.current_location.includes("_") && 
                                parentExit === this.current_location.split("_").pop())) {
                                isParent = true;
                                break;
                            }
                        }
                        
                        if (!isParent) {
                            filteredExits.push(exitDir);
                        }
                    } else {
                        filteredExits.push(exitDir);
                    }
                }
                
                return location.items.join(" ") + " " + 
                    filteredExits.map(exit => `\u001b[34m${exit}\u001b[0m`).join(" ");
            }
            
            else if (cmd === "cd") {
                if (!args.length) {
                    return "Usage: cd [directory]";
                }
                
                const destination = args[0];
                
                // Handle cd .. (move to parent directory)
                if (destination === "..") {
                    // Find the parent directory that has current location as an exit
                    for (const [parentDir, data] of Object.entries(this.world)) {
                        if (data.exits.includes(this.current_location)) {
                            this.current_location = parentDir;
                            return `Changed directory to ${parentDir}`;
                        }
                    }
                    return "Already at root directory";
                }
                
                // Handle cd ~ (return to home)
                else if (destination === "~" || destination === "home") {
                    this.current_location = "home";
                    return "Changed directory to home";
                }
                
                // Normal directory navigation
                else if (this.world[this.current_location].exits.includes(destination)) {
                    // First check if we have a namespaced version of this directory
                    const namespacedKey = `${this.current_location}_${destination}`;
                    
                    // Try the namespaced key first, then the regular name
                    if (namespacedKey in this.world) {
                        this.current_location = namespacedKey;
                        return `Changed directory to ${destination}`;
                    }
                    // Then check if it's a standard directory
                    else if (destination in this.world) {
                        this.current_location = destination;
                        return `Changed directory to ${destination}`;
                    }
                    else {
                        return `Cannot access ${destination} from current location`;
                    }
                }
                else {
                    return `Cannot find directory: ${destination}`;
                }
            }
            
            else if (cmd === "cat") {
                if (!args.length) {
                    return "Usage: cat [file]";
                }
                
                const filename = args[0];
                if (!this.world[this.current_location].items.includes(filename)) {
                    return `File not found: ${filename}`;
                }
                
                if (!(filename in this.files)) {
                    return `Cannot display contents of ${filename}`;
                }
                
                return this.files[filename];
            }
            
            else if (cmd === "pwd") {
                // Handle namespaced directory display for pwd
                let displayPath = this.current_location;
                
                // If it's a namespaced directory (contains underscore)
                // Only show the display name (part after the underscore)
                if (displayPath.includes("_")) {
                    displayPath = displayPath.split("_").pop();
                }
                
                return `/${displayPath}`;
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
                
                // Reset any changed world state
                this.world = JSON.parse(JSON.stringify({
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
                }));
                
                return "\u001b[2J\u001b[H\n\u001b[32m=== Game Reset ===\u001b[0m\nWelcome to CLI Adventures! Type 'help' to see available commands.";
            }
            
            else if (cmd === "mkdir") {
                if (!args.length) {
                    return "Usage: mkdir [directory]";
                }
                
                const newDir = args[0];
                if (this.world[this.current_location].exits.includes(newDir)) {
                    return `Directory already exists: ${newDir}`;
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
                }
                
                return `Created directory: ${newDir}`;
            }
            
            else if (cmd === "touch") {
                if (!args.length) {
                    return "Usage: touch [filename]";
                }
                
                const filename = args[0];
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
                    return "Usage: rm [filename]";
                }
                
                const filename = args[0];
                if (!this.world[this.current_location].items.includes(filename)) {
                    return `File not found: ${filename}`;
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
                    return "Usage: mv [source] [destination]";
                }
                
                const source = args[0];
                const destination = args[1];
                
                // Special case for moving treasure.json to archive/relics to complete mission
                if (source === "treasure.json" && 
                    this.current_location === "hidden_vault" && 
                    destination === "archive/relics/treasure.json") {
                    
                    // Check if archive and relics exist
                    if ("archive" in this.world && this.world["archive"].exits.includes("relics")) {
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
                        return "You need to create the proper directory structure first (archive/relics).";
                    }
                }
                
                // Check if source exists in current location
                if (!this.world[this.current_location].items.includes(source)) {
                    return `Source file not found: ${source}`;
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
                    return "Usage: cp [source] [destination]";
                }
                
                const source = args[0];
                const destination = args[1];
                
                // Check if source exists
                if (!this.world[this.current_location].items.includes(source)) {
                    return `Source file not found: ${source}`;
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
                    return "Usage: unzip [zipfile]";
                }
                
                const zipfile = args[0];
                
                if (this.current_location !== "downloads" || zipfile !== "archive.zip") {
                    return `Cannot extract ${zipfile}. Make sure you're in the right directory and the file exists.`;
                }
                
                // "Extract" the archive by adding it to the world
                Object.assign(this.world, this.archive_contents);
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
                return `Unknown command: ${cmd}. Type 'help' for available commands.`;
            }
        };
        
        // Get current challenge
        this.getCurrentChallenge = function() {
            const incomplete = this.lessons.filter(lesson => !this.completed_lessons.has(lesson.id));
            if (incomplete.length > 0) {
                return incomplete[0];
            }
            return {"description": "All challenges completed! Explore freely!"};
        };
    }
});