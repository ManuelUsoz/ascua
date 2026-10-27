import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { Question, QuestionPart } from '@ascua/chat';
import type { AscuaError } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { ChatStore } from '../../../core/chats/chat-store';
import { errorText } from '../../../core/i18n/app-error';
import { Button } from '../../../shared/button/button';
import { Notice } from '../../../shared/notice/notice';

/** Selection of one question: picked labels plus the free-text "other". */
interface Choice {
  picked: string[];
  other: boolean;
  text: string;
}

const OTHER_MAX = 1000;

function empty(): Choice {
  return { picked: [], other: false, text: '' };
}

/** The answer string the agent gets: labels in option order, then free text. */
export function answerOf(q: Question, c: Choice): string {
  const labels = q.options
    .map((o) => o.label)
    .filter((l) => c.picked.includes(l));
  const text = c.other ? c.text.trim() : '';
  return [...labels, ...(text ? [text] : [])].join(', ');
}

let nextId = 0;

/** Inline card for the agent's questions: pick, answer or skip. */
@Component({
  selector: 'app-question-part',
  imports: [TranslocoPipe, Button, Notice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-q', '[attr.data-state]': 'part().state' },
  template: `
    @if (part().state === 'pending') {
      @for (q of questions(); track $index; let qi = $index) {
        <fieldset class="chat-q__set">
          <legend class="chat-q__legend">
            @if (q.header) {
              <span class="chat-q__chip">{{ q.header }}</span>
            }
            <span class="chat-q__text">{{ q.question }}</span>
            <span class="chat-q__hint">{{
              (q.multiSelect
                ? 'chats.question.pickAny'
                : 'chats.question.pickOne'
              ) | transloco
            }}</span>
          </legend>
          @for (o of q.options; track $index) {
            <label
              class="chat-q__opt"
              [attr.data-selected]="choices()[qi].picked.includes(o.label)"
            >
              <input
                class="chat-q__input"
                [type]="q.multiSelect ? 'checkbox' : 'radio'"
                [name]="name(qi)"
                [checked]="choices()[qi].picked.includes(o.label)"
                [disabled]="busy()"
                (change)="pick(qi, o.label, q.multiSelect)"
              />
              <span
                class="chat-q__mark"
                [attr.data-multi]="q.multiSelect"
                aria-hidden="true"
              ></span>
              <span class="chat-q__body">
                <span class="chat-q__label">{{ o.label }}</span>
                @if (o.description) {
                  <span class="chat-q__desc">{{ o.description }}</span>
                }
              </span>
            </label>
          }
          <label
            class="chat-q__opt chat-q__opt--other"
            [attr.data-selected]="choices()[qi].other"
          >
            <input
              class="chat-q__input"
              [type]="q.multiSelect ? 'checkbox' : 'radio'"
              [name]="name(qi)"
              [checked]="choices()[qi].other"
              [disabled]="busy()"
              (change)="pickOther(qi, q.multiSelect)"
            />
            <span
              class="chat-q__mark"
              [attr.data-multi]="q.multiSelect"
              aria-hidden="true"
            ></span>
            <span class="chat-q__label">{{
              'chats.question.other' | transloco
            }}</span>
            <input
              class="chat-q__other"
              type="text"
              [maxLength]="otherMax"
              [value]="choices()[qi].text"
              [disabled]="busy()"
              [placeholder]="'chats.question.otherPlaceholder' | transloco"
              [attr.aria-label]="'chats.question.otherPlaceholder' | transloco"
              (input)="typeOther(qi, $event, q.multiSelect)"
            />
          </label>
        </fieldset>
      }
      <div class="chat-q__foot">
        <button
          appButton
          type="button"
          variant="primary"
          size="s"
          [disabled]="!complete() || busy()"
          (clicked)="answer()"
        >
          {{ 'chats.question.answer' | transloco }}
        </button>
        <button
          appButton
          type="button"
          variant="ghost"
          size="s"
          [disabled]="busy()"
          (clicked)="skip()"
        >
          {{ 'chats.question.skip' | transloco }}
        </button>
        <span class="chat-q__spacer"></span>
        <span class="chat-q__wait">{{
          'chats.question.waiting' | transloco
        }}</span>
      </div>
      @if (error(); as e) {
        <app-notice type="error" [title]="e" />
      }
    } @else {
      @for (q of questions(); track $index) {
        <div class="chat-q__done">
          <span class="chat-q__text">{{ q.question }}</span>
          @if (part().state === 'skipped') {
            <span class="chat-q__answer" data-skipped="true">{{
              'chats.question.skipped' | transloco
            }}</span>
          } @else {
            <span class="chat-q__answer">{{ settledAnswer(q) }}</span>
          }
        </div>
      }
    }
  `,
})
export class QuestionCard {
  readonly projectId = input.required<string>();
  readonly sessionId = input.required<string>();
  readonly part = input.required<QuestionPart>();

  private readonly store = inject(ChatStore);
  private readonly uid = `chat-q-${++nextId}`;
  protected readonly otherMax = OTHER_MAX;
  protected readonly busy = signal(false);
  protected readonly error = signal<ReturnType<typeof errorText> | undefined>(
    undefined,
  );
  protected readonly questions = computed(() => this.part().request.questions);
  /** Resets whenever a new request arrives. */
  protected readonly choices = linkedSignal<Choice[]>(() =>
    this.questions().map(() => empty()),
  );

  /** Every question has a non-empty answer. */
  protected readonly complete = computed(() => {
    const qs = this.questions();
    const cs = this.choices();
    return qs.every((q, i) => !!cs[i] && answerOf(q, cs[i]) !== '');
  });

  protected name(qi: number): string {
    return `${this.uid}-${qi}`;
  }

  protected settledAnswer(q: Question): string {
    return this.part().answers?.[q.question] ?? '';
  }

  private update(qi: number, fn: (c: Choice) => Choice): void {
    this.choices.update((cs) => cs.map((c, i) => (i === qi ? fn(c) : c)));
  }

  protected pick(qi: number, label: string, multi: boolean): void {
    this.update(qi, (c) => {
      if (!multi) return { ...c, picked: [label], other: false };
      const picked = c.picked.includes(label)
        ? c.picked.filter((l) => l !== label)
        : [...c.picked, label];
      return { ...c, picked };
    });
  }

  protected pickOther(qi: number, multi: boolean): void {
    this.update(qi, (c) =>
      multi ? { ...c, other: !c.other } : { ...c, picked: [], other: true },
    );
  }

  protected typeOther(qi: number, event: Event, multi: boolean): void {
    const text = (event.target as HTMLInputElement).value;
    // Typing selects "other"; a single-select question drops its pick.
    const typed = text.trim() !== '';
    this.update(qi, (c) => ({
      text,
      other: typed || c.other,
      picked: typed && !multi ? [] : c.picked,
    }));
  }

  protected answer(): void {
    if (!this.complete()) return;
    const answers: Record<string, string> = {};
    const cs = this.choices();
    this.questions().forEach(
      (q, i) => (answers[q.question] = answerOf(q, cs[i])),
    );
    void this.send(answers);
  }

  protected skip(): void {
    void this.send(null);
  }

  private async send(answers: Record<string, string> | null): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(undefined);
    const failure: AscuaError | undefined = await this.store.resolveQuestion(
      this.projectId(),
      this.sessionId(),
      this.part().request.requestId,
      answers,
    );
    if (failure) this.error.set(errorText(failure));
    this.busy.set(false);
  }
}
