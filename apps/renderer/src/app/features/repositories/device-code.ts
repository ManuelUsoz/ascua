import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import type { DeviceCodePrompt } from '@ascua/ipc';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from '../../shared/button/button';
import { Icon } from '../../shared/icon/icon';
import { SourceControlStore } from '../../core/source-control/source-control-store';
import { PROVIDER_OPTIONS } from './providers';

/** The user code of a pending device authorization. */
@Component({
  selector: 'app-device-code',
  imports: [TranslocoPipe, Icon, Button],
  templateUrl: './device-code.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeviceCode {
  protected readonly store = inject(SourceControlStore);
  readonly prompt = input.required<DeviceCodePrompt>();
  protected readonly provider = PROVIDER_OPTIONS[0];
  protected readonly copied = signal(false);
  private readonly now = signal(Date.now());

  /** Seconds left, never below zero. */
  protected readonly remaining = computed(() =>
    Math.max(0, Math.ceil((this.prompt().expiresAt - this.now()) / 1000)),
  );
  /** `mm:ss` of the time left. */
  protected readonly clock = computed(() => {
    const total = this.remaining();
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected async copy(): Promise<void> {
    const clipboard = globalThis.navigator?.clipboard;
    if (!clipboard) return;
    try {
      await clipboard.writeText(this.prompt().userCode);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }
}
