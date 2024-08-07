const fs = require('fs');
const path = require('path');
const glob = require('glob');

const INJECTION_MARKER = '// AUTOMATICALLY GENERATED:';

function checkMdxFiles() {
  const mdxFiles = glob.sync('../**/*.mdx', { ignore: 'node_modules/**' });
  let hasInjectedCode = false;

  mdxFiles.forEach((file) => {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes(INJECTION_MARKER)) {
      console.error(
        `Error: File ${file} contains injected code from the Inline Snippets extension.`
      );
      hasInjectedCode = true;
    }
  });

  if (hasInjectedCode) {
    console.error(
      'Please deactivate the Inline Snippets extension and remove all injected code before committing.'
    );
    process.exit(1);
  } else {
    console.log('No injected code found in MDX files.');
    process.exit(0);
  }
}

checkMdxFiles();
