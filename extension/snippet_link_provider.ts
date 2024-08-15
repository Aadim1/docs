import {
  DocumentLinkProvider,
  TextDocument,
  DocumentLink,
  Range,
  Uri,
  ProviderResult
} from 'vscode';
import * as fs from 'fs';

import { getAbsolutePath } from './utils';

export class SnippetDocumentLinkProvider implements DocumentLinkProvider {
  provideDocumentLinks(document: TextDocument): ProviderResult<DocumentLink[]> {
    const regex = /snippetPath="(.*?)"/g;
    const text = document.getText();
    let match;
    const links: DocumentLink[] = [];

    while ((match = regex.exec(text)) !== null) {
      const snippetPath = match[1];
      const startPosition = document.positionAt(match.index);
      const endPosition = document.positionAt(match.index + match[0].length);
      const range = new Range(startPosition, endPosition);

      const absolutePath = getAbsolutePath(snippetPath);

      // If the snippet path doesn't exist, we won't push a link.
      if (!fs.existsSync(absolutePath)) {
        continue;
      }

      const uri = Uri.file(absolutePath);
      links.push(new DocumentLink(range, uri));
    }

    return links;
  }
}
