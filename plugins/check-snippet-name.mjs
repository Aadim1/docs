import { visit } from 'unist-util-visit';
import fs from 'fs';
import path from 'path';

/**
 * This is a remark plugin that checks if the snippet file exists
 * and replaces the code snippet with the actual code.
 * Heavily influenced by [remark-code-import](https://www.npmjs.com/package/remark-code-import) plugin.
 * @returns A remark plugin function.
 */
export default (_) => {
  return (tree, _) => {
    const validateSnippets = 'as';

    visit(tree, 'element', (node) => {
      if (validateSnippets.length == 0) {
        return;
      }

      // tagName is code, when the backticks happen.
      if (node.tagName === 'code' && node.data && node.data.meta) {
        const meta = node.data.meta;

        // checks if the code containing ```, has snippetPath. If not ignore.
        const snippetPathMatch = meta.match(/snippetPath="(.*?)"/);
        if (snippetPathMatch) {
          const snippetPath = snippetPathMatch[1];
          const filePath = path.resolve(
            process.cwd(),
            'codesnippets/src/',
            snippetPath
          );

          // Throw an error if no file is found. This will get triggered on build time.
          if (!fs.existsSync(filePath)) {
            throw new Error(`Snippet file ${snippetPath} does not exist`);
          }
          const codeString = fs.readFileSync(filePath, 'utf-8');

          // Inject the codesnippet into the code tree.
          node.children = [
            {
              type: 'text',
              value: extractCodeSnippets(codeString)
            }
          ];
        }
      }
    });
  };
};

/**
 * Takes the string and parses them to only take intended lines.
 * It takes and formats the code snippets between the [[start]] and [[end]] tags.
 * @param {string} codeString The string that needs to be formatted.
 * @returns The formatted string
 */
function extractCodeSnippets(codeString) {
  const stack = [];
  const snippets = [];
  const lines = codeString.split('\n');
  let currentIndent = 0;

  let currentSnippet = [];

  for (const line of lines) {
    const strippedLine = line.trim();
    const removeWhiteSpace = strippedLine.replace(/\s+/g, '');

    if (removeWhiteSpace.startsWith('//[[start]]')) {
      stack.push({ snippet: currentSnippet, indent: currentIndent });
      currentSnippet = [];
      currentIndent = line.length - line.trimStart().length;
    } else if (removeWhiteSpace.startsWith('//[[end]]')) {
      if (stack.length === 0) {
        throw new Error('Unmatched [[end]] tag found');
      }
      const snippetContent = currentSnippet.join('\n');
      if (stack.length === 1) {
        snippets.push(snippetContent);
      } else {
        stack[stack.length - 2].snippet.push(snippetContent);
      }
      const { snippet, indent } = stack.pop();
      currentSnippet = snippet;
      currentIndent = indent;
    } else {
      currentSnippet.push(line.slice(currentIndent));
    }
  }

  if (stack.length > 0) {
    throw new Error('Unmatched [[start]] tag found');
  }

  return snippets.join('\n');
}
