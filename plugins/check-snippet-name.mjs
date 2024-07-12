import { visit } from 'unist-util-visit';
import fs from 'fs';
import path from 'path';

export default (options) => {
  return (tree, file) => {
    const validateSnippets = 'as';

    visit(tree, 'element', (node) => {
      if (validateSnippets.length == 0) {
        return;
      }
      if (node.tagName === 'code' && node.data && node.data.meta) {
        const meta = node.data.meta;

        const snippetPathMatch = meta.match(/snippetPath="(.*?)"/);
        if (snippetPathMatch) {
          const snippetPath = snippetPathMatch[1];
          const filePath = path.resolve(
            process.cwd(),
            'codesnippets/src/',
            snippetPath
          );
          if (!fs.existsSync(filePath)) {
            throw new Error(`Snippet file ${snippetPath} does not exist`);
          }
          const codeString = fs.readFileSync(filePath, 'utf-8');
          console.log(extractCodeBlocks(codeString));
          node.children = [
            {
              type: 'text',
              value: codeString
            }
          ];
        }
      }
    });
  };
};

function extractCodeBlocks(code) {
  const lines = code.split('\n');
  let formattedCode = [];
  let insideBlock = false;
  let blockLevel = 0;
  let indentStack = [];
  lines.forEach((line) => {
    const trimmedLine = line.trim();

    if (trimmedLine === '// [[start]]') {
      insideBlock = true;
      blockLevel++;
      indentStack.push(line.indexOf('// [[start]]'));
      return;
    }

    if (trimmedLine === '// [[end]]') {
      blockLevel--;
      if (blockLevel === 0) {
        insideBlock = false;
      }
      indentStack.pop();
      return;
    }

    if (insideBlock && blockLevel > 0) {
      let currentIndent = indentStack[indentStack.length - 1];
      formattedCode.push(line.slice(currentIndent));
    }
  });

  return formattedCode.join('\n');
}

// Function to format extracted code
const formatExtractedCode = (extractedCode) => {
  return extractedCode.join('\n');
};

// const snippetNameMatch = meta.match(/snippetName="(.*?)"/);
// if (snippetNameMatch) {
//   // console.log('GOT HERE ATLEAST', node);
//   const snippetName = snippetNameMatch[1];
//   if (!jsSnippets[snippetName]) {
//     console.log(jsSnippets);
//     throw new Error(
//       `Snippet ${snippetName} not found in file ${file.path}`
//     );
//   } else {
//     console.log('GOT HERE', node);
//     // the code snippets exists
//     const codeString = fs.readFileSync(
//       path.resolve(process.cwd(), jsSnippets[snippetName]),
//       'utf-8'
//     );
//     console.log(extractCodeBlocks(codeString));
//     node.children = [
//       {
//         type: 'text',
//         value: codeString
//       }
//     ];
//   }
// }
