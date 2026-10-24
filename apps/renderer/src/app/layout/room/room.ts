import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoomState } from '../../core/room/room-state';
import { injectCrumbs } from './crumbs';
import { ProjectSide } from './project-side/project-side';
import { Rail } from './rail/rail';
import { RepositorySide } from './repository-side/repository-side';
import { RoomBar } from './room-bar/room-bar';

/**
 * The room that blooms out of the avatar: the fullscreen state of the same
 * window, never a second one. Feature screens render in its outlet.
 */
@Component({
  selector: 'app-room',
  imports: [RouterOutlet, RoomBar, Rail, ProjectSide, RepositorySide],
  templateUrl: './room.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Room {
  protected readonly room = inject(RoomState);
  protected readonly crumbs = injectCrumbs();
}
