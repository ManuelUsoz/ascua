import { TestBed } from '@angular/core/testing';
import type { AscuaApi, PermissionRequest } from '@ascua/ipc';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { Companion } from '../../core/companion/companion';
import { RoomState } from '../../core/room/room-state';
import { i18nTesting } from '../../testing/i18n';
import { PermissionBubble } from './permission-bubble';

const edit: PermissionRequest = {
  id: 1,
  tool: 'Edit',
  summary: 'src/app.ts',
  input: {},
};
const wipe: PermissionRequest = {
  id: 2,
  tool: 'Bash',
  summary: 'rm -rf dist',
  input: {},
};
const ask: PermissionRequest = {
  id: 3,
  tool: 'AskUserQuestion',
  summary: 'Which?',
  input: {},
};

describe('PermissionBubble', () => {
  let push: (request: PermissionRequest) => void;
  let api: Pick<
    AscuaApi,
    'onPermissionRequest' | 'onPermissionDismissed' | 'resolvePermission'
  >;
  let element: HTMLElement;
  let settle: () => Promise<void>;

  const text = (selector: string) =>
    element.querySelector(selector)?.textContent?.trim();
  const press = (label: string) => {
    const button = [...element.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!button) throw new Error(`no "${label}" button`);
    button.click();
  };

  beforeEach(async () => {
    api = {
      onPermissionRequest: (callback) => {
        push = callback;
        return () => undefined;
      },
      onPermissionDismissed: () => () => undefined,
      resolvePermission: vi.fn(async () => undefined),
    };
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        { provide: ASCUA_API, useValue: api },
        {
          provide: Companion,
          useValue: { need: vi.fn(), celebrate: vi.fn(), release: vi.fn() },
        },
        { provide: RoomState, useValue: { collapse: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(PermissionBubble);
    element = fixture.nativeElement as HTMLElement;
    settle = () => fixture.whenStable();
    await settle();
  });

  it('stays hidden with nothing to answer', () => {
    expect(element.querySelector('#bubble')?.hasAttribute('hidden')).toBe(true);
  });

  it('shows the oldest request, the queue and the matching face', async () => {
    push(edit);
    push(wipe);
    await settle();
    expect(element.querySelector('#bubble')?.hasAttribute('hidden')).toBe(
      false,
    );
    expect(text('#tool')).toBe('Edit');
    expect(text('#summary')).toBe('src/app.ts');
    expect(text('#queued')).toBe('+1 en espera');
    expect(
      element.querySelector<HTMLElement>('#bubble-face .ascua')?.dataset['act'],
    ).toBe('alert');
  });

  it('answers each request with the button pressed', async () => {
    push(edit);
    push(wipe);
    push(ask);
    await settle();

    press('Aprobar');
    await settle();
    expect(api.resolvePermission).toHaveBeenLastCalledWith(edit.id, 'allow');
    expect(text('#tool')).toBe('Bash');
    expect(
      element.querySelector<HTMLElement>('#bubble-face .ascua')?.dataset['act'],
    ).toBe('warn');

    press('Rechazar');
    await settle();
    expect(api.resolvePermission).toHaveBeenLastCalledWith(wipe.id, 'deny');

    press('En la terminal');
    await settle();
    expect(api.resolvePermission).toHaveBeenLastCalledWith(ask.id, 'terminal');
    expect(element.querySelector('#bubble')?.hasAttribute('hidden')).toBe(true);
  });
});
