import { TestBed } from '@angular/core/testing';
import {
  CLEAR_COMMAND,
  NXY_COMMANDS,
  type ChatCommand,
  type ChatModeId,
  type PermissionMode,
} from '@ascua/chat';
import { provideTranslocoScope } from '@jsverse/transloco';
import { describe, expect, it, vi } from 'vitest';
import { i18nTesting } from '../../../testing/i18n';
import { ChatComposer } from './chat-composer';

const CUSTOM: ChatCommand = {
  name: 'deploy',
  source: 'custom',
  description: 'Deploy the app',
};
const COMMANDS: ChatCommand[] = [CLEAR_COMMAND, ...NXY_COMMANDS, CUSTOM];

interface Inputs {
  disabled?: boolean;
  running?: boolean;
  commands?: ChatCommand[];
  permissionMode?: PermissionMode;
  model?: string;
  mode?: ChatModeId;
}

/** Visible text of a control with whitespace collapsed. */
const label = (el: Element) => el.textContent?.replace(/\s+/g, ' ').trim();

function setup(inputs: Inputs = {}) {
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [provideTranslocoScope('chats')],
  });
  const fixture = TestBed.createComponent(ChatComposer);
  fixture.componentRef.setInput('disabled', inputs.disabled ?? false);
  fixture.componentRef.setInput('running', inputs.running ?? false);
  fixture.componentRef.setInput('commands', inputs.commands ?? []);
  fixture.componentRef.setInput(
    'permissionMode',
    inputs.permissionMode ?? 'supervised',
  );
  fixture.componentRef.setInput('model', inputs.model);
  fixture.componentRef.setInput('mode', inputs.mode ?? 'chat');
  const submitted = vi.fn();
  const aborted = vi.fn();
  const runtimeChanged = vi.fn();
  const modeCleared = vi.fn();
  const composer = fixture.componentInstance;
  composer.submitted.subscribe(submitted);
  composer.aborted.subscribe(aborted);
  composer.runtimeChanged.subscribe(runtimeChanged);
  composer.modeCleared.subscribe(modeCleared);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const area = el.querySelector('textarea') as HTMLTextAreaElement;
  const type = (value: string) => {
    area.value = value;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const key = (k: string, shiftKey = false) => {
    const event = new KeyboardEvent('keydown', {
      key: k,
      shiftKey,
      cancelable: true,
      bubbles: true,
    });
    area.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };
  const options = () =>
    Array.from(el.querySelectorAll<HTMLElement>('[role="option"]'));
  const buttons = () =>
    Array.from(
      el.querySelectorAll<HTMLButtonElement>(
        '.chat-composer__actions > button',
      ),
    );
  return {
    el,
    area,
    type,
    key,
    options,
    detect: () => fixture.detectChanges(),
    buttons,
    submitted,
    aborted,
    runtimeChanged,
    modeCleared,
  };
}

