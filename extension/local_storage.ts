import { Memento } from 'vscode';

/**
 * A simple LocalStorageService to access global state within the VS Code context.
 */
export class LocalStorageService {
  constructor(private storage: Memento) {}

  public getValue<T>(key: string): T | undefined {
    return this.storage.get(key);
  }

  public setValue<T>(key: string, value: T) {
    this.storage.update(key, value);
  }

  public savingFromExtension(): Boolean {
    return this.storage.get('isSaveFromExtension') || false;
  }

  public setSavingFromExtension(value: Boolean) {
    this.storage.update('isSaveFromExtension', value);
  }
}
