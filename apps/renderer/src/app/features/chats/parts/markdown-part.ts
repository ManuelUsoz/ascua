import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { parseMarkdown } from '@ascua/chat';
import { ASCUA_API } from '../../../core/bridge/ascua-api';

/** Markdown through template nodes only: never innerHTML. */
@Component({
  selector: 'app-markdown-part',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-text chat-md' },
  template: `
    <ng-template #inl let-nodes>
      @for (n of nodes; track $index) {
        @switch (n.kind) {
          @case ('code') {
            <code>{{ n.text }}</code>
          }
          @case ('strong') {
            <strong>
              <ng-container
                *ngTemplateOutlet="inl; context: { $implicit: n.children }"
              />
            </strong>
          }
          @case ('em') {
            <em>
              <ng-container
                *ngTemplateOutlet="inl; context: { $implicit: n.children }"
              />
            </em>
          }
          @case ('link') {
            <a [href]="n.href" (click)="open($event, n.href)">
              <ng-container
                *ngTemplateOutlet="inl; context: { $implicit: n.label }"
              />
            </a>
          }
          @default {
            <ng-container>{{ n.text }}</ng-container>
          }
        }
      }
    </ng-template>
    @for (b of blocks(); track $index) {
      @switch (b.kind) {
        @case ('paragraph') {
          <p>
            <ng-container
              *ngTemplateOutlet="inl; context: { $implicit: b.inlines }"
            />
          </p>
        }
        @case ('heading') {
          @switch (b.level) {
            @case (1) {
              <h3>
                <ng-container
                  *ngTemplateOutlet="inl; context: { $implicit: b.inlines }"
                />
              </h3>
            }
            @case (2) {
              <h3>
                <ng-container
                  *ngTemplateOutlet="inl; context: { $implicit: b.inlines }"
                />
              </h3>
            }
            @case (3) {
              <h4>
                <ng-container
                  *ngTemplateOutlet="inl; context: { $implicit: b.inlines }"
                />
              </h4>
            }
            @default {
              <h5>
                <ng-container
                  *ngTemplateOutlet="inl; context: { $implicit: b.inlines }"
                />
              </h5>
            }
          }
        }
        @case ('code') {
          <pre><code>{{ b.text }}</code></pre>
        }
        @case ('list') {
          @if (b.ordered) {
            <ol>
              @for (item of b.items; track $index) {
                <li>
                  <ng-container
                    *ngTemplateOutlet="inl; context: { $implicit: item }"
                  />
                </li>
              }
            </ol>
          } @else {
            <ul>
              @for (item of b.items; track $index) {
                <li>
                  <ng-container
                    *ngTemplateOutlet="inl; context: { $implicit: item }"
                  />
                </li>
              }
            </ul>
          }
        }
        @case ('quote') {
          <blockquote>
            <ng-container
              *ngTemplateOutlet="inl; context: { $implicit: b.inlines }"
            />
          </blockquote>
        }
        @case ('table') {
          <div class="chat-md__table">
            <table>
              <thead>
                <tr>
                  @for (cell of b.head; track $index) {
                    <th>
                      <ng-container
                        *ngTemplateOutlet="inl; context: { $implicit: cell }"
                      />
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of b.rows; track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      <td>
                        <ng-container
                          *ngTemplateOutlet="inl; context: { $implicit: cell }"
                        />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @case ('rule') {
          <hr />
        }
      }
    }
  `,
})
export class MarkdownPart {
  readonly text = input.required<string>();

  private readonly api = inject(ASCUA_API);

  protected readonly blocks = computed(() => parseMarkdown(this.text()));

  /** Links never navigate the window: main opens them in the browser. */
  protected open(event: Event, href: string): void {
    event.preventDefault();
    void this.api?.openLink(href);
  }
}
