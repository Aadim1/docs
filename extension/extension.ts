import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let diagnosticCollection: vscode.DiagnosticCollection | undefined;
let fileWatchers: { [key: string]: vscode.FileSystemWatcher } = {};
let isSaveFromExtension = false;
let isExtensionActive = true;

export function activate(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  // Activate the extension
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.activateInlineSnippets', () => {
      isExtensionActive = true;
      vscode.window.showInformationMessage(
        'Inline Snippets extension activated'
      );
      if (vscode.window.activeTextEditor) {
        showInlineSnippets(vscode.window.activeTextEditor);
      }
    })
  );

  // Deactivate the extension
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.deactivateInlineSnippets',
      async () => {
        if (isExtensionActive) {
          await deactivate();
        } else {
          vscode.window.showInformationMessage(
            'Inline Snippets extension is already deactivated'
          );
        }
      }
    )
  );

  diagnosticCollection =
    vscode.languages.createDiagnosticCollection('snippetErrors');

  // To show an error when there are no snippetPath.
  context.subscriptions.push(diagnosticCollection);

  const showInlineSnippets = async (editor: vscode.TextEditor) => {
    if (!isExtensionActive || !editor || editor.document.languageId !== 'mdx')
      return;

    const document = editor.document;
    const text = document.getText();
    let edit = new vscode.WorkspaceEdit();
    let hasChanges = false;
    let diagnostics: vscode.Diagnostic[] = [];

    // Simple regex to check if the snippetPath exists, if yes, than get their value.
    const regex = /```(.*?)? snippetPath="(.*?)"(.*?)?([^]*?)```/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, _, snippetPath] = match;
      let startPosition = document.positionAt(match.index);
      const endPosition = document.positionAt(match.index + fullMatch.length);
      const range = new vscode.Range(startPosition, endPosition);

      let newSnippet = '';

      if (fullMatch.trim().split('\n').length === 1) {
        const errorMessage = `Opening and closing backticks cannot be on the same line.`;
        const diagnostic = new vscode.Diagnostic(
          range,
          errorMessage,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
        continue;
      }

      const firstLine = fullMatch.split('\n')[0];
      const content = await getFileContent(snippetPath);

      if (content !== null) {
        const newContent = content
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n');

        // Replace the code snippet in place. I tried inserting in between them, but had little to no success.
        newSnippet += `${firstLine}\n// AUTOMATICALLY GENERATED: DO NOT MODIFY //\n\n${newContent}\n// AUTOMATICALLY GENERATED END // \n\`\`\``;
        edit.replace(document.uri, range, newSnippet);
        setupFileWatcher(snippetPath, document.uri, range);
        hasChanges = true;
      } else {
        // Show an error, when the file path does not exists.
        const errorMessage = `File path not found. ${getAbsolutePath(snippetPath)} doesn't exist. \nNote: The snippet path looks at codesnippet/src/<provided_path>.`;
        const diagnostic = new vscode.Diagnostic(
          range,
          errorMessage,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
        newSnippet += `${firstLine}\n\`\`\``;
        edit.replace(document.uri, range, newSnippet);
        setupFileWatcher(snippetPath, document.uri, range);
      }
    }

    // Listen to file changes in parent file. Like if the signOut.ts changes, so will the index.mdx(if they depend on it)
    if (hasChanges) {
      await vscode.workspace.applyEdit(edit);
      diagnosticCollection?.set(document.uri, diagnostics);
      isSaveFromExtension = true;
      await document.save();
      isSaveFromExtension = false;
    } else {
      diagnosticCollection?.set(document.uri, diagnostics);
    }

    refreshDocumentLinks(document);
  };

  const refreshDocumentLinks = (document: vscode.TextDocument) => {
    const documentLinkProvider = new SnippetDocumentLinkProvider();
    context.subscriptions.push(
      vscode.languages.registerDocumentLinkProvider(
        { language: 'mdx' },
        documentLinkProvider
      )
    );
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('extension.showInlineSnippet', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'mdx') {
        showInlineSnippets(editor);
      }
    })
  );

  vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (isExtensionActive && editor && editor.document.languageId === 'mdx') {
        showInlineSnippets(editor);
      }
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidSaveTextDocument(
    (document) => {
      if (
        isExtensionActive &&
        document.languageId === 'mdx' &&
        !isSaveFromExtension
      ) {
        vscode.window.visibleTextEditors.forEach((editor) => {
          if (editor.document === document) {
            showInlineSnippets(editor);
          }
        });
      }
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidDeleteFiles(
    async (event) => {
      if (isExtensionActive) {
        vscode.window.visibleTextEditors.forEach((editor) => {
          if (editor.document.languageId === 'mdx') {
            showInlineSnippets(editor);
          }
        });
      }
    },
    null,
    context.subscriptions
  );

  if (
    vscode.window.activeTextEditor &&
    vscode.window.activeTextEditor.document.languageId === 'mdx'
  ) {
    showInlineSnippets(vscode.window.activeTextEditor);
  }
}

class SnippetDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(
    document: vscode.TextDocument
  ): vscode.ProviderResult<vscode.DocumentLink[]> {
    const regex = /snippetPath="(.*?)"/g;
    const text = document.getText();
    let match;
    const links: vscode.DocumentLink[] = [];

    while ((match = regex.exec(text)) !== null) {
      const snippetPath = match[1];
      const startPosition = document.positionAt(match.index);
      const endPosition = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPosition, endPosition);

      const absolutePath = getAbsolutePath(snippetPath);

      // If the snippet path doesn't exist, we won't push a link.
      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const uri = vscode.Uri.file(absolutePath);
      links.push(new vscode.DocumentLink(range, uri));
    }

    return links;
  }
}

