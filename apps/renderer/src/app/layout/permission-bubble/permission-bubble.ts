import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PermissionQueue } from '../../core/permissions/permission-queue';
import { Character } from '../../shared/character/character';

/**
 * The bubble above the avatar for the oldest pending permission request. Main
 * makes the compact window interactive while a request is pending, otherwise
 * these buttons would be click-through.
 */
@Component({
  selector: 'app-permission-bubble',
  imports: [Character],
  templateUrl: './permission-bubble.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionBubble {
  protected readonly queue = inject(PermissionQueue);
}
