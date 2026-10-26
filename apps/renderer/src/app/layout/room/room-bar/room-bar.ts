import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { RoomState } from '../../../core/room/room-state';
import { UnsavedChanges } from '../../../core/unsaved/unsaved-changes';
import { Icon } from '../../../shared/icon/icon';

/** Title bar of the workbench: the window controls. */
@Component({
  selector: 'app-room-bar',
  imports: [Icon, TranslocoPipe],
  templateUrl: './room-bar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomBar {
  protected readonly room = inject(RoomState);
  private readonly unsaved = inject(UnsavedChanges);

  protected async close(): Promise<void> {
    if (await this.unsaved.confirmDiscard()) this.room.close();
  }
}
