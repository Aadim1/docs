import {
  FileSystemWatcher,
  Uri,
  workspace,
  Range,
  WorkspaceEdit
} from 'vscode';

import { getAbsolutePath, getFileContent } from './utils';
import { LocalStorageService } from './local_storage';

export class FileWatcherService {
  private fileWatchers: { [key: string]: FileSystemWatcher } = {};
  private storage: LocalStorageService | undefined = undefined;

  constructor() {}

  /**
   * The reason we don't do this in constructor is because, we would like to retain, the
   * FileWatcherService instance throughout the application(activate and deactivate), and it is only possible
   * if we don't pass any arguments to the constructor.
   */
  public init(storage: LocalStorageService) {
    this.dispose();
    this.storage = storage;
  }

  /**
   * An utility function to detect changes in the source(code snippet) file and then reflect the change in
   * the mdx file that depends on them.
   * @param snippetPath The path to the file being watched.
   * @param mdxUri To open the text document. Like the current file.
   * @param initialRange The range to where the file content will be changed, if the fileWatcher detect change.
   */
  public setupFileWatcher(snippetPath: string, mdxUri: Uri) {
    if (this.storage == undefined) {
      throw Error('FileWatcherService has not been initialized yet.');
    }

    const absolutePath = getAbsolutePath(snippetPath);

    if (this.fileWatchers[absolutePath]) {
      this.fileWatchers[absolutePath].dispose();
    }

    const watcher = workspace.createFileSystemWatcher(absolutePath);

    watcher.onDidChange(async () => {
      const document = await workspace.openTextDocument(mdxUri);
      const text = document.getText();
      const regex = /```(.*?)? snippetPath="(.*?)"(.*?)?([^]*?)```/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const [fullMatch, _, matchedPath] = match;
        if (matchedPath === snippetPath) {
          const startPosition = document.positionAt(match.index);
          const endPosition = document.positionAt(
            match.index + fullMatch.length
          );
          const range = new Range(startPosition, endPosition);

          const firstLine = fullMatch.split('\n')[0];
          const content = await getFileContent(snippetPath);
          if (content !== null) {
            const newContent = content
              .split('\n')
              .map((line) => line.trimEnd())
              .join('\n');
            const newSnippet = `${firstLine}\n\n// AUTOMATICALLY GENERATED: DO NOT MODIFY // \n\n${newContent}\n// AUTOMATICALLY GENERATED END // \n\`\`\``;

            const edit = new WorkspaceEdit();
            edit.replace(mdxUri, range, newSnippet);
            await workspace.applyEdit(edit);

            this.storage!.setSavingFromExtension(true);
            await document.save();
            this.storage!.setSavingFromExtension(false);
          }
          break;
        }
      }
    });

    this.fileWatchers[absolutePath] = watcher;
  }

  public getFileWatchers() {
    if (!this.storage) {
      throw Error('FileWatcherService has not been initialized yet.');
    }
    return this.fileWatchers;
  }

  public dispose() {
    Object.values(this.fileWatchers).forEach((watcher) => watcher.dispose());
  }
}
