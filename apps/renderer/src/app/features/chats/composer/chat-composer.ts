import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  DEFAULT_PERMISSION_MODE,
  type ChatCommand,
  type ChatModeId,
  type ModelCatalog,
  type PermissionMode,
  type ReasoningEffort,
} from '@ascua/chat';
import type { ChatSessionPatch } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../../shared/button/button';
import { Icon } from '../../../shared/icon/icon';
import { ComposerControls } from './composer-controls';
import { detectTrigger, rankCommands, replaceRange } from './composer-trigger';

const GROUPS: ChatCommand['source'][] = ['builtin', 'nxy', 'custom'];

/**
 * Prompt box: Enter sends, Shift+Enter adds a line, Escape closes the command
 * menu or stops the run. Typing `/` opens the command menu.
 */
@Component({
  selector: 'app-chat-composer',
  imports: [TranslocoPipe, Button, Icon, ComposerControls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-composer' },
  template: `
    @if (menuOpen()) {
      <div
        class="chat-commands"
        id="chat-commands"
        role="listbox"
        [attr.aria-label]="'chats.commands.label' | transloco"
      >
        @for (group of groups(); track group.source) {
          <div
            role="group"
            class="chat-commands__group"
            [attr.aria-label]="
              'chats.commands.group.' + group.source | transloco
            "
          >
            <span class="chat-commands__heading" aria-hidden="true">
              {{ 'chats.commands.group.' + group.source | transloco }}
            </span>
            @for (item of group.items; track item.command.name) {
              <div
                role="option"
                class="chat-commands__item"
                [class.chat-commands__item--active]="
                  item.index === activeIndex()
                "
                [id]="'chat-commands-' + item.index"
                [attr.aria-selected]="item.index === activeIndex()"
                (mousedown)="pick($event, item.command)"
              >
                <span class="chat-commands__name"
                  >/{{ item.command.name }}</span
                >
                @if (item.command.argumentHint) {
                  <span class="chat-commands__hint">{{
                    item.command.argumentHint
                  }}</span>
                }
                @if (item.command.source === 'custom') {
                  <span class="chat-commands__desc">{{
                    item.command.description
                  }}</span>
                } @else {
                  <span class="chat-commands__desc">{{
                    'chats.commands.' + item.command.name | transloco
                  }}</span>
                }
              </div>
            }
          </div>
        }
      </div>
    }
    <div class="chat-composer__box">
      <textarea
        class="chat-composer__input"
        rows="3"
        role="combobox"
        aria-autocomplete="list"
        [attr.aria-expanded]="menuOpen()"
        [attr.aria-controls]="menuOpen() ? 'chat-commands' : null"
        [attr.aria-activedescendant]="
          menuOpen() ? 'chat-commands-' + activeIndex() : null
        "
        [value]="draft()"
        [disabled]="disabled()"
        [attr.aria-label]="'chats.composer.label' | transloco"
        [placeholder]="'chats.composer.placeholder' | transloco"
        #prompt
        (input)="onInput($event)"
        (keyup)="syncCursor($event)"
        (click)="syncCursor($event)"
        (keydown)="onKey($event)"
      ></textarea>
      <div class="chat-composer__actions">
        <button
          appButton
          icon
          type="button"
          variant="ghost"
          class="chat-composer__attach"
          disabled
          [attr.aria-label]="'chats.composer.attach' | transloco"
          [title]="'chats.composer.attachSoon' | transloco"
        >
          <app-icon name="paperclip" />
        </button>
        <app-composer-controls
          [catalog]="catalog()"
          [model]="model()"
          [effort]="effort()"
          [permissionMode]="permissionMode()"
          [running]="running()"
          [loading]="loading()"
          (changed)="runtimeChanged.emit($event)"
        />
        @if (mode() !== 'chat') {
          <span class="chat-composer__chip">
            {{ 'chats.composer.mode.' + mode() | transloco }}
            <button
              appButton
              type="button"
              size="s"
              variant="ghost"
              (clicked)="modeCleared.emit()"
            >
              {{ 'chats.composer.exitMode' | transloco }}
            </button>
          </span>
        }
        <span class="chat-composer__spacer"></span>
        @if (running()) {
          <button
            appButton
            type="button"
            variant="danger"
            size="s"
            class="chat-composer__stop"
            (clicked)="aborted.emit()"
          >
            {{ 'chats.composer.stop' | transloco }}
          </button>
        } @else {
          <button
            appButton
            icon
            type="button"
            variant="primary"
            class="chat-composer__send"
            [disabled]="!canSend()"
            [attr.aria-label]="'chats.composer.send' | transloco"
            (clicked)="submit()"
          >
            <app-icon name="arrow-up" />
          </button>
        }
      </div>
    </div>
  `,
})
export class ChatComposer {
  readonly disabled = input(false);
  readonly running = input(false);
  readonly loading = input(false);
  readonly commands = input<readonly ChatCommand[]>([]);
  readonly permissionMode = input<PermissionMode>(DEFAULT_PERMISSION_MODE);
  readonly model = input<string | undefined>(undefined);
  readonly effort = input<ReasoningEffort | undefined>(undefined);
  readonly catalog = input<ModelCatalog | undefined>(undefined);
  readonly mode = input<ChatModeId>('chat');
  readonly submitted = output<string>();
  readonly aborted = output<void>();
  readonly runtimeChanged = output<ChatSessionPatch>();
  readonly modeCleared = output<void>();

  private readonly textarea =
    viewChild<ElementRef<HTMLTextAreaElement>>('prompt');
  protected readonly draft = signal('');
  protected readonly cursor = signal(0);
  protected readonly dismissed = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly canSend = computed(
    () => !this.disabled() && !this.running() && this.draft().trim() !== '',
  );

  /** Commands whose name starts with the draft's `/prefix`, grouped in order. */
  protected readonly trigger = computed(() =>
    this.dismissed() ? undefined : detectTrigger(this.draft(), this.cursor()),
  );
  protected readonly suggestions = computed<ChatCommand[]>(() => {
    const trigger = this.trigger();
    if (!trigger) return [];
    const ranked = rankCommands(this.commands(), trigger.query);
    return GROUPS.flatMap((source) =>
      ranked.filter((c) => c.source === source),
    );
  });
  protected readonly menuOpen = computed(() => this.suggestions().length > 0);
  protected readonly groups = computed(() => {
    let offset = 0;
    return GROUPS.map((source) => {
      const items = this.suggestions().filter((c) => c.source === source);
      const group = {
        source,
        items: items.map((command, i) => ({ command, index: offset + i })),
      };
      offset += items.length;
      return group;
    }).filter((g) => g.items.length > 0);
  });

  protected onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    this.cursor.set(el.selectionStart);
    this.dismissed.set(false);
    this.activeIndex.set(0);
  }

  protected syncCursor(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    if (el.selectionStart === this.cursor()) return;
    this.cursor.set(el.selectionStart);
    this.dismissed.set(false);
    this.activeIndex.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.menuOpen()) this.dismissed.set(true);
      else if (this.running()) this.aborted.emit();
      return;
    }
    if (this.menuOpen() && this.navigateMenu(event)) return;
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      this.submit();
    }
  }

  protected pick(event: MouseEvent, command: ChatCommand): void {
    // Keeps the focus in the textarea.
    event.preventDefault();
    this.complete(command);
  }

  protected submit(): void {
    if (!this.canSend()) return;
    const value = this.draft().trim();
    this.draft.set('');
    this.submitted.emit(value);
  }

  /** Arrows move the highlight; Tab or Enter completes. True when handled. */
  private navigateMenu(event: KeyboardEvent): boolean {
    const list = this.suggestions();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : list.length - 1;
      this.activeIndex.set((this.activeIndex() + step) % list.length);
      return true;
    }
    if (
      event.key === 'Tab' ||
      (event.key === 'Enter' && !event.shiftKey && !event.isComposing)
    ) {
      event.preventDefault();
      const picked = list[this.activeIndex()] ?? list[0];
      if (picked) this.complete(picked);
      return true;
    }
    return false;
  }

  private complete(command: ChatCommand): void {
    const trigger = this.trigger();
    if (!trigger) return;
    const next = replaceRange(
      this.draft(),
      trigger.rangeStart,
      trigger.rangeEnd,
      `/${command.name} `, // i18n-ignore: command syntax, not UI text
    );
    this.draft.set(next.text);
    this.cursor.set(next.cursor);
    this.activeIndex.set(0);
    const el = this.textarea()?.nativeElement;
    if (el) {
      el.value = next.text;
      el.setSelectionRange(next.cursor, next.cursor);
    }
  }
}