/**
 * An utility function to detect changes in the source(code snippet) file and then reflect the change in
 * the mdx file that depends on them.
 * @param snippetPath The path to the file being watched.
 * @param mdxUri To open the text document. Like the current file.
 * @param initialRange The range to where the file content will be changed, if the fileWatcher detect change.
 */
function setupFileWatcher(
  snippetPath: string,
  mdxUri: vscode.Uri,
  initialRange: vscode.Range
) {
  const absolutePath = getAbsolutePath(snippetPath);

  if (fileWatchers[absolutePath]) {
    fileWatchers[absolutePath].dispose();
  }

  const watcher = vscode.workspace.createFileSystemWatcher(absolutePath);

  watcher.onDidChange(async () => {
    const document = await vscode.workspace.openTextDocument(mdxUri);
    const text = document.getText();
    const regex = /```(.*?)? snippetPath="(.*?)"(.*?)?([^]*?)```/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, _, matchedPath] = match;
      if (matchedPath === snippetPath) {
        const startPosition = document.positionAt(match.index);
        const endPosition = document.positionAt(match.index + fullMatch.length);
        const range = new vscode.Range(startPosition, endPosition);

        const firstLine = fullMatch.split('\n')[0];
        const content = await getFileContent(snippetPath);
        if (content !== null) {
          const newContent = content
            .split('\n')
            .map((line) => line.trimEnd())
            .join('\n');
          const newSnippet = `${firstLine}\n\n// AUTOMATICALLY GENERATED: DO NOT MODIFY // \n\n${newContent}\n// AUTOMATICALLY GENERATED END // \n\`\`\``;

          const edit = new vscode.WorkspaceEdit();
          edit.replace(mdxUri, range, newSnippet);
          await vscode.workspace.applyEdit(edit);
          isSaveFromExtension = true;
          await document.save();
          isSaveFromExtension = false;
        }
        break;
      }
    }
  });

  fileWatchers[absolutePath] = watcher;
}

/**
 * Utility function to get the absolute path of the file.
 * @param filePath The path of the file.
 * @returns The absolute path of the file.
 */
function getAbsolutePath(filePath: string): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    return filePath;
  }
  const workspaceFolder = workspaceFolders[0];
  return path.resolve(workspaceFolder.uri.fsPath, 'codesnippets/src', filePath);
}

async function getFileContent(filePath: string): Promise<string | null> {
  const absolutePath = getAbsolutePath(filePath);

  try {
    return await fs.promises.readFile(absolutePath, 'utf8');
  } catch (err) {
    console.error(`Error reading file: ${err}`);
    return null;
  }
}

async function removeAllInlineSnippets() {
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.languageId === 'mdx') {
      await removeInlineSnippetsFromDocument(editor.document);
    }
  }
}

/**
 * Replace any automatically added file to pile.
 * @param document The file or document in vs-code world, that would need to be check.
 */
async function removeInlineSnippetsFromDocument(document: vscode.TextDocument) {
  const text = document.getText();
  const regex =
    /```(.*?)? snippetPath="(.*?)"(.*?)?\n\/\/ AUTOMATICALLY GENERATED: DO NOT MODIFY \/\/\n\n([\s\S]*?)\/\/ AUTOMATICALLY GENERATED END \/\/ \n```/g;
  let match;
  let edit = new vscode.WorkspaceEdit();
  let hasChanges = false;

  while ((match = regex.exec(text)) !== null) {
    const [fullMatch, lang, snippetPath, extraParams] = match;
    const startPosition = document.positionAt(match.index);
    const endPosition = document.positionAt(match.index + fullMatch.length);
    const range = new vscode.Range(startPosition, endPosition);

    // Replace with original snippet structure
    const replacement = `\`\`\`${lang || ''} snippetPath="${snippetPath}"${extraParams || ''}\n\`\`\``;
    edit.replace(document.uri, range, replacement);
    hasChanges = true;
  }

  if (hasChanges) {
    await vscode.workspace.applyEdit(edit);
    isSaveFromExtension = true;
    await document.save();
    isSaveFromExtension = false;
  }
}

export async function deactivate() {
  isExtensionActive = false;

  // Clear and dispose diagnosticCollection if it exists
  if (diagnosticCollection) {
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
    diagnosticCollection = undefined;
  }

  // Remove inline snippets
  await removeAllInlineSnippets();

  // Dispose all file watchers
  Object.values(fileWatchers).forEach((watcher) => watcher.dispose());
  fileWatchers = {};

  vscode.window.showInformationMessage('Inline Snippets extension deactivated');
}
