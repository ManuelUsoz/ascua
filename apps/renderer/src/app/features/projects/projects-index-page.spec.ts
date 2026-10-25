import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ProjectStore } from '../../core/projects/project-store';
import { i18nTesting } from '../../testing/i18n';
import { ProjectsIndexPage } from './projects-index-page';

function setup(projects: { id: string }[], claimed = false) {
  let used = claimed;
  TestBed.configureTestingModule({
    imports: [ProjectsIndexPage, i18nTesting()],
    providers: [
      provideRouter([]),
      {
        provide: ProjectStore,
        useValue: {
          projects: signal(projects),
          loaded: signal(true),
          available: signal(true),
          claimInitialSelection: () => {
            const was = used;
            used = true;
            return !was;
          },
        },
      },
    ],
  });
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  TestBed.createComponent(ProjectsIndexPage).detectChanges();
  TestBed.tick();
  return navigate;
}

describe('ProjectsIndexPage', () => {
  it('navigates to the first project when loaded', () => {
    const navigate = setup([{ id: 'p1' }, { id: 'p2' }]);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'p1'], {
      replaceUrl: true,
    });
  });

  it('does not navigate on later visits', () => {
    expect(setup([{ id: 'p1' }], true)).not.toHaveBeenCalled();
  });

  it('does not navigate when there are no projects', () => {
    expect(setup([])).not.toHaveBeenCalled();
  });
});
