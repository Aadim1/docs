const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Function to provide instructions to install the Visual Studio Code command
function provideInstallInstructions() {
  console.log(
    "Visual Studio Code is installed, but the 'code' command is not available."
  );
  console.log(
    "Please follow these steps to install the 'code' command in PATH:"
  );
  console.log('1. Open Visual Studio Code.');
  console.log(
    "2. Open the Command Palette by pressing 'Cmd+Shift+P' (or 'Ctrl+Shift+P' on Windows/Linux)."
  );
  console.log(
    "3. Type 'Shell Command' and select 'Shell Command: Install 'code' command in PATH'."
  );
  console.log('4. Restart your terminal.');
}

function createClickableUrlLink(url, text) {
  return `\u001b]8;;${url}\u001b\\${text}\u001b]8;;\u001b\\`;
}

// The NPM install might fail to resolve, without this steps.
// This makes sure that the npm install runs on the extension folder, rather than where the script is called from.
const extensionDir = path.join(__dirname);
console.log(extensionDir);
if (!fs.existsSync(extensionDir)) {
  console.log('Extension directory not found. Exiting.');
  process.exit(1);
}
process.chdir(extensionDir);

// Install dependencies
try {
  execSync('npm install', { stdio: 'inherit' });
} catch (error) {
  console.log('Failed to install npm dependencies. Exiting.');
  process.exit(1);
}

try {
  execSync('npm run compile', { stdio: 'inherit' });
} catch (error) {
  console.log('Failed to compile the extension. Exiting.');
  process.exit(1);
}

// Remove any existing .vsix files
try {
  fs.unlinkSync('snippet-inline.vsix');
} catch (error) {
  // no-op
}

// Package the extension and name the .vsix file snippet-inline.vsix
// We don't have to care about vsce not being installed, because the npm install will take care of that.
// vsce is listed as a dev dependency for the extension project.
try {
  execSync('npx vsce package --out snippet-inline.vsix', { stdio: 'inherit' });
} catch (error) {
  console.log('Failed to package the extension. Exiting.');
  process.exit(1);
}

// Check if the .vsix file was created
if (!fs.existsSync('snippet-inline.vsix')) {
  console.log(
    'Extension package (snippet-inline.vsix) not found. Packaging might have failed.'
  );
  process.exit(1);
}

const extensionId = 'amplify-js.inline-snippets';

try {
  execSync('command -v code', { stdio: 'ignore' });
} catch (error) {
  console.log("The 'code' command is not available.");
  console.log(
    'VS Code extension has been packaged and stored in /extension/snippet-inline.vsix. To install the VS Code using this script please, install code.'
  );
  console.log(
    `\nIf you cannot install code, than follow this steps. 
    \n\t1. Uninstall VS Code extension named: dev-ex-docs.
    \n\t2. Install manually, guide shown ${createClickableUrlLink(' ', 'here')}\n
    `
  );
  process.exit(1);
}

// Uninstall the extension if it exists
try {
  const listExtensions = execSync('code --list-extensions').toString();
  if (listExtensions.includes(extensionId)) {
    execSync(`code --uninstall-extension "${extensionId}"`, {
      stdio: 'inherit'
    });
  }
} catch (error) {
  console.log('Failed to uninstall existing extension. Exiting.');
  process.exit(1);
}

// Install the extension in VS Code
try {
  execSync(`code --install-extension snippet-inline.vsix`, {
    stdio: 'inherit'
  });
} catch (error) {
  console.log('Failed to install the extension. Exiting.');
  process.exit(1);
}

// Prompt to reload VS Code window
console.log(
  'Installation complete. Please reload the VS Code window to activate the extension.'
);
console.log(
  "You can use the 'Reload Window' command from the Command Palette (Cmd+Shift+P) or run the following command in VS Code:"
);
console.log("'Developer: Reload Window'");
