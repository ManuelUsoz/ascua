import { TestBed } from '@angular/core/testing';
import type { AscuaApi, PermissionRequest } from '@ascua/ipc';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { Companion } from '../../core/companion/companion';
import { RoomState } from '../../core/room/room-state';
import { i18nTesting } from '../../testing/i18n';
import { PermissionBubble } from './permission-bubble';

const edit: PermissionRequest = {
  id: 1,
  source: 'hook',
  tool: 'Edit',
  summary: 'src/app.ts',
  input: {},
};
const wipe: PermissionRequest = {
  id: 2,
  source: 'hook',
  tool: 'Bash',
  summary: 'rm -rf dist',
  input: {},
};
const ask: PermissionRequest = {
  id: 3,
  source: 'hook',
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

  it('titles an assistant request in Spanish and hides the terminal button', async () => {
    push({
      id: 9,
      source: 'assistant',
      tool: 'terminals_write',
      params: { name: 'api', project: 'P' },
      summary: 'npm test',
      input: {},
    });
    await settle();
    expect(element.querySelector('#bubble')?.getAttribute('data-source')).toBe(
      'assistant',
    );
    expect(text('#tool')).toBe('Escribir en api de P');
    expect(text('#summary')).toBe('npm test');
    expect(
      [...element.querySelectorAll('button')].map((b) => b.textContent?.trim()),
    ).toEqual(['Aprobar', 'Rechazar']);
  });

  it('renders a long command in full so the user approves all of it', async () => {
    const long = `echo ${'a'.repeat(900)} && rm -rf /tail-end-marker`;
    push({ ...wipe, id: 20, summary: long });
    await settle();
    expect(text('#summary')).toBe(long);
    expect(element.querySelector('#summary')?.tagName).toBe('PRE');
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
