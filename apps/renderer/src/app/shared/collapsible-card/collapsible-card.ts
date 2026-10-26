import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { Icon } from '../icon/icon';

@Component({
  selector: 'app-collapsible-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="as-collapsible" [class.as-collapsible--open]="expanded()">
      <button
        type="button"
        class="as-collapsible__head"
        [attr.aria-expanded]="expanded()"
        (click)="toggle()"
      >
        <app-icon class="as-collapsible__chev" name="chevron-down" />
        <ng-content select="[summary]" />
        <span class="as-collapsible__spacer"></span>
        <ng-content select="[meta]" />
      </button>
      <div class="as-collapsible__body" [attr.inert]="expanded() ? null : ''">
        <div class="as-collapsible__clip">
          <div class="as-collapsible__content">
            <ng-content />
          </div>
        </div>
      </div>
    </section>
  `,
})
export class CollapsibleCard {
  readonly expanded = model(false);

  protected toggle(): void {
    this.expanded.update((v) => !v);
  }
}
