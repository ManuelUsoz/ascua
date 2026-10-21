import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The room's default screen. */
@Component({
  selector: 'app-home-page',
  templateUrl: './home-page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {}