describe('ChatComposer', () => {
  it('Enter sends the trimmed text and clears the box', () => {
    const { area, type, key, submitted } = setup();
    type('  hola  ');
    expect(key('Enter').defaultPrevented).toBe(true);
    expect(submitted).toHaveBeenCalledWith('hola');
    expect(area.value).toBe('');
  });

  it('Shift+Enter adds a line instead of sending', () => {
    const { type, key, submitted } = setup();
    type('hola');
    expect(key('Enter', true).defaultPrevented).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
  });

  it('does not send an empty message', () => {
    const { key, submitted } = setup();
    key('Enter');
    expect(submitted).not.toHaveBeenCalled();
  });

  it('is disabled while running and offers Detener', () => {
    const { el, type, key, submitted, aborted } = setup({ running: true });
    type('hola');
    key('Enter');
    expect(submitted).not.toHaveBeenCalled();
    const stop = Array.from(el.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Detener',
    );
    stop?.click();
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('while idle there are attach (disabled) and send buttons, and no mode chip', () => {
    const { el, buttons, type, detect, submitted } = setup();
    expect(buttons()).toHaveLength(2);
    const attach = buttons()[0];
    expect(attach.getAttribute('aria-label')).toBe('Adjuntar archivo');
    expect(attach.disabled).toBe(true);
    const send = buttons()[1];
    expect(send.getAttribute('aria-label')).toBe('Enviar');
    expect(send.disabled).toBe(true);
    type('hola');
    detect();
    expect(send.disabled).toBe(false);
    send.click();
    expect(submitted).toHaveBeenCalledWith('hola');
    expect(el.querySelector('.chat-composer__chip')).toBeNull();
  });

  it('Escape stops at the host and aborts only while running', () => {
    const idle = setup();
    const leaked = vi.fn();
    document.body.appendChild(idle.el);
    document.body.addEventListener('keydown', leaked);
    idle.key('Escape');
    document.body.removeEventListener('keydown', leaked);
    expect(leaked).not.toHaveBeenCalled();
    expect(idle.aborted).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const busy = setup({ running: true });
    busy.key('Escape');
    expect(busy.aborted).toHaveBeenCalledTimes(1);
  });

  it('typing / opens the menu grouped by source', () => {
    const { el, type, options } = setup({ commands: COMMANDS });
    type('/');
    expect(el.querySelector('[role="listbox"]')).not.toBeNull();
    expect(
      options().map(
        (o) => o.querySelector('.chat-commands__name')?.textContent,
      ),
    ).toEqual(['/clear', '/locate', '/make', '/review', '/deploy']);
    expect(
      Array.from(el.querySelectorAll('[role="group"]')).map((g) =>
        g.getAttribute('aria-label'),
      ),
    ).toEqual(['Integrados', 'Modos nxy', 'Del proyecto']);
    expect(options()[0]?.textContent).toContain('Borra la conversación');
    expect(options()[4]?.textContent).toContain('Deploy the app');
  });

  it('filters by prefix and Tab turns the command into a chip', () => {
    const { el, area, type, key, options, submitted } = setup({
      commands: COMMANDS,
    });
    type('/loc');
    expect(options().map((o) => o.textContent?.trim())).toEqual([
      expect.stringContaining('/locate'),
    ]);
    expect(key('Tab').defaultPrevented).toBe(true);
    expect(area.value).toBe('');
    expect(el.querySelector('.chat-composer__command-chip')?.textContent).toBe(
      '/locate',
    );
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(submitted).not.toHaveBeenCalled();
  });

  it('arrows move the highlight with wrap-around and Enter completes', () => {
    const { area, type, key, submitted } = setup({ commands: COMMANDS });
    type('/');
    key('ArrowDown');
    expect(area.getAttribute('aria-activedescendant')).toBe('chat-commands-1');
    key('ArrowUp');
    key('ArrowUp');
    expect(area.getAttribute('aria-activedescendant')).toBe('chat-commands-4');
    key('Enter');
    expect(area.value).toBe('');
    expect(submitted).not.toHaveBeenCalled();
  });

  describe('chosen command', () => {
    const HINTED: ChatCommand = {
      name: 'ship',
      source: 'custom',
      description: 'Ship it',
      argumentHint: '[env]',
    };

    it('shows the chip and the argument hint', () => {
      const { el, area, type, key } = setup({ commands: [HINTED] });
      type('/sh');
      key('Tab');
      expect(area.value).toBe('');
      expect(el.querySelector('.chat-composer__command-chip')).not.toBeNull();
      expect(el.querySelector('.chat-composer__command')).toBeNull();
      expect(area.placeholder).toBe('[env]');
    });

    it('menu options render no argument hint', () => {
      const { el, type, options } = setup({ commands: [HINTED] });
      type('/sh');
      expect(el.querySelector('.chat-commands__hint')).toBeNull();
      expect(options()[0]?.textContent).toContain('Ship it');
      expect(options()[0]?.textContent).not.toContain('[env]');
    });

    it('Enter emits /name with or without args', () => {
      const { type, key, submitted } = setup({ commands: [HINTED] });
      type('/ship');
      key('Tab');
      type('prod');
      key('Enter');
      expect(submitted).toHaveBeenLastCalledWith('/ship prod');
      type('/ship');
      key('Tab');
      key('Enter');
      expect(submitted).toHaveBeenLastCalledWith('/ship');
    });

    it('Backspace at position 0 restores /name with the menu open', () => {
      const { el, area, type, key } = setup({ commands: [HINTED] });
      type('/ship');
      key('Tab');
      area.setSelectionRange(0, 0);
      expect(key('Backspace').defaultPrevented).toBe(true);
      expect(el.querySelector('.chat-composer__command-chip')).toBeNull();
      expect(area.value).toBe('/ship');
      expect(el.querySelector('[role="listbox"]')).not.toBeNull();
    });

    it('renders the keys footer while the menu is open', () => {
      const { el, type } = setup({ commands: COMMANDS });
      expect(el.querySelector('.chat-commands__keys')).toBeNull();
      type('/');
      const keys = el.querySelector('.chat-commands__keys')!;
      expect(keys.closest('[role="listbox"]')).toBeNull();
      expect(label(keys)).toBe(
        '↑↓ moverseTab completarEnter ejecutarEsc cerrar',
      );
    });
  });

  it('Escape closes the menu before stopping a run, and typing reopens it', () => {
    const { el, type, key, aborted } = setup({
      running: true,
      commands: COMMANDS,
    });
    type('/');
    key('Escape');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(aborted).not.toHaveBeenCalled();
    type('/l');
    expect(el.querySelector('[role="listbox"]')).not.toBeNull();
    key('Escape');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    key('Escape');
    expect(aborted).toHaveBeenCalledTimes(1);
  });

  it('the permission selector shows the Spanish label and emits a patch', () => {
    const { el, runtimeChanged, options, detect } = setup({
      permissionMode: 'supervised',
    });
    const permission = el.querySelector<HTMLButtonElement>(
      '.chat-composer__perm button',
    )!;
    expect(permission.textContent?.trim()).toBe('Supervisado');
    permission.click();
    detect();
    const full = options().find((o) =>
      o.textContent?.includes('Acceso total'),
    )!;
    full.click();
    expect(runtimeChanged).toHaveBeenCalledWith({
      permissionMode: 'fullAccess',
    });
  });

  it('a / mid-draft opens the menu and completes at the cursor', () => {
    const { area, key, options, detect } = setup({ commands: COMMANDS });
    area.value = 'hola /loc mundo';
    area.setSelectionRange(9, 9);
    area.dispatchEvent(new Event('input'));
    detect();
    expect(options()).toHaveLength(1);
    key('Tab');
    expect(area.value).toBe('hola /locate  mundo');
    expect(area.selectionStart).toBe(13);
  });

  it('shows a mode chip whose exit button clears the mode', () => {
    const { el, modeCleared } = setup({ mode: 'locate' });
    const chip = el.querySelector('.chat-composer__chip') as HTMLElement;
    expect(chip.textContent).toContain('Ubicar');
    chip.querySelector('button')?.click();
    expect(modeCleared).toHaveBeenCalledTimes(1);
  });
});
