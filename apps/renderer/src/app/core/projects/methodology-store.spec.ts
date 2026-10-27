import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ASCUA_API } from '../bridge/ascua-api';
import { MethodologyStore } from './methodology-store';

function setup(api: unknown) {
  TestBed.configureTestingModule({
    providers: [{ provide: ASCUA_API, useValue: api }],
  });
  return TestBed.inject(MethodologyStore);
}

describe('MethodologyStore', () => {
  it('returns the rules on success', async () => {
    const api = {
      getMethodology: vi.fn().mockResolvedValue({ rules: 'r1' }),
      saveMethodology: vi.fn().mockResolvedValue({ rules: 'r2' }),
    };
    const store = setup(api);
    expect(await store.load('p')).toEqual({ ok: true, rules: 'r1' });
    expect(await store.save('p', 'r2')).toEqual({ ok: true, rules: 'r2' });
    expect(api.saveMethodology).toHaveBeenCalledWith('p', 'r2');
  });

  it('maps error codes and thrown errors', async () => {
    const store = setup({
      getMethodology: vi.fn().mockResolvedValue({ code: 'chat.invalidInput' }),
      resetMethodology: vi.fn().mockRejectedValue(new Error('boom')),
    });
    expect(await store.load('p')).toEqual({
      ok: false,
      error: { code: 'chat.invalidInput' },
    });
    const r = await store.reset('p');
    expect(r.ok).toBe(false);
  });
});
