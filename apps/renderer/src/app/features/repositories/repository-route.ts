import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Leaf of the repositories routes: only carries params, renders nothing. */
@Component({
  selector: 'app-repository-route',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RepositoryRoute {}
