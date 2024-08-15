import {
  ExtensionContext,
  DiagnosticCollection,
  FileSystemWatcher,
  window,
  extensions,
  commands,
  workspace,
  TextEditor,
  WorkspaceEdit,
  Range,
  Diagnostic,
  DiagnosticSeverity
} from 'vscode';
import {
  LOCAL_STORAGE_KEY,
  getAbsolutePath,
  getFileContent,
  removeInlineSnippetsFromDocument
} from './utils';
import { LocalStorageService } from './local_storage';
import { FileWatcherService } from './file_watcher';

export const showInlineSnippets = async (
  localStorage: LocalStorageService,
  fileWatcher: FileWatcherService,
  diagnosticCollection: DiagnosticCollection,
  editor: TextEditor
) => {
  // Get Value from Local Storage.
  const isExtensionActive =
    localStorage.getValue<Boolean>(LOCAL_STORAGE_KEY.isExtensionActive) ||
    false;

  console.log(isExtensionActive, editor);
  if (!isExtensionActive || !editor || editor.document.languageId !== 'mdx')
    return;

  const document = editor.document;
  const text = document.getText();
  let edit = new WorkspaceEdit();
  let hasChanges = false;
  let diagnostics: Diagnostic[] = [];

  // Simple regex to check if the snippetPath exists, if yes, than get their value.
  const regex = /```(.*?)? snippetPath="(.*?)"(.*?)?([^]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const [fullMatch, _, snippetPath] = match;
    let startPosition = document.positionAt(match.index);
    const endPosition = document.positionAt(match.index + fullMatch.length);
    const range = new Range(startPosition, endPosition);

    let newSnippet = '';

    if (fullMatch.trim().split('\n').length === 1) {
      const errorMessage = `Opening and closing backticks cannot be on the same line.`;
      const diagnostic = new Diagnostic(
        range,
        errorMessage,
        DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
      continue;
    }

    const firstLine = fullMatch.split('\n')[0];
    const content = getFileContent(snippetPath);

    if (content !== null) {
      const newContent = content
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n');

      // Replace the code snippet in place. I tried inserting in between them, but had little to no success.
      newSnippet += `${firstLine}\n// AUTOMATICALLY GENERATED: DO NOT MODIFY //\n\n${newContent}\n// AUTOMATICALLY GENERATED END // \n\`\`\``;
      edit.replace(document.uri, range, newSnippet);
      fileWatcher.setupFileWatcher(snippetPath, document.uri);
      hasChanges = true;
    } else {
      // Show an error, when the file path does not exists.
      console.log('File path not found');
      const errorMessage = `File path not found. ${getAbsolutePath(snippetPath)} doesn't exist. \nNote: The snippet path looks at codesnippet/src/<provided_path>.`;
      const diagnostic = new Diagnostic(
        range,
        errorMessage,
        DiagnosticSeverity.Error
      );
      newSnippet += `${firstLine}\n\`\`\``;
      edit.replace(document.uri, range, newSnippet);
      removeInlineSnippetsFromDocument(document);
      diagnostics.push(diagnostic);
    }
  }

  // Listen to file changes in parent file. Like if the signOut.ts changes, so will the index.mdx(if they depend on it)
  if (hasChanges) {
    await workspace.applyEdit(edit);
    diagnosticCollection.set(document.uri, diagnostics);
    localStorage.setSavingFromExtension(true);
    await document.save();
    localStorage.setSavingFromExtension(false);
  } else {
    diagnosticCollection.set(document.uri, diagnostics);
  }
};
