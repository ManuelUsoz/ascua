import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import {
  PERMISSION_MODES,
  resolveSelection,
  type ModelCatalog,
  type PermissionMode,
  type ReasoningEffort,
} from '@ascua/chat';
import type { ChatSessionPatch } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import type { IconName } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { AsSelect, type SelectOption } from '../../../shared/select/select';

const PERMISSION_ICONS: Record<PermissionMode, IconName> = {
  supervised: 'lock',
  acceptEdits: 'edit',
  auto: 'sparkles',
  fullAccess: 'unlock',
};

/** Model, reasoning effort and permission mode selectors of the composer. */
@Component({
  selector: 'app-composer-controls',
  imports: [TranslocoPipe, AsSelect, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-composer__controls' },
  template: `
    <select
      class="as-input as-select chat-composer__select chat-composer__select--model"
      [attr.aria-label]="'chats.composer.model.label' | transloco"
      [disabled]="running()"
      (change)="onModel($event)"
    >
      <option value="" [selected]="!model()">
        {{ 'chats.composer.model.default' | transloco }}
      </option>
      @for (m of models(); track m.id) {
        <option [value]="m.id" [selected]="m.id === model()">
          {{ m.label ?? m.id }}
        </option>
      }
    </select>
    @if (loading()) {
      <app-spinner [size]="12" [label]="'chats.loading' | transloco" />
    }
    <select
      class="as-input as-select chat-composer__select chat-composer__select--effort"
      [attr.aria-label]="'chats.composer.effort.label' | transloco"
      [disabled]="running() || efforts().length === 0"
      (change)="onEffort($event)"
    >
      <option value="" [selected]="!selectedEffort()">
        {{ 'chats.composer.effort.default' | transloco }}
      </option>
      @for (e of efforts(); track e) {
        <option [value]="e" [selected]="e === selectedEffort()">
          {{ 'chats.composer.effort.' + e | transloco }}
        </option>
      }
    </select>
    <app-select
      class="chat-composer__perm"
      placement="up"
      triggerClass="chat-composer__select chat-composer__select--permission"
      [options]="permissionOptions"
      [selected]="permissionMode()"
      [ariaLabel]="'chats.composer.permission.label' | transloco"
      (picked)="onPermission($event)"
    />
  `,
})
export class ComposerControls {
  readonly catalog = input<ModelCatalog | undefined>(undefined);
  readonly model = input<string | undefined>(undefined);
  readonly effort = input<ReasoningEffort | undefined>(undefined);
  readonly permissionMode = input<PermissionMode>('fullAccess');
  readonly running = input(false);
  readonly loading = input(false);
  readonly changed = output<ChatSessionPatch>();

  protected readonly permissionOptions: SelectOption[] = PERMISSION_MODES.map(
    (mode) => ({
      value: mode,
      label: `chats.composer.permission.${mode}`,
      hint: `chats.composer.permission.${mode}Hint`,
      icon: PERMISSION_ICONS[mode],
    }),
  );
  protected readonly models = computed(() => this.catalog()?.models ?? []);
  private readonly selection = computed(() => {
    const catalog = this.catalog();
    return catalog
      ? resolveSelection(catalog, this.model(), this.effort())
      : undefined;
  });
  protected readonly efforts = computed(
    () => this.selection()?.model?.efforts ?? [],
  );
  protected readonly selectedEffort = computed(() => this.selection()?.effort);

  protected onModel(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    const catalog = this.catalog();
    const next = catalog
      ? resolveSelection(catalog, id || undefined, this.effort())
      : undefined;
    const patch: ChatSessionPatch = { model: id || null };
    if (this.effort() && !next?.effort) patch.effort = null;
    this.changed.emit(patch);
  }

  protected onEffort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.changed.emit({ effort: (value || null) as ReasoningEffort | null });
  }

  protected onPermission(value: string): void {
    this.changed.emit({ permissionMode: value as PermissionMode });
  }
}
