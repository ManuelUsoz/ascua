import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ASCUA_API } from '../../core/bridge/ascua-api';
import { i18nTesting } from '../../testing/i18n';
import { ProjectMethodologyPage } from './project-methodology-page';

async function setup(overrides: Record<string, unknown> = {}) {
  const api = {
    getMethodology: vi.fn().mockResolvedValue({ rules: 'regla uno' }),
    saveMethodology: vi.fn().mockResolvedValue({ rules: 'nueva' }),
    resetMethodology: vi.fn().mockResolvedValue({ rules: 'por defecto' }),
    ...overrides,
  };
  TestBed.configureTestingModule({
    imports: [i18nTesting('es')],
    providers: [provideRouter([]), { provide: ASCUA_API, useValue: api }],
  });
  const fixture = TestBed.createComponent(ProjectMethodologyPage);
  fixture.componentRef.setInput('projectId', 'p1');
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { api, fixture, el };
}

async function settle(fixture: {
  whenStable(): Promise<unknown>;
  detectChanges(): void;
}) {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  fixture.detectChanges();
}

const area = (el: HTMLElement) =>
  el.querySelector('#pm-rules') as HTMLTextAreaElement;

describe('ProjectMethodologyPage', () => {
  it('loads the rules into the textarea', async () => {
    const { el, api } = await setup();
    expect(api.getMethodology).toHaveBeenCalledWith('p1');
    expect(area(el).value).toBe('regla uno');
  });

  it('saves the edited rules', async () => {
    const { el, api, fixture } = await setup();
    area(el).value = 'nueva';
    area(el).dispatchEvent(new Event('input'));
    const save = el.querySelectorAll('button')[0] as HTMLButtonElement;
    save.click();
    await settle(fixture);
    expect(api.saveMethodology).toHaveBeenCalledWith('p1', 'nueva');
    expect(el.textContent).toContain('Guardado.');
  });

  it('restores the default', async () => {
    const { el, api, fixture } = await setup();
    (el.querySelectorAll('button')[1] as HTMLButtonElement).click();
    await settle(fixture);
    expect(api.resetMethodology).toHaveBeenCalledWith('p1');
    expect(area(el).value).toBe('por defecto');
  });

  it('shows the error when saving fails', async () => {
    const { el, fixture } = await setup({
      saveMethodology: vi.fn().mockResolvedValue({ code: 'chat.invalidInput' }),
    });
    (el.querySelectorAll('button')[0] as HTMLButtonElement).click();
    await settle(fixture);
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });
});
