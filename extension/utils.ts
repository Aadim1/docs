import { workspace, TextDocument, WorkspaceEdit, Range, window } from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Utility function to get the absolute path of the file.
 * @param filePath The path of the file.
 * @returns The absolute path of the file.
 */
export function getAbsolutePath(filePath: string): string {
  const workspaceFolders = workspace.workspaceFolders;
  if (!workspaceFolders) {
    return filePath;
  }
  const workspaceFolder = workspaceFolders[0];
  return path.resolve(workspaceFolder.uri.fsPath, 'codesnippets/src', filePath);
}

/**
 * Takes in the path of the file, and then returns the content of the file in string.
 * @param filePath Where file exists in the context of the code snippets..
 * @returns
 */
export function getFileContent(filePath: string): string | null {
  const absolutePath = getAbsolutePath(filePath);

  try {
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (err) {
    console.error(`Error reading file: ${err}`);
    return null;
  }
}

/**
 * Replace any automatically added file to pile.
 * @param document The file or document in vs-code world, that would need to be check.
 */
export function removeInlineSnippetsFromDocument(
  document: TextDocument
): Boolean {
  const text = document.getText();
  const regex =
    /```(.*?)? snippetPath="(.*?)"(.*?)?\n\/\/ AUTOMATICALLY GENERATED: DO NOT MODIFY \/\/\n\n([\s\S]*?)\/\/ AUTOMATICALLY GENERATED END \/\/ \n```/g;
  let match;
  let edit = new WorkspaceEdit();
  let hasChanges = false;

  while ((match = regex.exec(text)) !== null) {
    const [fullMatch, lang, snippetPath, extraParams] = match;
    const startPosition = document.positionAt(match.index);
    const endPosition = document.positionAt(match.index + fullMatch.length);
    const range = new Range(startPosition, endPosition);

    // Replace with original snippet structure
    const replacement = `\`\`\`${lang || ''} snippetPath="${snippetPath}"${extraParams || ''}\n\`\`\``;
    edit.replace(document.uri, range, replacement);
    hasChanges = true;
  }
  workspace.applyEdit(edit);
  return hasChanges;
}

export function removeAllInlineSnippets() {
  for (const editor of window.visibleTextEditors) {
    if (editor.document.languageId === 'mdx') {
      removeInlineSnippetsFromDocument(editor.document);
    }
  }
}

export enum LOCAL_STORAGE_KEY {
  isExtensionActive = 'IS_EXTENSION_ACTIVE',
  isSaveFromExtension = 'IS_SAVE_FROM_EXTENSION'
}
