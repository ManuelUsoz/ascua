import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { ToolKind } from '@ascua/chat';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icon } from '../../../shared/icon/icon';
import { toolIcon } from './tool-icon';

const STATUS_KEY = {
  running: 'chats.part.toolRunning',
  done: 'chats.part.toolDone',
  failed: 'chats.part.toolFailed',
} as const;

@Component({
  selector: 'app-tool-part',
  imports: [TranslocoPipe, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-tool', '[attr.data-status]': 'status()' },
  template: `
    <app-icon [name]="icon()" />
    <span class="chat-tool__title">{{ title() }}</span>
    <span class="chat-tool__status">{{ statusKey() | transloco }}</span>
  `,
})
export class ToolPart {
  readonly tool = input.required<ToolKind>();
  readonly title = input.required<string>();
  readonly status = input.required<'running' | 'done' | 'failed'>();

  protected readonly icon = computed(() => toolIcon(this.tool()));
  protected readonly statusKey = computed(() => STATUS_KEY[this.status()]);
}
