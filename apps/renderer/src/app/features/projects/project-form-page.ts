import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorText } from '../../core/i18n/app-error';
import { text, type Text } from '../../core/i18n/text';
import { ProjectStore } from '../../core/projects/project-store';
import { Icon } from '../../shared/icon/icon';
import {
  createProjectForm,
  fromProject,
  toProjectInput,
  type ProjectFormValue,
} from './project-form-model';

/** Create (`nuevo`) or edit (`:projectId/editar`) a project; pistas live in the terminals tab. */
@Component({
  selector: 'app-project-form-page',
  imports: [ReactiveFormsModule, RouterLink, TranslocoPipe, Icon],
  templateUrl: './project-form-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectFormPage {
  readonly projectId = input<string>();

  protected readonly store = inject(ProjectStore);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  protected readonly form = createProjectForm(this.fb);
  protected readonly error = signal<Text | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly missing = signal(false);

  private populatedFor: string | undefined;

  constructor() {
    effect(() => {
      const id = this.projectId();
      const loaded = this.store.loaded();
      const project = this.store.byId(id);
      untracked(() => {
        if (id === undefined) {
          this.populatedFor = undefined;
          this.missing.set(false);
          return;
        }
        if (!loaded || this.populatedFor === id) return;
        if (!project) {
          this.missing.set(true);
          return;
        }
        this.missing.set(false);
        this.populatedFor = id;
        this.populate(fromProject(project));
      });
    });
  }

  protected async pickFolder(): Promise<void> {
    const path = await this.store.pickFolder();
    if (path) {
      this.form.controls.path.setValue(path);
      this.form.controls.path.markAsDirty();
    }
  }

  protected clearColor(): void {
    this.form.controls.color.setValue(null);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(undefined);
    try {
      const value = this.form.getRawValue() as ProjectFormValue;
      const result = await this.store.save(
        toProjectInput(value, this.store.byId(this.projectId())),
      );
      if (result.ok) {
        await this.router.navigate([
          '/proyectos',
          result.project.id,
          'terminales',
        ]);
      } else {
        this.error.set(errorText(result.error));
      }
    } catch {
      this.error.set(text('errors.project.saveFailed'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const id = this.projectId();
    if (id === undefined) return;
    if (!this.confirmingDelete()) {
      this.confirmingDelete.set(true);
      return;
    }
    try {
      await this.store.remove(id);
      await this.router.navigate(['/proyectos']);
    } catch {
      this.error.set(text('errors.project.deleteFailed'));
      this.confirmingDelete.set(false);
    }
  }

  private populate(value: ProjectFormValue): void {
    this.form.controls.name.setValue(value.name);
    this.form.controls.path.setValue(value.path);
    this.form.controls.color.setValue(value.color);
  }
}
