import { mountAscua } from '@ascua/character';

describe('character voice acts', () => {
  it('shows the talk face with the existing open mouth', () => {
    const host = document.createElement('div');
    const ascua = mountAscua(host, 'test');
    ascua.play('talk');
    const el = host.querySelector<HTMLElement>('.ascua')!;
    expect(el.dataset['act']).toBe('talk');
    expect(el.dataset['mouth']).toBe('open');
    expect(el.dataset['eyes']).toBe('open');
  });

  it('shows the listen face with wide eyes and the ask tone', () => {
    const host = document.createElement('div');
    const ascua = mountAscua(host, 'test');
    ascua.play('listen');
    const el = host.querySelector<HTMLElement>('.ascua')!;
    expect(el.dataset['act']).toBe('listen');
    expect(el.dataset['mouth']).toBe('none');
    expect(el.dataset['eyes']).toBe('wide');
    expect(el.dataset['tone']).toBe('ask');
  });
});
