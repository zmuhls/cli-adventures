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
    
    // Always show hints on page load
    hintText.style.display = 'block';
    
    // Game state
    const game = new CLIGame();
    
    // Make terminal window draggable
    makeDraggable(terminalWindow, terminalHeader);
    
    // Initialize command input focus
    commandInput.focus();
    
    // Auto ls function removed to ensure proper ls behavior
    
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
    
    // Toggle hint visibility - but ensure it's always visible on mobile
    hintToggle.addEventListener('click', () => {
        // Do nothing - hints are now always visible
        // This ensures instructions are always available
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
        
        // Use ~ for home directory (standard terminal convention)
        if (displayName === 'home') {
            promptElement.textContent = `~$`;
        } else {
            promptElement.textContent = `/${displayName}$`;
        }
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
        
        // Expose hint text by default on mobile
        if (isMobile || isNarrowViewport) {
            const hintText = document.querySelector('.hint-text');
            if (hintText) {
                hintText.style.display = 'block';
            }
        }
        
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
                element.style.margin = '0 auto 20px auto';
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
            
            // Show hint text for mobile/narrow viewports
            const hintText = document.querySelector('.hint-text');
            if ((isMobile || isNarrowViewport) && hintText) {
                hintText.style.display = 'block';
            }
            
            // Show welcome instructions initially, regardless of viewport
            // This ensures mobile users see instructions without needing to toggle
            document.querySelector('.hint-text').style.display = 'block';
            
            // If switching between mobile and desktop modes, reset positioning
            if (wasMobile !== isMobile || wasNarrowViewport !== isNarrowViewport) {
                // If we're now in a narrow viewport, force the terminal back to default position
                if (isNarrowViewport && element.style.position === 'absolute') {
                    element.style.position = 'relative';
                    element.style.top = '';
                    element.style.left = '';
                    element.style.margin = '0 auto 20px auto';
                    element.style.zIndex = '';
                } else {
                    setupInitialPosition();
                }
            } else if (!isMobile && !isNarrowViewport) {
                // On regular desktop resize, ensure the window stays in viewport
                constrainToViewport();
            }
            
            // Ensure input is properly visible when focused
            document.getElementById('commandInput').addEventListener('focus', function() {
                // Scroll the terminal body to show the input line
                if (isMobile) {
                    const terminalBody = document.querySelector('.terminal-body');
                    const terminalWindow = document.querySelector('.terminal-window');
                    
                    if (terminalBody) {
                        // Scroll to the input
                        terminalBody.scrollTop = terminalBody.scrollHeight;
                        
                        // Ensure the terminal window is in view
                        terminalWindow.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        
                        // Slightly delay a second scroll to overcome browser behavior
                        setTimeout(() => {
                            terminalBody.scrollTop = terminalBody.scrollHeight;
                        }, 100);
                    }
                }
            });
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
                
                // Get command output first, so we can show it properly
                const cmdOutput = this._executeCommand(cmd, args);
                
                // Mark lesson as completed
                this.completed_lessons.add(lesson.id);
                
                // Combine the success message with command output
                const result = `🎉 Challenge completed: ${lesson.description}\n${cmdOutput}`;
                
                return {
                    result: result,
                    location: this.current_location,
                    challenge: this.getCurrentChallenge().description,
                    challenge_hint: this.getCurrentChallenge().hint || ""
                };
            }
            
            // Special handling for common commands without args
            // 'cd' without args should go to home directory
            if (cmd === "cd" && args.length === 0) {
                this.current_location = "home";
                return {
                    result: "Changed directory to home",
                    location: this.current_location,
                    challenge: this.getCurrentChallenge().description,
                    challenge_hint: this.getCurrentChallenge().hint || ""
                };
            }
            
            // First check if the user is trying to run a filename as a command
            // This is a common beginner error
            if (this.world[this.current_location].items.includes(cmd)) {
                return {
                    result: `To view this file, type 'cat ${cmd}' instead.`,
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
                
                // Show all available exits/directories without complex filtering
                // This ensures users can see all available folders in the directory
                const filteredExits = [...location.exits];
                
                // Only filter out parent directories if needed to avoid circular references
                if (this.current_location.includes("_")) {
                    const parentDir = this.current_location.split("_")[0];
                    const index = filteredExits.indexOf(parentDir);
                    if (index > -1) {
                        filteredExits.splice(index, 1);
                    }
                }
                
                // Format directories with ANSI blue color code
                const coloredDirs = filteredExits.map(exit => `\u001b[34m${exit}\u001b[0m`);
                
                // Join files and directories with space between them, ensuring both are displayed
                const items = location.items.join(" ");
                const dirs = coloredDirs.join(" ");
                return items + (items && dirs ? " " : "") + dirs;
            }
            
            else if (cmd === "cd") {
                if (!args.length) {
                    return "Error: Missing directory name. Use 'cd [dir]' to change directories.";
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
                    return "Error: Cannot move above root directory.";
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
                    return `Error: Directory '${destination}' not found.`;
                }
            }
            
            else if (cmd === "cat") {
                if (!args.length) {
                    return "Error: Missing file name. Use 'cat [file]' to view file contents.";
                }
                
                const filename = args[0];
                if (!this.world[this.current_location].items.includes(filename)) {
                    return `Error: File '${filename}' not found.`;
                }
                
                if (!(filename in this.files)) {
                    return `Error: Cannot display contents of '${filename}'.`;
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
                
                // Use standard convention: ~ for home, / for other directories
                if (displayPath === "home") {
                    return "~";
                } else {
                    return `/${displayPath}`;
                }
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
                    return "Error: Missing directory name. Use 'mkdir [dir]' to create a directory.";
                }
                
                const newDir = args[0];
                if (this.world[this.current_location].exits.includes(newDir)) {
                    return `Error: Directory '${newDir}' already exists.`;
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
                    return "Error: Missing file name. Use 'touch [file]' to create a file.";
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
                    return "Error: Missing file name. Use 'rm [file]' to remove a file.";
                }
                
                const filename = args[0];
                if (!this.world[this.current_location].items.includes(filename)) {
                    return `Error: File '${filename}' not found.`;
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
                    return "Error: Missing arguments. Use 'mv [src] [dst]' to move or rename a file.";
                }
                
                const source = args[0];
                const destination = args[1];
                
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
                    else if ("archive" in this.world && this.world["archive"].exits.includes("relics")) {
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
                    return `Error: File '${source}' not found.`;
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
                        return `\u001b[31mError: For security reasons, moving to parent directory is only supported for the special treasure.json file.\u001b[0m`;
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
                            
                            // Add to relics directory
                            if ("relics" in this.world && !this.world["relics"].items.includes("treasure.json")) {
                                this.world["relics"].items.push("treasure.json");
                                this.mission_complete = true;
                                return "\u001b[32m🎉 MISSION ACCOMPLISHED! 🎉\u001b[0m\nYou've successfully returned the treasure to its rightful place in archive/relics!";
                            } else {
                                // Add to archive if relics doesn't exist yet
                                this.world["archive"].items.push("treasure.json");
                                return `Moved treasure.json to archive. Now create the relics directory and move it there to complete your mission.`;
                            }
                        } else {
                            return `\u001b[31mError: The treasure.json file must be moved from the hidden_vault directory.\u001b[0m`;
                        }
                    }
                    
                    // Special case for the example path "home/projects"
                    if (destination.includes("home/projects") || destination.includes("projects/hidden_vault")) {
                        return `\u001b[31mError: Path '${destination}' is not a valid destination. You may need to first cd to the directory and then use mv.\u001b[0m`;
                    }
                    
                    // For other cross-directory moves, provide a helpful error
                    return `\u001b[31mError: For this simple training system, cross-directory moves are only supported for the mission objective (moving treasure.json to archive/relics).\u001b[0m`;
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
                    return "Error: Missing arguments. Use 'cp [src] [dst]' to copy a file.";
                }
                
                const source = args[0];
                const destination = args[1];
                
                // Check if source exists
                if (!this.world[this.current_location].items.includes(source)) {
                    return `Error: File '${source}' not found.`;
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
                    return "Error: Missing archive name. Use 'unzip [file.zip]' to extract a zip file.";
                }
                
                const zipfile = args[0];
                
                if (this.current_location !== "downloads" || zipfile !== "archive.zip") {
                    return `Error: '${zipfile}' is not a valid zip archive.`;
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
                return `Error: Command not recognized. Type 'help' for a list of valid commands.`;
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