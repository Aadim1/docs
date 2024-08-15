import {
  ExtensionContext,
  DiagnosticCollection,
  Disposable,
  window,
  extensions,
  commands,
  workspace,
  languages
} from 'vscode';
import { LocalStorageService } from './local_storage';
import { FileWatcherService } from './file_watcher';
import {
  LOCAL_STORAGE_KEY,
  getAbsolutePath,
  getFileContent,
  removeAllInlineSnippets
} from './utils';
import { SnippetDocumentLinkProvider } from './snippet_link_provider';
import { showInlineSnippets } from './show_snippets';

/**
 * This code serves, as important documentation for resources, and explanation of the extension.
 *
 * The VS Code extension has 4 different useful feature, we are going to list and explain them.
 *
 * 1. Show Error when file not found.
 *  - This is accomplished using vscode.DiagnosticCollection, which allows us to show errors in the editor.
 *  - The error is shown when the snippetPath is not found.
 *  - The error is also shown when the snippetPath is not a valid file.
 *
 * 2. Ctrl/Cmd+Click to go to the desination file.
 *  -
 *
 * 3. Injecting Code Snippet
 *
 * 4. File watching, automatic changes.
 *
 * PLEASE REMOVE BEFORE MERGING.
 */

const fileWatcher = new FileWatcherService();

let diagnosticCollection: DiagnosticCollection =
  languages.createDiagnosticCollection('snippetErrors');
let documentLinkProvider: Disposable | undefined;

extensions.getExtension('amplify-vs-code-internal.snippets');

export function activate(context: ExtensionContext) {
  const editor = window.activeTextEditor;

  if (!editor) {
    return;
  }

  let localStorage = new LocalStorageService(context.workspaceState);
  fileWatcher.init(localStorage);
  setupSubscription(context, localStorage);

  workspace.onDidSaveTextDocument(
    (document) => {
      // The snippetPath is potentially changed.
      const isSaveFromExtension = localStorage.getValue<boolean>(
        LOCAL_STORAGE_KEY.isSaveFromExtension
      );
      refreshDocumentLinkProvider(context);
      if (
        document.languageId == 'mdx' &&
        window.activeTextEditor &&
        !isSaveFromExtension
      ) {
        showInlineSnippets(
          localStorage,
          fileWatcher,
          diagnosticCollection,
          window.activeTextEditor
        );
      }
    },
    null,
    context.subscriptions
  );

  workspace.onDidCreateFiles(
    (document) => {
      refreshSnippets(localStorage);
    },
    null,
    context.subscriptions
  );

  workspace.onDidDeleteFiles(
    (_) => {
      refreshSnippets(localStorage);
    },
    null,
    context.subscriptions
  );

  workspace.onDidOpenTextDocument(
    () => {
      refreshSnippets(localStorage);
    },
    null,
    context.subscriptions
  );

  workspace.onDidRenameFiles(
    () => {
      refreshSnippets(localStorage);
    },
    null,
    context.subscriptions
  );

  if (
    window.activeTextEditor &&
    window.activeTextEditor.document.languageId === 'mdx'
  ) {
    refreshSnippets(localStorage);
  }
}

function setupSubscription(
  context: ExtensionContext,
  localStorage: LocalStorageService
) {
  let activateInlineSnippets = commands.registerCommand(
    'extension.activateInlineSnippets',
    () => {
      refreshSnippets(localStorage);
      window.showInformationMessage('Inline Snippets extension Activated');
      localStorage.setValue(LOCAL_STORAGE_KEY.isExtensionActive, true);
    }
  );

  let deacitvateInlineSnippets = commands.registerCommand(
    'extension.deactivateInlineSnippets',
    async () => {
      fileWatcher.dispose();
      removeAllInlineSnippets();
      diagnosticCollection.clear();
      window.showInformationMessage('Inline Snippets extension deactivated');
      localStorage.setValue(LOCAL_STORAGE_KEY.isExtensionActive, false);
    }
  );

  documentLinkProvider = languages.registerDocumentLinkProvider(
    { language: 'mdx' },
    new SnippetDocumentLinkProvider()
  );

  context.subscriptions.push(activateInlineSnippets);
  context.subscriptions.push(deacitvateInlineSnippets);
  context.subscriptions.push(diagnosticCollection);
  context.subscriptions.push(documentLinkProvider);
}

function refreshDocumentLinkProvider(context: ExtensionContext) {
  documentLinkProvider?.dispose();
  documentLinkProvider = languages.registerDocumentLinkProvider(
    { language: 'mdx' },
    new SnippetDocumentLinkProvider()
  );
  context.subscriptions.push(documentLinkProvider);
}

function refreshSnippets(localStorage: LocalStorageService) {
  const isExtensionActive =
    localStorage.getValue<boolean>(LOCAL_STORAGE_KEY.isExtensionActive) ??
    false;
  if (isExtensionActive) {
    window.visibleTextEditors.forEach((editor) => {
      if (editor.document.languageId === 'mdx') {
        showInlineSnippets(
          localStorage,
          fileWatcher,
          diagnosticCollection!,
          editor
        );
      }
    });
  }
}

/**
 * Runs when the extension is deactivated. Mainly when the extension is disabled.
 */
export function deactivate(context: ExtensionContext) {}
