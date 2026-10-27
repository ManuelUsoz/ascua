import { describe, expect, it } from 'vitest';
import { UiContextStore } from './ui-context';

describe('UiContextStore', () => {
  it('keeps known labels and a valid route', () => {
    const store = new UiContextStore();
    store.set({
      labels: { 'nav.files': 'Archivos', evil: 'x', 'nav.projects': 3 },
      route: { screen: 'project', projectId: 'p1', tab: 'files' },
    });
    expect(store.get()).toEqual({
      labels: { 'nav.files': 'Archivos' },
      route: { screen: 'project', projectId: 'p1', tab: 'files' },
    });
  });

  it('drops invalid routes and non-objects', () => {
    const store = new UiContextStore();
    store.set({ labels: {}, route: { screen: 'project' } });
    expect(store.get().route).toBeUndefined();
    store.set({ labels: {}, route: { screen: 'nope' } });
    expect(store.get().route).toBeUndefined();
    store.set(null);
    expect(store.get().labels).toEqual({});
  });
});
