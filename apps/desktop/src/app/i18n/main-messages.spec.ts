import { describe, expect, it } from 'vitest';
import { MainText } from './main-messages';

describe('MainText', () => {
  it('keeps the Spanish quit text verbatim', () => {
    const text = new MainText('es');
    expect(text.quit(1)).toEqual({
      message: 'Tenés 1 terminal corriendo, ¿cerrar igual?',
      buttons: ['Cerrar igual', 'Cancelar'],
    });
    expect(text.quit(3).message).toBe(
      'Tenés 3 terminales corriendo, ¿cerrar igual?',
    );
  });

  it('switches to English', () => {
    const text = new MainText('es');
    text.set('en');
    expect(text.quit(1).message).toContain('1 terminal running');
    expect(text.quit(2).message).toContain('2 terminals running');
    expect(text.quit(2).buttons).toEqual(['Quit anyway', 'Cancel']);
  });
});
