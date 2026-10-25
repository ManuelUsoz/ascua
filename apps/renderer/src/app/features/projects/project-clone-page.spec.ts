import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import type { Repository } from '@ascua/source-control';
import { TranslocoService } from '@jsverse/transloco';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { RepositorySelection } from '../../core/source-control/repository-selection';
import { i18nTesting } from '../../testing/i18n';
import { ProjectClonePage } from './project-clone-page';

const repo: Repository = {
  provider: 'github',
  id: 'o/r',
  name: 'r',
  owner: 'o',
  fullName: 'o/r',
  private: false,
  fork: false,
  archived: false,
  defaultBranch: 'main',
  webUrl: 'https://github.com/o/r',
  updatedAt: '2026-01-01T00:00:00Z',
};
const project = { id: 'p1', name: 'r', path: '/home/u/r', terminals: [] };

async function setup(cloneResult: unknown = { ok: true, project }) {
  const api = {
    listProjects: vi.fn().mockResolvedValue([]),
    getRepositoryLink: vi.fn().mockResolvedValue({
      state: 'none',
      path: '/home/u/r',
      folderExists: false,
    }),
    cloneProject: vi.fn().mockResolvedValue(cloneResult),
  };
  TestBed.configureTestingModule({
    imports: [i18nTesting()],
    providers: [
      { provide: ASCUA_API, useValue: api },
      {
        provide: ActivatedRoute,
        useValue: {
          queryParamMap: of(
            convertToParamMap({ provider: 'github', repo: 'o/r' }),
          ),
        },
      },
    ],
  });
  TestBed.inject(RepositorySelection).repos.set([repo]);
  const navigate = vi
    .spyOn(TestBed.inject(Router), 'navigate')
    .mockResolvedValue(true);
  const fixture = TestBed.createComponent(ProjectClonePage);
  fixture.detectChanges();
  await fixture.whenStable();
  await vi.waitFor(() => expect(api.getRepositoryLink).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { api, navigate, fixture, el };
}

const input = (el: HTMLElement, id: string) =>
  el.querySelector(`#${id}`) as HTMLInputElement;

describe('ProjectClonePage', () => {
  it('defaults from the repo and the home-based path', async () => {
    const { el } = await setup();
    expect(input(el, 'pc-name').value).toBe('r');
    expect(input(el, 'pc-folder').value).toBe('r');
    expect(input(el, 'pc-parent').value).toBe('/home/u');
    expect(el.querySelector('[data-test="target"]')?.textContent).toBe(
      '/home/u/r',
    );
  });

  it('editing the folder name changes the preview', async () => {
    const { el, fixture } = await setup();
    const folder = input(el, 'pc-folder');
    folder.value = 'otro';
    folder.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(el.querySelector('[data-test="target"]')?.textContent).toBe(
      '/home/u/otro',
    );
  });

  it('submits, then opens the new project', async () => {
    const { el, api, navigate, fixture } = await setup();
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await fixture.whenStable();
    expect(api.cloneProject).toHaveBeenCalledWith(
      expect.objectContaining({
        parentDir: '/home/u',
        folderName: 'r',
        name: 'r',
      }),
    );
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'p1']);
  });

  it('renders clone.targetExists in Spanish', async () => {
    const { el, fixture } = await setup({
      ok: false,
      error: { code: 'clone.targetExists' },
    });
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      i18nText('errors.clone.targetExists'),
    );
  });
});

function i18nText(key: string): string {
  return TestBed.inject(TranslocoService).translate(key);
}
