import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Language } from '@ascua/ipc';
import { provideTranslocoScope, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { SettingsStore } from '../../core/settings/settings-store';
import { VoiceStore } from '../../core/voice/voice-store';
import { i18nTesting } from '../../testing/i18n';
import { SettingsPage } from './settings-page';

describe('SettingsPage', () => {
  const language = signal<Language>('es');
  const setLanguage = vi.fn();
  const setVoice = vi.fn(() => Promise.resolve());
  const voiceSettings = signal({
    enabled: true,
    autoSpeak: true,
    style: 'F1' as const,
  });
  const voiceStore = {
    error: signal(null),
    download: signal(null),
    preview: vi.fn(),
    prepare: vi.fn(() => Promise.resolve()),
    clearModels: vi.fn(() => Promise.resolve()),
  };

  function render() {
    TestBed.configureTestingModule({
      imports: [SettingsPage, i18nTesting()],
      providers: [
        {
          provide: SettingsStore,
          useValue: { language, setLanguage, voice: voiceSettings, setVoice },
        },
        { provide: VoiceStore, useValue: voiceStore },
        provideTranslocoScope('settings'),
      ],
    });
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the current language in the labelled select', () => {
    const el: HTMLElement = render().nativeElement;
    const select = el.querySelector<HTMLSelectElement>('#settings-language');
    expect(select?.value).toBe('es');
    expect(select?.selectedOptions[0]?.textContent?.trim()).toBe('Español');
    expect(
      el.querySelector('label[for=settings-language]')?.textContent,
    ).toContain('Idioma');
  });

  it('asks the store to switch when another language is chosen', () => {
    const fixture = render();
    const select = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLSelectElement>('#settings-language');
    if (!select) throw new Error('select missing');
    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    expect(setLanguage).toHaveBeenCalledWith('en');
  });

  it('keeps Español selected and shows an alert when the change is rejected', async () => {
    setLanguage.mockRejectedValueOnce(new Error('boom'));
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    const select = el.querySelector<HTMLSelectElement>('#settings-language');
    if (!select) throw new Error('select missing');
    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(select.value).toBe('es');
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'No se pudo cambiar el idioma.',
    );
  });

  it('changes the voice toggles and style', () => {
    const el: HTMLElement = render().nativeElement;
    const enabled = el.querySelector<HTMLInputElement>(
      '#settings-voice-enabled',
    );
    if (!enabled) throw new Error('checkbox missing');
    enabled.checked = false;
    enabled.dispatchEvent(new Event('change'));
    expect(setVoice).toHaveBeenCalledWith({ enabled: false });
    const style = el.querySelector<HTMLSelectElement>('#settings-voice-style');
    if (!style) throw new Error('select missing');
    expect(style.selectedOptions[0]?.textContent?.trim()).toBe('Femenina 1');
    style.value = 'M2';
    style.dispatchEvent(new Event('change'));
    expect(setVoice).toHaveBeenCalledWith({ style: 'M2' });
  });

  it('previews the Spanish sample', () => {
    const el: HTMLElement = render().nativeElement;
    const test = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Probar voz'),
    );
    test?.click();
    expect(voiceStore.preview).toHaveBeenCalledWith(
      'Hola, soy Ascua. Así sueno.',
    );
  });

  it('retitles when the active language changes', async () => {
    const fixture = render();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')?.textContent).toContain('Ajustes');
    const transloco = TestBed.inject(TranslocoService);
    transloco.setActiveLang('en');
    await firstValueFrom(transloco.load('settings/en'));
    fixture.detectChanges();
    expect(el.querySelector('h1')?.textContent).toContain('Settings');
  });
});
