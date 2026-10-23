import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
  type OnInit,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { TerminalSpec } from '@ascua/ipc';
import { ProjectStore } from '../../core/projects/project-store';
import { Icon } from '../../shared/icon/icon';
import { PistaEditor } from './pista-editor';
import {
  createPistaForm,
  folderLabel,
  toTerminalInput,
  type PistaFormValue,
} from './pista-form-model';

/** Inline popover to create or edit one pista of a project. */
@Component({
  selector: 'app-pista-form',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './pista-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PistaForm implements OnInit {
  readonly projectId = input.required<string>();
  /** The pista being edited; absent when creating. */
  readonly spec = input<TerminalSpec>();

  private readonly store = inject(ProjectStore);
  private readonly editor = inject(PistaEditor);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = createPistaForm(this.fb);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly confirmingRemove = signal(false);
  protected readonly folder = signal(this.form.controls.cwd.value);
  protected readonly folderText = computed(() => folderLabel(this.folder()));

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => host.nativeElement.querySelector<HTMLInputElement>('#pista-name')?.focus());
  }

  /** The parent re-creates this component per draft, so inputs are read once. */
  ngOnInit(): void {
    const spec = this.spec();
    if (!spec) return;
    this.form.setValue({
      name: spec.name,
      command: spec.command,
      cwd: spec.cwd ?? '',
      port: spec.port ?? null,
    });
    this.folder.set(spec.cwd ?? '');
  }

  protected async pickFolder(): Promise<void> {
    const result = await this.store.pickPistaFolder(this.projectId());
    if (!result) return;
    if (result.ok) {
      this.error.set(undefined);
      this.form.controls.cwd.setValue(result.cwd);
      this.folder.set(result.cwd);
    } else {
      this.error.set(result.error);
    }
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(undefined);
    try {
      const value = this.form.getRawValue() as PistaFormValue;
      const result = await this.store.savePista(
        this.projectId(),
        toTerminalInput(value, this.spec()?.id),
      );
      if (result.ok) this.editor.close();
      else this.error.set(result.error);
    } catch {
      this.error.set('No se pudo guardar la pista');
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const spec = this.spec();
    if (!spec) return;
    if (!this.confirmingRemove()) {
      this.confirmingRemove.set(true);
      return;
    }
    try {
      const result = await this.store.removePista(this.projectId(), spec.id);
      if (result.ok) this.editor.close();
      else this.error.set(result.error);
    } catch {
      this.error.set('No se pudo quitar la pista');
      this.confirmingRemove.set(false);
    }
  }

  protected cancel(event?: Event): void {
    // Escape would otherwise collapse the room (app.ts).
    event?.stopPropagation();
    this.editor.close();
  }
}
