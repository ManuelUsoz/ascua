import { UnsavedChanges } from './unsaved-changes';

describe('UnsavedChanges', () => {
  it('resolves true at once when clean', async () => {
    expect(await new UnsavedChanges().confirmDiscard()).toBe(true);
  });

  it('shares one pending prompt and resolves on answer', async () => {
    const u = new UnsavedChanges();
    u.dirty.set(true);
    const a = u.confirmDiscard('a.ts');
    const b = u.confirmDiscard('a.ts');
    expect(a).toBe(b);
    expect(u.prompt()).toBe('a.ts');
    u.answer(false);
    expect(await a).toBe(false);
    expect(u.prompt()).toBeUndefined();
    expect(u.dirty()).toBe(true);
  });

  it('keeps dirty when discarding until the navigation happens', async () => {
    const u = new UnsavedChanges();
    u.dirty.set(true);
    const p = u.confirmDiscard('a.ts');
    u.answer(true);
    expect(await p).toBe(true);
    expect(u.dirty()).toBe(true);
  });
});
