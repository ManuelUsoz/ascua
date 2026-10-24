import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  input,
  output,
} from '@angular/core';

export type ButtonVariant = 'primary' | 'quiet' | 'ghost' | 'danger';
export type ButtonSize = 's' | 'default';
export type ButtonType = 'button' | 'submit' | 'reset';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector -- attribute selector on a native button
  selector: 'button[appButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'as-btn',
    '[class]': "'as-btn--' + variant()",
    '[class.as-btn--s]': "size() === 's'",
    '[class.as-btn--icon]': 'icon()',
    '[class.as-btn--block]': 'block()',
    '[attr.type]': 'type()',
    '(click)': 'clicked.emit($event)',
  },
  template: `<ng-content />`,
})
export class Button {
  readonly variant = input<ButtonVariant>('quiet');
  readonly size = input<ButtonSize>('default');
  readonly icon = input(false, { transform: booleanAttribute });
  readonly block = input(false, { transform: booleanAttribute });
  readonly type = input<ButtonType>('button');
  readonly clicked = output<MouseEvent>();
}
