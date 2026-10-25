import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { RepositoryRef } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText, toAscuaError } from '../../core/i18n/app-error';
import type { Text } from '../../core/i18n/text';
import { ProjectStore } from '../../core/projects/project-store';
import { SettingsStore } from '../../core/settings/settings-store';
import { RepositorySelection } from '../../core/source-control/repository-selection';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { Notice } from '../../shared/notice/notice';
import { Spinner } from '../../shared/spinner/spinner';
import {
  createCloneForm,
  parentOf,
  targetPath,
  toCloneInput,
  type ProjectCloneValue,
} from './project-clone-model';

/** Clone a repository and create a project linked to it (`clonar?provider=&repo=`). */
@Component({
  selector: 'app-project-clone-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslocoPipe,
    Icon,
    Button,
    Notice,
    Spinner,
  ],
  templateUrl: './project-clone-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectClonePage {
  private readonly store = inject(ProjectStore);
  private readonly settings = inject(SettingsStore);
  private readonly selection = inject(RepositorySelection);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap, {
    requireSync: false,
  });

  protected readonly form = createCloneForm(this.fb);
  protected readonly error = signal<Text | undefined>(undefined);
  protected readonly cloning = signal(false);
  private readonly formValue = signal<ProjectCloneValue>(
    this.form.getRawValue() as ProjectCloneValue,
  );

  protected readonly repo = computed(() => {
    const p = this.params();
    const provider = p?.get('provider');
    const id = p?.get('repo');
    return this.selection
      .repos()
      .find((r) => r.provider === provider && r.id === id);
  });
  protected readonly target = computed(() =>
    targetPath(this.formValue().parentDir, this.formValue().folderName),
  );

  private populatedFor: string | undefined;

  constructor() {
    this.form.valueChanges.subscribe(() =>
      this.formValue.set(this.form.getRawValue() as ProjectCloneValue),
    );
    effect(() => {
      const repo = this.repo();
      untracked(() => {
        if (!repo || this.populatedFor === repo.id) return;
        this.populatedFor = repo.id;
        this.form.patchValue({ name: repo.name, folderName: repo.name });
        void this.defaultParent(repo.id);
      });
    });
  }

  private async defaultParent(repoId: string): Promise<void> {
    const repo = this.repo();
    if (!repo) return;
    let parent = this.settings.settings().cloneDir ?? '';
    if (!parent) {
      try {
        const link = await this.store.repositoryLink(this.ref(repo));
        if (link?.state === 'none') parent = parentOf(link.path);
      } catch {
        // The user can still pick a folder.
      }
    }
    if (this.populatedFor === repoId && !this.form.controls.parentDir.dirty) {
      this.form.controls.parentDir.setValue(parent);
    }
  }

  private ref(repo: {
    provider: RepositoryRef['provider'];
    id: string;
    name: string;
    fullName: string;
  }): RepositoryRef {
    const { provider, id, name, fullName } = repo;
    return { provider, id, name, fullName };
  }

  protected async pickFolder(): Promise<void> {
    const path = await this.store.pickFolder(
      this.form.controls.parentDir.value || undefined,
    );
    if (path) {
      this.form.controls.parentDir.setValue(path);
      this.form.controls.parentDir.markAsDirty();
    }
  }

  protected clearColor(): void {
    this.form.controls.color.setValue(null);
  }

  protected async submit(): Promise<void> {
    const repo = this.repo();
    if (!repo || this.cloning()) return;
    this.cloning.set(true);
    this.error.set(undefined);
    try {
      const result = await this.store.clone(
        toCloneInput(
          this.form.getRawValue() as ProjectCloneValue,
          this.ref(repo),
        ),
      );
      if (result.ok) {
        await this.router.navigate(['/proyectos', result.project.id]);
      } else {
        this.error.set(errorText(result.error));
      }
    } catch (e) {
      this.error.set(errorText(toAscuaError(e)));
    } finally {
      this.cloning.set(false);
    }
  }
}
