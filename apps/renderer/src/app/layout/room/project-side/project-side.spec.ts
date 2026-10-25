import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ChatStore } from '../../../core/chats/chat-store';
import { ProjectStore } from '../../../core/projects/project-store';
import { TerminalSessions } from '../../../core/terminals/terminal-sessions';
import { i18nTesting } from '../../../testing/i18n';
import { ProjectSide } from './project-side';

describe('ProjectSide chats', () => {
  it('lists the expanded project chats with links and tones', async () => {
    const ensureLoaded = vi.fn();
    const statuses: Record<string, string> = {
      c1: 'running',
      c2: 'awaitingPermission',
    };
    TestBed.configureTestingModule({
      imports: [ProjectSide, i18nTesting()],
      providers: [
        provideRouter([
          { path: 'proyectos/:projectId/terminales', children: [] },
        ]),
        {
          provide: ProjectStore,
          useValue: {
            projects: signal([{ id: 'p1', name: 'Uno', terminals: [] }]),
          },
        },
        {
          provide: TerminalSessions,
          useValue: {
            counts: () => ({ running: 0, total: 0 }),
            shells: () => [],
            session: () => undefined,
          },
        },
        {
          provide: ChatStore,
          useValue: {
            sessions: () => [
              { id: 'c1', title: 'Hola' },
              { id: 'c2', title: undefined },
            ],
            status: (id: string) => statuses[id],
            ensureLoaded,
          },
        },
      ],
    });
    await TestBed.inject(Router).navigateByUrl('/proyectos/p1/terminales');
    const fixture = TestBed.createComponent(ProjectSide);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(ensureLoaded).toHaveBeenCalledWith('p1');
    const rows = Array.from(
      el.querySelectorAll<HTMLAnchorElement>('a[href*="/chats/"]'),
    );
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute('href')).toContain('/proyectos/p1/chats/c1');
    expect(rows[0].textContent).toContain('Hola');
    expect(rows[1].textContent).toContain('Chat sin título');
    expect(rows[0].querySelector('.as-dot')?.getAttribute('data-tone')).toBe(
      'ok',
    );
    expect(rows[1].querySelector('.as-dot')?.getAttribute('data-tone')).toBe(
      'ask',
    );
  });

  describe('delete', () => {
    const remove = vi.fn(async () => undefined);

    async function mount(url: string) {
      remove.mockClear();
      TestBed.configureTestingModule({
        imports: [ProjectSide, i18nTesting()],
        providers: [
          provideRouter([
            { path: 'proyectos/:projectId/terminales', children: [] },
            { path: 'proyectos/:projectId/chats/:id', children: [] },
            { path: 'proyectos/:projectId/chats/nuevo', children: [] },
          ]),
          {
            provide: ProjectStore,
            useValue: {
              projects: signal([{ id: 'p1', name: 'Uno', terminals: [] }]),
            },
          },
          {
            provide: TerminalSessions,
            useValue: {
              counts: () => ({ running: 0, total: 0 }),
              shells: () => [],
              session: () => undefined,
            },
          },
          {
            provide: ChatStore,
            useValue: {
              sessions: () => [{ id: 'c1', title: 'Hola' }],
              status: () => undefined,
              ensureLoaded: vi.fn(),
              remove,
            },
          },
        ],
      });
      const router = TestBed.inject(Router);
      await router.navigateByUrl(url);
      const fixture = TestBed.createComponent(ProjectSide);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const row = el.querySelector<HTMLAnchorElement>('a[href*="/chats/c1"]')!;
      const flush = async () => {
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      };
      const openModal = async () => {
        row.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
        );
        await flush();
        el.querySelector<HTMLElement>('[role="menuitem"]')!.click();
        await flush();
      };
      return { router, el, row, flush, openModal };
    }

    const buttons = (el: HTMLElement) =>
      Array.from(el.querySelectorAll<HTMLButtonElement>('.as-modal button'));

    it('right-click shows the red Eliminar option and opens the modal', async () => {
      const { el, row, flush, openModal } = await mount(
        '/proyectos/p1/terminales',
      );
      const ev = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
      });
      row.dispatchEvent(ev);
      await flush();
      expect(ev.defaultPrevented).toBe(true);
      const item = el.querySelector('[role="menuitem"]')!;
      expect(item.textContent).toContain('Eliminar');
      expect(item.classList).toContain('as-menu__option--danger');
      await openModal();
      expect(el.querySelector('.as-modal__body')?.textContent).toContain(
        'Hola',
      );
    });

    it('ContextMenu key opens the menu at the row', async () => {
      const { el, row, flush } = await mount('/proyectos/p1/terminales');
      const ev = new KeyboardEvent('keydown', {
        key: 'ContextMenu',
        bubbles: true,
        cancelable: true,
      });
      row.dispatchEvent(ev);
      await flush();
      expect(ev.defaultPrevented).toBe(true);
      expect(el.querySelector('[role="menuitem"]')).not.toBeNull();
    });

    it('confirm removes the chat; cancel does not', async () => {
      const { el, openModal, flush } = await mount('/proyectos/p1/terminales');
      await openModal();
      buttons(el)[0].click();
      await flush();
      expect(remove).not.toHaveBeenCalled();
      await openModal();
      buttons(el)[1].click();
      await flush();
      expect(remove).toHaveBeenCalledWith('p1', 'c1');
    });

    it('deleting the open chat navigates to nuevo', async () => {
      const { router, el, openModal, flush } = await mount(
        '/proyectos/p1/chats/c1',
      );
      await openModal();
      buttons(el)[1].click();
      await flush();
      await new Promise((r) => setTimeout(r));
      expect(router.url).toBe('/proyectos/p1/chats/nuevo');
    });

    it('left click still navigates', async () => {
      const { router, row, flush } = await mount('/proyectos/p1/terminales');
      row.click();
      await flush();
      expect(router.url).toBe('/proyectos/p1/chats/c1');
    });
  });
});
