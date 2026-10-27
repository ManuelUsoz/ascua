import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';
import { agentColor, type ToolGroup, type ToolUsePart } from '@ascua/chat';
import { TranslocoPipe } from '@jsverse/transloco';
import { pluralKey } from '../../../core/i18n/text';
import { CollapsibleCard } from '../../../shared/collapsible-card/collapsible-card';
import { Icon } from '../../../shared/icon/icon';
import { Spinner } from '../../../shared/spinner/spinner';
import { Swatch } from '../../../shared/swatch/swatch';

interface Row {
  id: string;
  name: string;
  target: string;
  status: ToolUsePart['status'];
  seconds?: number;
  error?: string;
  result?: string;
  fullName: string;
}

/** `mcp__server__tool` -> `tool`; other names unchanged. */
function short(name: string): string {
  if (!name.startsWith('mcp__')) return name;
  const i = name.lastIndexOf('__');
  return i >= 0 && i + 2 < name.length ? name.slice(i + 2) : name;
}

function row(c: ToolUsePart, results: ToolGroup['results'] = {}): Row {
  const at = c.title.indexOf(':');
  const name = at < 0 ? c.title : c.title.slice(0, at).trim();
  const rest = at < 0 ? '' : c.title.slice(at + 1).trim();
  const r: Row = {
    id: c.toolUseId,
    name: short(name),
    fullName: name,
    target: c.path ?? rest,
    status: c.status,
  };
  const res = results[c.toolUseId];
  if (res?.isError && res.summary) r.error = res.summary;
  else if (res && !res.isError && res.summary) r.result = res.summary;
  if (c.startedAt !== undefined && c.endedAt !== undefined) {
    r.seconds = Math.max(0, Math.round((c.endedAt - c.startedAt) / 1000));
  }
  return r;
}

/** One card per run of consecutive tool calls, with subagent blocks. */
@Component({
  selector: 'app-tool-group',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    CollapsibleCard,
    Icon,
    Spinner,
    Swatch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-toolgroup' },
  template: `
    <app-collapsible-card [(expanded)]="expanded">
      <span summary class="chat-tg__summary">{{ summary() }}</span>
      <span meta class="chat-tg__meta">
        @if (subagentKey(); as key) {
          {{ key | transloco: { count: subagents().length } }}
        }
        @if (errorCount() > 0) {
          @if (subagentKey()) {
            ·
          }
          {{ errorKey() | transloco: { count: errorCount() } }}
        }
        @if ((subagentKey() || errorCount() > 0) && seconds() !== undefined) {
          ·
        }
        @if (seconds() !== undefined) {
          {{ 'chats.activity.seconds' | transloco: { count: seconds() } }}
        }
      </span>
      <ng-template #rowBody let-r>
        <span class="chat-tg__tool" [attr.title]="r.fullName">{{
          r.name
        }}</span>
        <span class="chat-tg__target">{{ r.target }}</span>
        @if (r.result !== undefined) {
          <app-icon
            class="chat-tg__chev"
            [class.chat-tg__chev--open]="openIds().has(r.id)"
            name="chevron-down"
            aria-hidden="true"
          />
        }
        @if (r.status === 'running') {
          <app-spinner [size]="12" tone="violeta" aria-hidden="true" />
        } @else if (r.seconds !== undefined) {
          <span class="chat-tg__time">{{
            'chats.activity.seconds' | transloco: { count: r.seconds }
          }}</span>
        }
      </ng-template>
      <ng-template #rowFull let-r let-i="i" let-nested="nested">
        @if (r.result !== undefined) {
          <button
            type="button"
            class="chat-tg__row chat-tg__row--btn"
            [class.chat-tg__row--nested]="nested"
            [attr.aria-expanded]="openIds().has(r.id)"
            [attr.data-status]="r.status"
            [style.--i]="i"
            (click)="toggleResult(r.id)"
          >
            <ng-container
              *ngTemplateOutlet="rowBody; context: { $implicit: r }"
            />
          </button>
          @if (openIds().has(r.id)) {
            <pre class="chat-tg__result">{{ r.result }}</pre>
          }
        } @else {
          <div
            class="chat-tg__row"
            [class.chat-tg__row--nested]="nested"
            [attr.data-status]="r.status"
            [style.--i]="i"
          >
            <ng-container
              *ngTemplateOutlet="rowBody; context: { $implicit: r }"
            />
          </div>
        }
        @if (r.error) {
          <div class="chat-tg__error" [attr.title]="r.error">{{ r.error }}</div>
        }
      </ng-template>
      @for (r of rows(); track r.id; let i = $index) {
        <ng-container
          *ngTemplateOutlet="
            rowFull;
            context: { $implicit: r, i: i, nested: false }
          "
        />
      }
      @for (s of subagents(); track s.id) {
        <div class="chat-tg__agent" [style.--agent]="s.color">
          <div class="chat-tg__agenthead">
            <app-swatch [color]="s.color" [pulse]="s.running" />
            <span class="chat-tg__agentname">{{ s.name }}</span>
            <span class="chat-tg__agentdesc">{{ s.description }}</span>
            @if (s.running) {
              <span class="chat-tg__time">{{
                'chats.activity.running' | transloco
              }}</span>
            } @else if (s.seconds !== undefined) {
              <span class="chat-tg__time">{{
                'chats.activity.seconds' | transloco: { count: s.seconds }
              }}</span>
            }
          </div>
          <div class="chat-tg__nested">
            @for (r of s.rows; track r.id; let i = $index) {
              <ng-container
                *ngTemplateOutlet="
                  rowFull;
                  context: { $implicit: r, i: i, nested: true }
                "
              />
            }
          </div>
        </div>
      }
    </app-collapsible-card>
  `,
})
export class ToolGroupView {
  readonly group = input.required<ToolGroup>();
  protected readonly expanded = signal(false);
  private touched = false;
  protected readonly openIds = signal<ReadonlySet<string>>(new Set());

