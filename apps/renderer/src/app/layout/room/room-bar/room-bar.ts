import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ProjectStore } from '../../../core/projects/project-store';
import { RoomState } from '../../../core/room/room-state';
import { UnsavedChanges } from '../../../core/unsaved/unsaved-changes';
import { Icon } from '../../../shared/icon/icon';
import { injectCrumbs } from '../crumbs';

/** Title bar of the workbench: breadcrumb plus the window controls. */
@Component({
  selector: 'app-room-bar',
  imports: [Icon, TranslocoPipe],
  templateUrl: './room-bar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomBar {
  protected readonly room = inject(RoomState);
  private readonly projects = inject(ProjectStore);
  private readonly crumbs = injectCrumbs();

  protected readonly project = computed(() =>
    this.projects.byId(this.crumbs().projectId),
  );
  protected readonly area = computed(
    () => this.crumbs().area ?? 'nav.projects',
  );
  protected readonly section = computed(() => this.crumbs().section);
  protected readonly note = computed(() => this.crumbs().note);
  private readonly unsaved = inject(UnsavedChanges);

  protected async close(): Promise<void> {
    if (await this.unsaved.confirmDiscard()) this.room.close();
  }
}
