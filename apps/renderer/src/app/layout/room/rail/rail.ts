import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { RoomState } from '../../../core/room/room-state';
import { Character } from '../../../shared/character/character';
import { Icon } from '../../../shared/icon/icon';

/** Workbench spaces. Only Proyectos exists today. */
@Component({
  selector: 'app-rail',
  imports: [RouterLink, RouterLinkActive, Icon, Character],
  templateUrl: './rail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Rail {
  protected readonly room = inject(RoomState);
}
