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
                
                // Process command
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
    
    // Process command via backend
    function processCommand(command) {
        fetch('/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ command }),
        })
        .then(response => response.json())
        .then(data => {
            // Update location
            if (data.location !== currentLocation) {
                currentLocation = data.location;
                updatePrompt();
            }
            
            // Display command output
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
            
            // Update challenge
            currentChallengeElement.textContent = data.challenge;
            
            // Update hint
            hintText.textContent = data.challenge_hint || 'No hint available for this challenge.';
            
            // Auto-scroll to bottom
            outputElement.scrollTop = outputElement.scrollHeight;
        })
        .catch(error => {
            console.error('Error:', error);
            const errorDiv = document.createElement('div');
            errorDiv.className = 'command-output error';
            errorDiv.textContent = 'Error connecting to server. Please try again.';
            outputElement.appendChild(errorDiv);
        });
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
        promptElement.textContent = `/${currentLocation}$`;
    }
    
    // Function to make an element draggable
    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        
        if (handle) {
            // If a handle is specified, use that for dragging
            handle.onmousedown = dragMouseDown;
        } else {
            // Otherwise, use the whole element
            element.onmousedown = dragMouseDown;
        }
        
        function dragMouseDown(e) {
            e = e || window.event;
            e.preventDefault();
            // Get the mouse position at startup
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            // Call function when the cursor moves
            document.onmousemove = elementDrag;
            
            // Add active class to indicate dragging
            element.classList.add('dragging');
        }
        
        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            // Calculate the new position
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            
            // Prevent dragging beyond container boundaries
            const container = document.querySelector('.container');
            const rect = element.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;
            
            // Apply boundaries
            if (newTop < 0) newTop = 0;
            if (newLeft < 0) newLeft = 0;
            if (newTop > containerRect.height - 100) newTop = containerRect.height - 100;
            if (newLeft > containerRect.width - rect.width / 2) newLeft = containerRect.width - rect.width / 2;
            
            // Set the element's new position
            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }
        
        function closeDragElement() {
            // Stop moving when mouse button is released
            document.onmouseup = null;
            document.onmousemove = null;
            element.classList.remove('dragging');
            
            // Set focus back to command input after dragging
            document.getElementById('commandInput').focus();
        }
    }
});