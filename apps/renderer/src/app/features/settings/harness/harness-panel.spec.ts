import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AscuaError, BenchmarkReport } from '@ascua/ipc';
import { provideTranslocoScope } from '@jsverse/transloco';
import { BenchmarkStore } from '../../../core/projects/benchmark-store';
import { ProjectStore } from '../../../core/projects/project-store';
import { i18nTesting } from '../../../testing/i18n';
import { HarnessPanel } from './harness-panel';

describe('HarnessPanel', () => {
  const report = signal<BenchmarkReport | undefined>(undefined);
  const running = signal(false);
  const progress = signal({ done: 0, total: 0 });
  const error = signal<AscuaError | undefined>(undefined);
  const run = vi.fn(() => Promise.resolve());

  function render() {
    report.set(undefined);
    running.set(false);
    progress.set({ done: 0, total: 0 });
    error.set(undefined);
    TestBed.configureTestingModule({
      imports: [HarnessPanel, i18nTesting()],
      providers: [
        {
          provide: BenchmarkStore,
          useValue: { report, running, progress, error, run },
        },
        {
          provide: ProjectStore,
          useValue: { projects: signal([{ id: 'p1', name: 'Demo' }]) },
        },
        provideTranslocoScope('settings'),
      ],
    });
    const fixture = TestBed.createComponent(HarnessPanel);
    fixture.detectChanges();
    return fixture;
  }

  it('runs the benchmark of the selected project', () => {
    const el: HTMLElement = render().nativeElement;
    el.querySelector<HTMLButtonElement>('button')?.click();
    expect(run).toHaveBeenCalledWith('p1');
  });

  it('shows only the progress bar while running', () => {
    const fixture = render();
    running.set(true);
    progress.set({ done: 2, total: 5 });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const bar = el.querySelector('app-progress-bar');
    expect(bar?.getAttribute('aria-valuenow')).toBe('2');
    expect(el.textContent).not.toMatch(/2\s*\/\s*5|2 de 5/);
    expect(el.querySelector('table')).toBeNull();
  });

  it('renders the per-tool rows when done', () => {
    const fixture = render();
    report.set({
      cases: [],
      perTool: [{ tool: 'search', hitRate: 0.5, avgTokens: 120, avgMs: 7 }],
    });
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      'tbody tr',
    );
    expect(row?.textContent).toContain('search');
    expect(row?.textContent).toContain('50%');
    expect(row?.textContent).toContain('120');
  });

  it('renders the error notice', () => {
    const fixture = render();
    error.set({ code: 'indexer.benchFailed' });
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-notice')
        ?.textContent,
    ).toContain('benchmark falló');
  });
});
