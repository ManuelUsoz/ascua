import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { RepositoryLink, RepositoryRef } from '@ascua/ipc';
import type { Repository } from '@ascua/source-control';
import { errorText, toAscuaError } from '../../core/i18n/app-error';
import type { Text } from '../../core/i18n/text';
import { ProjectStore } from '../../core/projects/project-store';
import { Button } from '../../shared/button/button';
import { Notice } from '../../shared/notice/notice';
import { Status, StatusState } from '../../shared/status/status';

/** Under the branch row: where the repo would live locally and whether a project covers it. */
@Component({
  selector: 'app-repository-link-notice',
  imports: [TranslocoPipe, Button, Notice, Status],
  templateUrl: './repository-link-notice.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositoryLinkNotice {
  private readonly router = inject(Router);
  private readonly projects = inject(ProjectStore);

  readonly repo = input.required<Repository>();
  protected readonly error = signal<Text | undefined>(undefined);

  private readonly ref = computed<RepositoryRef>(() => {
    const { provider, id, name, fullName } = this.repo();
    return { provider, id, name, fullName };
  });

  /** Reloads when the project list changes, so a link or clone refreshes it. */
  private readonly linkResource = resource({
    params: () => ({ ref: this.ref(), projects: this.projects.projects() }),
    loader: ({ params }) => this.projects.repositoryLink(params.ref),
  });

  protected readonly link = computed<RepositoryLink | undefined>(() =>
    this.linkResource.hasValue() ? this.linkResource.value() : undefined,
  );
  protected readonly visible = computed(
    () => this.projects.available && this.link() !== undefined,
  );

  /** Status chip: linked is ok, a matching project waiting to be linked is ask, none is idle. */
  protected readonly status = computed<StatusState>(() => {
    switch (this.link()?.state) {
      case 'linked':
        return 'running';
      case 'match':
        return 'waiting';
      default:
        return 'stopped';
    }
  });
  protected readonly statusLabel = computed<Text>(
    () => ({ key: `repositories.link.status.${this.link()?.state ?? 'none'}` }), // i18n-ignore: catalog key
  );

  /** One short sentence saying what this copy is and what the user can do with it. */
  protected readonly bodyKey = computed(
    () => `repositories.link.body.${this.link()?.state ?? 'none'}`, // i18n-ignore: catalog key
  );
  protected readonly bodyParams = computed(() => {
    const link = this.link();
    return link && link.state !== 'none' ? { name: link.project.name } : {};
  });

  protected open(id: string): void {
    void this.router.navigate(['/proyectos', id]);
  }

  protected create(): void {
    const { provider, id } = this.repo();
    void this.router.navigate(['/proyectos', 'clonar'], {
      queryParams: { provider, repo: id },
    });
  }

  protected async linkTo(projectId: string): Promise<void> {
    this.error.set(undefined);
    try {
      const result = await this.projects.linkRepository(projectId, this.ref());
      if (!result.ok) this.error.set(errorText(result.error));
    } catch (e) {
      this.error.set(errorText(toAscuaError(e)));
    }
  }
}
