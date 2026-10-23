import { describe, expect, it } from 'vitest';
import { folderLabel, toTerminalInput } from './pista-form-model';

describe('pista form model', () => {
  it('drops empty cwd/port and trims text', () => {
    expect(
      toTerminalInput({ name: ' a ', command: ' ls ', cwd: ' ', port: null }),
    ).toEqual({ name: 'a', command: 'ls' });
  });

  it('keeps id, cwd and a numeric port', () => {
    expect(
      toTerminalInput(
        { name: 'a', command: 'ls', cwd: 'web', port: 8080 },
        't1',
      ),
    ).toEqual({ id: 't1', name: 'a', command: 'ls', cwd: 'web', port: 8080 });
  });

  it('labels the folder', () => {
    expect(folderLabel('')).toEqual({ key: 'terminals.pista.root' });
    expect(folderLabel('web')).toEqual({
      key: 'terminals.pista.folderPath',
      params: { path: 'web/' },
    });
  });
});
