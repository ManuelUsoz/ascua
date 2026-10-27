import { describe, expect, it } from 'vitest';
import { SentenceChunker } from './sentence-chunker';

function run(chunks: string[]): string[] {
  const c = new SentenceChunker();
  const out: string[] = [];
  for (const ch of chunks) out.push(...c.push(ch));
  out.push(...c.flush());
  return out;
}

describe('SentenceChunker', () => {
  it('splits streamed spanish at odd points', () => {
    expect(run(['Hola, ¿cómo est', 'ás? Todo bi', 'en. Listo', '.'])).toEqual([
      'Hola, ¿cómo estás?',
      'Todo bien.',
      'Listo.',
    ]);
  });

  it('waits for whitespace after punctuation', () => {
    const c = new SentenceChunker();
    expect(c.push('Done.')).toEqual([]);
    expect(c.push(' Next one!')).toEqual(['Done.']);
    expect(c.flush()).toEqual(['Next one!']);
  });

  it('keeps decimals and abbreviations together', () => {
    expect(
      run(['Mide 3.5 metros. El Sr. Pérez vino, e.g. ayer. Fin.']),
    ).toEqual(['Mide 3.5 metros.', 'El Sr. Pérez vino, e.g. ayer.', 'Fin.']);
    expect(run(['Usa p. ej. esto y etc. luego. Listo.'])).toEqual([
      'Usa p. ej. esto y etc. luego.',
      'Listo.',
    ]);
  });

  it('splits on blank lines', () => {
    expect(run(['Primera linea\n\nSegunda linea'])).toEqual([
      'Primera linea',
      'Segunda linea',
    ]);
  });

  it('skips fenced code, even across deltas', () => {
    expect(
      run(['Mira esto. ``', '`ts\nconst a = 1.\n``', '` Eso es todo.']),
    ).toEqual(['Mira esto.', 'Eso es todo.']);
  });

  it('strips markdown marks', () => {
    expect(
      run(['**Hola** `mundo` [enlace](http://x.y) aqui. # Titulo\n\nok bien']),
    ).toEqual(['Hola mundo enlace aqui.', 'Titulo', 'ok bien']);
  });

  it('cuts long sentences at the last comma', () => {
    const long = `${'palabra, '.repeat(40)}fin.`;
    const out = run([long]);
    expect(out.length).toBeGreaterThan(1);
    for (const s of out) expect(s.length).toBeLessThanOrEqual(240);
  });

  it('drops fragments without letters', () => {
    expect(run(['1. 2. ¡Hola amigo!'])).toEqual(['¡Hola amigo!']);
  });

  it('flush emits the unfinished tail', () => {
    const c = new SentenceChunker();
    expect(c.push('sin punto final')).toEqual([]);
    expect(c.flush()).toEqual(['sin punto final']);
    expect(c.flush()).toEqual([]);
  });
});
