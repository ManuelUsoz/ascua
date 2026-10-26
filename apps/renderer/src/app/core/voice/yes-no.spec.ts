import { answerFor } from './yes-no';

describe('answerFor', () => {
  it.each(['Sí.', 'dale', 'Hacelo!', 'de una', 'sí, dale', 'Claro'])(
    'allows %s in es',
    (text) => expect(answerFor(text, 'es')).toBe('allow'),
  );

  it.each(['no', 'No.', 'cancelá no', 'mejor no', 'Cancela'])(
    'denies %s in es',
    (text) => expect(answerFor(text, 'es')).toBe('deny'),
  );

  it('reads english', () => {
    expect(answerFor('Yes!', 'en')).toBe('allow');
    expect(answerFor('do it', 'en')).toBe('allow');
    expect(answerFor('Nope', 'en')).toBe('deny');
  });

  it('refuses long or unrelated utterances', () => {
    expect(answerFor('sí pero antes abrí la terminal', 'es')).toBeUndefined();
    expect(answerFor('abrí una terminal', 'es')).toBeUndefined();
    expect(answerFor('', 'es')).toBeUndefined();
  });

  it('does not match inside words', () => {
    expect(answerFor('nota', 'es')).toBeUndefined();
  });
});
