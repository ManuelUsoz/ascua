import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { RepositoryLink } from '@ascua/ipc';
import type { Repository } from '@ascua/source-control';
import { describe, expect, it, vi } from 'vitest';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { i18nTesting } from '../../testing/i18n';
import { RepositoryLinkNotice } from './repository-link-notice';

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
const project = { id: 'p1', name: 'Mi proyecto', path: '/x/r', terminals: [] };

async function setup(link: RepositoryLink, linkResult: unknown = undefined) {
  const api = {
    listProjects: vi.fn().mockResolvedValue([]),
    getRepositoryLink: vi.fn().mockResolvedValue(link),
    linkProjectRepository: vi
      .fn()
      .mockResolvedValue(linkResult ?? { ok: true, project }),
  };
  TestBed.configureTestingModule({
    imports: [i18nTesting()],
    providers: [{ provide: ASCUA_API, useValue: api }],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(RepositoryLinkNotice);
  fixture.componentRef.setInput('repo', repo);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { api, navigate, fixture, el };
}

const action = (el: HTMLElement) =>
  el.querySelector('.as-notice__actions button') as HTMLButtonElement;

describe('RepositoryLinkNotice', () => {
  it('linked: shows WITH PROJECT and opens the project', async () => {
    const { el, navigate } = await setup({
      state: 'linked',
      project,
      path: '/x/r',
    });
    expect(el.textContent).toContain('Vinculado');
    expect(el.textContent).toContain(
      'Esta copia ya está vinculada al proyecto Mi proyecto.',
    );
    expect(el.querySelector('.as-mono')?.textContent).toBe('/x/r');
    action(el).click();
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'p1']);
  });

  it('match: links the project and shows errors', async () => {
    const { el, api, fixture } = await setup(
      { state: 'match', project, path: '/x/r' },
      { ok: false, error: { code: 'project.repositoryInvalid' } },
    );
    expect(el.textContent).toContain('Sin vincular');
    expect(action(el).textContent).toContain('Vincular a Mi proyecto');
    action(el).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(api.linkProjectRepository).toHaveBeenCalledWith('p1', {
      provider: 'github',
      id: 'o/r',
      name: 'r',
      fullName: 'o/r',
    });
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('none: shows no project and goes to the clone page', async () => {
    const { el, navigate } = await setup({
      state: 'none',
      path: '/home/r',
      folderExists: false,
    });
    expect(el.textContent).toContain('Sin proyecto');
    expect(el.textContent).toContain('Todavía no hay un proyecto');
    action(el).click();
    expect(navigate).toHaveBeenCalledWith(['/proyectos', 'clonar'], {
      queryParams: { provider: 'github', repo: 'o/r' },
    });
  });

  it('is not dismissible', async () => {
    const { el } = await setup({
      state: 'none',
      path: '/home/r',
      folderExists: false,
    });
    expect(el.querySelector('.as-notice__close')).toBeNull();
  });
});