  protected toggleResult(id: string): void {
    this.openIds.update((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  protected readonly running = computed(() => {
    const g = this.group();
    return (
      g.calls.some((c) => c.status === 'running') ||
      g.subagents.some(
        (s) => s.running || s.calls.some((c) => c.status === 'running'),
      )
    );
  });
  protected readonly failed = computed(() => {
    const g = this.group();
    return (
      g.calls.some((c) => c.status === 'failed') ||
      g.subagents.some(
        (s) =>
          s.call.status === 'failed' ||
          s.calls.some((c) => c.status === 'failed'),
      )
    );
  });
  protected readonly errorCount = computed(() => {
    const g = this.group();
    const bad = (c: ToolUsePart) =>
      c.status === 'failed' || !!g.results[c.toolUseId]?.isError;
    return (
      g.calls.filter(bad).length +
      g.subagents.reduce((n, s) => n + s.calls.filter(bad).length, 0)
    );
  });
  protected readonly errorKey = computed(() =>
    pluralKey('chats.activity.errors', this.errorCount()),
  );
  protected readonly rows = computed(() =>
    this.group().calls.map((c) => row(c, this.group().results)),
  );
  protected readonly subagents = computed(() =>
    this.group().subagents.map((s) => ({
      id: s.call.toolUseId,
      name: s.agent,
      description: s.description ?? '',
      color: agentColor(s.agent),
      running: s.running,
      seconds:
        s.durationMs === undefined
          ? undefined
          : Math.round(s.durationMs / 1000),
      rows: s.calls.map((c) => row(c, this.group().results)),
    })),
  );
  protected readonly summary = computed(
    () =>
      this.group()
        .counts.map((c) => `${short(c.tool)} ×${c.count}`) // i18n-ignore: tool names
        .join(' · '), // i18n-ignore: separator
  );
  protected readonly subagentKey = computed(() => {
    const n = this.group().subagents.length;
    return n ? pluralKey('chats.activity.subagents', n) : undefined;
  });
  protected readonly seconds = computed(() => {
    const d = this.group().durationMs;
    return d === undefined ? undefined : Math.round(d / 1000);
  });

  constructor() {
    // Open while work is running, fold when done; a user toggle wins.
    effect(() => {
      const want = this.running() || this.failed();
      untracked(() => {
        if (!this.touched) this.expanded.set(want);
      });
    });
    effect(() => {
      const open = this.expanded();
      untracked(() => {
        if (open !== (this.running() || this.failed())) this.touched = true;
      });
    });
  }
}
