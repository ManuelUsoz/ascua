import { Injectable, signal } from '@angular/core';

/**
 * Tracks unsaved editor changes and the "discard them?" question shared by
 * every way of leaving the editor (tab, file, project, window close).
 */
@Injectable({ providedIn: 'root' })
export class UnsavedChanges {
  readonly dirty = signal(false);
  /** The path being edited while the discard question is open. */
  readonly prompt = signal<string | undefined>(undefined);
  private pending?: Promise<boolean>;
  private resolve?: (discard: boolean) => void;

  /** True at once when clean; otherwise waits for `answer`. */
  confirmDiscard(path = ''): Promise<boolean> {
    if (!this.dirty()) return Promise.resolve(true);
    if (this.pending) return this.pending;
    this.prompt.set(path);
    this.pending = new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
    return this.pending;
  }

  answer(discard: boolean): void {
    const resolve = this.resolve;
    this.pending = undefined;
    this.resolve = undefined;
    this.prompt.set(undefined);
    // Discarding does not clear `dirty`: the editor still holds the edits until
    // the navigation really happens (FileBrowser resets it on open/destroy).
    resolve?.(discard);
  }
}
