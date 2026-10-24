import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ProjectStore } from '../../../core/projects/project-store';
import { RepositorySelection } from '../../../core/source-control/repository-selection';
import { i18nTesting } from '../../../testing/i18n';
import { RoomCrumbs } from './room-crumbs';

describe('RoomCrumbs', () => {
  function render(
    project?: { name: string },
    selectedPr: { sourceBranch: string } | undefined = undefined,
  ) {
    const back = vi.fn();
    TestBed.configureTestingModule({
      imports: [RoomCrumbs, i18nTesting()],
      providers: [
        provideRouter([
          {
            path: 'repos',
            data: { area: 'nav.repositories', side: 'repositories' },
            children: [],
          },
        ]),
        { provide: ProjectStore, useValue: { byId: () => project } },
        {
          provide: RepositorySelection,
          useValue: { selectedPr: signal(selectedPr), back },
        },
      ],
    });
    const fixture = TestBed.createComponent(RoomCrumbs);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    return { el, fixture, back };
  }

  it('is the first thing in the main column, naming the area', () => {
    const { el } = render();
    expect(el.querySelector('nav.as-crumbs')).not.toBeNull();
    expect(el.querySelector('.as-crumb__current')?.textContent).toContain(
      'Proyectos',
    );
  });

  it('shows Repositorios > source branch for an open PR and goes back', async () => {
    const { el, fixture, back } = render(undefined, { sourceBranch: 'fix' });
    await TestBed.inject(Router).navigateByUrl('/repos');
    fixture.detectChanges();
    const link = el.querySelector<HTMLButtonElement>('.as-crumb__link');
    expect(link?.textContent).toContain('Repositorios');
    const current = el.querySelector('.as-crumb__current');
    expect(current?.textContent).toContain('fix');
    expect(current?.classList.contains('as-crumb__mono')).toBe(true);
    link?.click();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
