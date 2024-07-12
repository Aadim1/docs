#!/bin/bash

# Function to provide instructions to install the Visual Studio Code command
provide_install_instructions() {
    echo "Visual Studio Code is installed, but the 'code' command is not available."
    echo "Please follow these steps to install the 'code' command in PATH:"
    echo "1. Open Visual Studio Code."
    echo "2. Open the Command Palette by pressing 'Cmd+Shift+P' (or 'Ctrl+Shift+P' on Windows/Linux)."
    echo "3. Type 'Shell Command' and select 'Shell Command: Install 'code' command in PATH'."
    echo "4. Restart your terminal."
}

# Check if the `code` command is available
if ! command -v code &> /dev/null; then
    echo "The 'code' command is not available."
    provide_install_instructions
    exit 1
fi

# Navigate to the extension directory
cd extension || { echo "Extension directory not found. Exiting."; exit 1; }

# Install dependencies
if ! npm install; then
    echo "Failed to install npm dependencies. Exiting."
    exit 1
fi

# Compile the extension
if ! npm run compile; then
    echo "Failed to compile the extension. Exiting."
    exit 1
fi

# Remove any existing .vsix files
rm -f snippet-inline.vsix

# Package the extension and name the .vsix file snippet-inline.vsix
if ! npx vsce package --out snippet-inline.vsix; then
    echo "Failed to package the extension. Exiting."
    exit 1
fi

# Check if the .vsix file was created
if [ ! -f "snippet-inline.vsix" ]; then
    echo "Extension package (snippet-inline.vsix) not found. Packaging might have failed."
    exit 1
fi

# Ensure jq is installed
if ! command -v jq &> /dev/null; then
    echo "jq is not installed. Installing jq..."
    if ! brew install jq; then
        echo "Failed to install jq. Exiting."
        exit 1
    fi
fi

# Uninstall the extension if it exists
extension_id=$(jq -r '.publisher + "." + .name' package.json)
if code --list-extensions | grep -q "$extension_id"; then
    echo "Uninstalling existing extension $extension_id..."
    if ! code --uninstall-extension "$extension_id"; then
        echo "Failed to uninstall existing extension. Exiting."
        exit 1
    fi
fi

# Install the extension in VS Code
echo "Installing extension..."
if ! code --install-extension snippet-inline.vsix; then
    echo "Failed to install the extension. Exiting."
    exit 1
fi

# Prompt to reload VS Code window
echo "Installation complete. Please reload the VS Code window to activate the extension."
echo "You can use the 'Reload Window' command from the Command Palette (Cmd+Shift+P) or run the following command in VS Code:"
echo "'Developer: Reload Window'"

# Navigate back to the project root
cd ..

# Provide a summary of next steps
echo "Summary of next steps:"
echo "1. Open Visual Studio Code."
echo "2. Open the Command Palette by pressing 'Cmd+Shift+P' (or 'Ctrl+Shift+P' on Windows/Linux)."
echo "3. Type 'Reload Window' and select 'Developer: Reload Window'."
echo "4. Your extension should now be active and ready to use."
