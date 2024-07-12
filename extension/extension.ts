import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let diagnosticCollection: vscode.DiagnosticCollection;
let fileWatchers: { [key: string]: vscode.FileSystemWatcher } = {};
let isSaveFromExtension = false;

export function activate(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return;
  }

  diagnosticCollection =
    vscode.languages.createDiagnosticCollection('snippetErrors');
  context.subscriptions.push(diagnosticCollection);

  const showInlineSnippets = async (editor: vscode.TextEditor) => {
    if (!editor || editor.document.languageId !== 'mdx') return;

    const document = editor.document;
    const text = document.getText();
    let edit = new vscode.WorkspaceEdit();
    let hasChanges = false;
    let diagnostics: vscode.Diagnostic[] = [];

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

        newSnippet += `${firstLine}\n// AUTOMATICALLY GENERATED: DO NOT MODIFY //\n\n${newContent}\n// AUTOMATICALLY GENERATED END // \n\`\`\``;
        edit.replace(document.uri, range, newSnippet);
        setupFileWatcher(snippetPath, document.uri, range);
        hasChanges = true;
      } else {
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

    if (hasChanges) {
      await vscode.workspace.applyEdit(edit);
      diagnosticCollection.set(document.uri, diagnostics);
      isSaveFromExtension = true;
      await document.save();
      isSaveFromExtension = false;
    } else {
      diagnosticCollection.set(document.uri, diagnostics);
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
      if (editor && editor.document.languageId === 'mdx') {
        showInlineSnippets(editor);
      }
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidSaveTextDocument(
    (document) => {
      if (document.languageId === 'mdx' && !isSaveFromExtension) {
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
      vscode.window.visibleTextEditors.forEach((editor) => {
        if (editor.document.languageId === 'mdx') {
          showInlineSnippets(editor);
        }
      });
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

export function deactivate() {
  if (diagnosticCollection) {
    diagnosticCollection.clear();
    diagnosticCollection.dispose();
  }

  Object.values(fileWatchers).forEach((watcher) => watcher.dispose());
}

// import * as vscode from 'vscode';
// import * as fs from 'fs';
// import * as path from 'path';

// let diagnosticCollection: vscode.DiagnosticCollection;
// let fileWatchers: { [key: string]: vscode.FileSystemWatcher } = {};
// let isSaveFromExtension = false;

// export function activate(context: vscode.ExtensionContext) {
//   const editor = vscode.window.activeTextEditor;

//   if (!editor) {
//     return;
//   }

//   // https://code.visualstudio.com/api/references/vscode-api#:~:text=FUNCTIONS-,createDiagnosticCollection,-(name%3F
//   diagnosticCollection =
//     vscode.languages.createDiagnosticCollection('snippetErrors');

//   // https://code.visualstudio.com/api/extension-guides/command#:~:text=Registering%20a%20command
//   context.subscriptions.push(diagnosticCollection);

//   const showInlineSnippets = async (editor: vscode.TextEditor) => {
//     // Only run the script in mdx file.
//     if (!editor || editor.document.languageId !== 'mdx') return;

//     const document = editor.document;
//     const text = document.getText();
//     let edit = new vscode.WorkspaceEdit();
//     let hasChanges = false;
//     let diagnostics: vscode.Diagnostic[] = [];

//     // Regex to match the snippetPath line, and get everything between the
//     // backticks.
//     const regex = /```(.*?)? snippetPath="(.*?)"(.*?)?([^]*?)```/g;
//     let match;

//     while ((match = regex.exec(text)) !== null) {
//       const [fullMatch, _, snippetPath] = match;
//       let startPosition = document.positionAt(match.index);
//       const endPosition = document.positionAt(match.index + fullMatch.length);
//       const range = new vscode.Range(startPosition, endPosition);

//       let newSnippet = '';

//       // Check if the opening and closing backticks are on the same line
//       if (fullMatch.trim().split('\n').length === 1) {
//         const errorMessage = `Opening and closing backticks cannot be on the same line.`;
//         const diagnostic = new vscode.Diagnostic(
//           range,
//           errorMessage,
//           vscode.DiagnosticSeverity.Error
//         );
//         diagnostics.push(diagnostic);
//         continue;
//       }

//       // First line of the extension
//       const firstLine = fullMatch.split('\n')[0];

//       const content = await getFileContent(snippetPath);

//       if (content !== null) {
//         const newContent = content
//           .split('\n')
//           .map((line) => line.trimEnd())
//           .join('\n');

//         // We will replace the backticks in place, instead of pushing, because after multiple save, insert will add duplicate info.
//         newSnippet += `${firstLine}\n// AUTOMATICALLY GENERATED: DO NOT MODIFY ///\n${newContent}\n// AUTOMATICALLY GENERATED END\n\`\`\``;
//         // edit.insert(document.uri, startPosition, newSnippet);
//         edit.replace(document.uri, range, newSnippet);
//         setupFileWatcher(snippetPath, document.uri, range);
//         hasChanges = true;
//       } else {
//         // Add diagnostic for file not found
//         const errorMessage = `File path not found. ${getAbsolutePath(snippetPath)} doesn't exist.`;
//         const diagnostic = new vscode.Diagnostic(
//           range,
//           errorMessage,
//           vscode.DiagnosticSeverity.Error
//         );
//         diagnostics.push(diagnostic);
//       }
//     }

//     if (hasChanges) {
//       await vscode.workspace.applyEdit(edit);
//       diagnosticCollection.set(document.uri, diagnostics);
//       isSaveFromExtension = true; // Set the flag before saving
//       await document.save(); // Save the document after changes are applied
//       isSaveFromExtension = false; // Reset the flag after saving
//     } else {
//       diagnosticCollection.set(document.uri, diagnostics);
//     }
//   };

//   // Register the command (keeping this for manual triggering if needed)
//   let disposable = vscode.commands.registerCommand(
//     'extension.showInlineSnippet',
//     () => {
//       const editor = vscode.window.activeTextEditor;
//       if (editor && editor.document.languageId === 'mdx') {
//         showInlineSnippets(editor);
//       }
//     }
//   );

//   context.subscriptions.push(disposable);

//   // Run on file open
//   vscode.window.onDidChangeActiveTextEditor(
//     (editor) => {
//       if (editor && editor.document.languageId === 'mdx') {
//         showInlineSnippets(editor);
//       }
//     },
//     null,
//     context.subscriptions
//   );

//   // Run on file save
//   vscode.workspace.onDidSaveTextDocument(
//     (document) => {
//       if (document.languageId === 'mdx' && !isSaveFromExtension) {
//         vscode.window.visibleTextEditors.forEach((editor) => {
//           if (editor.document === document) {
//             showInlineSnippets(editor);
//           }
//         });
//       }
//     },
//     null,
//     context.subscriptions
//   );

//   // Run on file delete
//   vscode.workspace.onDidDeleteFiles(
//     async (event) => {
//       // Refresh all visible MDX editors after a file is deleted
//       vscode.window.visibleTextEditors.forEach((editor) => {
//         if (editor.document.languageId === 'mdx') {
//           showInlineSnippets(editor);
//         }
//       });
//     },
//     null,
//     context.subscriptions
//   );

//   // Run for the initial active editor
//   if (
//     vscode.window.activeTextEditor &&
//     vscode.window.activeTextEditor.document.languageId === 'mdx'
//   ) {
//     showInlineSnippets(vscode.window.activeTextEditor);
//   }
// }

// function setupFileWatcher(
//   snippetPath: string,
//   mdxUri: vscode.Uri,
//   initialRange: vscode.Range
// ) {
//   const absolutePath = getAbsolutePath(snippetPath);

//   if (fileWatchers[absolutePath]) {
//     fileWatchers[absolutePath].dispose();
//   }

//   const watcher = vscode.workspace.createFileSystemWatcher(absolutePath);

//   watcher.onDidChange(async () => {
//     const document = await vscode.workspace.openTextDocument(mdxUri);
//     const text = document.getText();
//     const regex = /```(.*?)? snippetPath="(.*?)"(.*?)?([^]*?)```/g;
//     let match;

//     while ((match = regex.exec(text)) !== null) {
//       const [fullMatch, _, matchedPath] = match;
//       if (matchedPath === snippetPath) {
//         const startPosition = document.positionAt(match.index);
//         const endPosition = document.positionAt(match.index + fullMatch.length);
//         const range = new vscode.Range(startPosition, endPosition);

//         // First line of the extension
//         const firstLine = fullMatch.split('\n')[0];
//         const content = await getFileContent(snippetPath);
//         if (content !== null) {
//           const newContent = content
//             .split('\n')
//             .map((line) => line.trimEnd())
//             .join('\n');
//           const newSnippet = `${firstLine}\n// AUTOMATICALLY GENERATED: DO NOT MODIFY ///\n${newContent}\n// AUTOMATICALLY GENERATED END\n\`\`\``;

//           const edit = new vscode.WorkspaceEdit();
//           edit.replace(mdxUri, range, newSnippet);
//           await vscode.workspace.applyEdit(edit);
//           isSaveFromExtension = true; // Set the flag before saving
//           await document.save(); // Save the document after changes are applied
//           isSaveFromExtension = false; // Reset the flag after saving
//         }
//         break;
//       }
//     }
//   });

//   fileWatchers[absolutePath] = watcher;
// }

// function getAbsolutePath(filePath: string): string {
//   const workspaceFolders = vscode.workspace.workspaceFolders;
//   if (!workspaceFolders) {
//     return filePath;
//   }
//   const workspaceFolder = workspaceFolders[0];
//   return path.resolve(workspaceFolder.uri.fsPath, 'codesnippets/src', filePath);
// }

// async function getFileContent(filePath: string): Promise<string | null> {
//   const absolutePath = getAbsolutePath(filePath);

//   try {
//     return await fs.promises.readFile(absolutePath, 'utf8');
//   } catch (err) {
//     console.error(`Error reading file: ${err}`);
//     return null;
//   }
// }

// export function deactivate() {
//   if (diagnosticCollection) {
//     diagnosticCollection.clear();
//     diagnosticCollection.dispose();
//   }

//   // Dispose all file watchers
//   Object.values(fileWatchers).forEach((watcher) => watcher.dispose());
// }
