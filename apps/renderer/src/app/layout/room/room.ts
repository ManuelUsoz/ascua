import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RoomState } from '../../core/room/room-state';

/**
 * The room that blooms out of the avatar: the fullscreen state of the same
 * window, never a second one. Feature screens render in its outlet.
 */
@Component({
  selector: 'app-room',
  imports: [RouterOutlet],
  templateUrl: './room.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Room {
  protected readonly room = inject(RoomState);
}
