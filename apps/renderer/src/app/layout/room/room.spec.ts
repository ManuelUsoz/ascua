import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { Commit, PullRequest, Repository } from '@ascua/source-control';
import { RoomState } from '../../core/room/room-state';
import { RepositorySelection } from '../../core/source-control/repository-selection';
import { i18nTesting } from '../../testing/i18n';
import { Room } from './room';

describe('Room', () => {
  const room = {
    open: signal(false),
    collapse: vi.fn(),
    close: vi.fn(),
  };

  beforeEach(() => {
    room.open.set(false);
    room.collapse.mockClear();
    room.close.mockClear();
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        provideRouter([
          {
            path: 'repositorios',
            data: { area: 'nav.repositories', side: 'repositories' },
            children: [],
          },
        ]),
        { provide: RoomState, useValue: room },
      ],
    });
  });

  const button = (element: HTMLElement, label: string) => {
    const found = element.querySelector<HTMLButtonElement>(
      `button[aria-label="${label}"]`,
    );
    if (!found) throw new Error(`no "${label}" button`);
    return found;
  };

  async function render() {
    const fixture = TestBed.createComponent(Room);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('is hidden from assistive tech until the room is open', async () => {
    const { fixture, element } = await render();
    expect(element.querySelector('#room')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    room.open.set(true);
    await fixture.whenStable();
    expect(element.querySelector('#room')?.getAttribute('aria-hidden')).toBe(
      'false',
    );
  });

  it('minimizes back to the avatar and closes Ascua', async () => {
    const { element } = await render();
    button(element, 'Minimizar').click();
    expect(room.collapse).toHaveBeenCalledTimes(1);
    button(element, 'Cerrar').click();
    await Promise.resolve();
    expect(room.close).toHaveBeenCalledTimes(1);
  });

  it('names the area in the crumbs by default', async () => {
    const { element } = await render();
    expect(element.querySelector('.as-crumb__current')?.textContent).toContain(
      'Proyectos',
    );
  });

  it('renders the open PR path on the repositories side', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/repositorios');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const selection = TestBed.inject(RepositorySelection);
    selection.selectedRepo.set({ id: 'octo/hello' } as Repository);
    selection.selectedPr.set({
      number: 7,
      sourceBranch: 'fix',
    } as PullRequest);
    selection.selectedCommit.set({
      sha: 'abcdef1234',
      title: 'First',
    } as Commit);
    const { element } = await render();
    const links =
      element.querySelectorAll<HTMLButtonElement>('.as-crumb__link');
    expect(links[0]?.textContent).toContain('Repositorios');
    expect(links[1]?.textContent).toContain('fix');
    expect(element.querySelector('.as-crumb__current')?.textContent).toContain(
      'abcdef1 First',
    );
    links[0]?.click();
    expect(navigate).toHaveBeenLastCalledWith(['/repositorios', 'octo/hello']);
  });

  it('keeps the ring and the twelve embers the CSS animates', async () => {
    const { element } = await render();
    expect(element.querySelector('#room-ring')).not.toBeNull();
    expect(element.querySelectorAll('#room-embers .ember')).toHaveLength(12);
  });
});
