import { ipcMain } from 'electron';
import { IPC, type Settings, type SettingsPatch } from '@ascua/ipc';
import type { JsonSettingsRepository } from './json-settings-repository';

export interface SettingsIpcOptions {
  send: (channel: string, payload: unknown) => void;
  onChange: (settings: Settings) => void;
}

export function registerSettingsIpc(
  repository: JsonSettingsRepository,
  { send, onChange }: SettingsIpcOptions,
): void {
  ipcMain.handle(IPC.getSettings, () => repository.get());
  ipcMain.handle(IPC.updateSettings, async (_event, patch: SettingsPatch) => {
    const settings = await repository.update(patch ?? {});
    onChange(settings);
    send(IPC.settingsChanged, settings);
    return settings;
  });
}
