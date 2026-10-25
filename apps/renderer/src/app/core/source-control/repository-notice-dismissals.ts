import { Injectable, signal } from '@angular/core';

type RepoKey = { provider: string; id: string };

const keyOf = (repo: RepoKey): string => `${repo.provider}:${repo.id}`;

/** Repos whose link notice was dismissed. Session-only; nothing is persisted. */
@Injectable({ providedIn: 'root' })
export class RepositoryNoticeDismissals {
  private readonly keys = signal<ReadonlySet<string>>(new Set());

  isDismissed(repo: RepoKey): boolean {
    return this.keys().has(keyOf(repo));
  }

  dismiss(repo: RepoKey): void {
    this.keys.update((keys) => new Set(keys).add(keyOf(repo)));
  }
}
