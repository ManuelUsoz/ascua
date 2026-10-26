import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RoomState } from './core/room/room-state';
import { Avatar } from './layout/avatar/avatar';
import { PermissionBubble } from './layout/permission-bubble/permission-bubble';
import { Room } from './layout/room/room';
import { VoiceStatus } from './layout/voice-status/voice-status';

/**
 * The one window's content: the permission bubble and the avatar in compact
 * mode, and the room that blooms out of the avatar in fullscreen. State lives
 * in `core/`; these components render it. DOM order sets the stacking of
 * equal z-indexes, so keep bubble, room, avatar in this order.
 */
@Component({
  selector: 'app-root',
  imports: [PermissionBubble, Room, Avatar, VoiceStatus],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:keydown.escape)': 'room.collapse()',
    '(window:resize)': 'room.resized()',
  },
})
export class App {
  protected readonly room = inject(RoomState);
}
