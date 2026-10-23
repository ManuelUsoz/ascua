import { Injectable, computed, signal } from '@angular/core';
import type { TerminalSpec } from '@ascua/ipc';

/** Which pista the inline form is editing; shared by the project head and the grid. */
@Injectable()
export class PistaEditor {
  readonly draft = signal<TerminalSpec | 'new' | undefined>(undefined);

  /** The open draft as a list, so `@for ... track` re-creates the form per draft. */
  readonly open = computed(() => {
    const draft = this.draft();
    return draft ? [draft] : [];
  });

  create(): void {
    this.draft.set('new');
  }

  edit(spec: TerminalSpec): void {
    this.draft.set(spec);
  }

  close(): void {
    this.draft.set(undefined);
  }
}
