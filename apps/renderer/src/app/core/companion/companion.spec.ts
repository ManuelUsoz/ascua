import { TestBed } from '@angular/core/testing';
import type { Life } from '@ascua/character';
import { Companion } from './companion';

function setup() {
  const life = {
    need: vi.fn(),
    celebrate: vi.fn(),
    release: vi.fn(),
    poke: vi.fn(),
  } satisfies Life;
  const companion = TestBed.inject(Companion);
  companion.attach(life);
  return { life, companion };
}

describe('Companion working face', () => {
  it('plays think and releases when work ends', () => {
    const { life, companion } = setup();
    companion.work('think');
    expect(life.need).toHaveBeenLastCalledWith('think');
    companion.work('read');
    expect(life.need).toHaveBeenLastCalledWith('read');
    companion.work(null);
    expect(life.release).toHaveBeenCalledTimes(1);
  });

  it('does not release when nothing was working', () => {
    const { life, companion } = setup();
    companion.work(null);
    expect(life.release).not.toHaveBeenCalled();
  });

  it('keeps a permission need above work and resumes it on release', () => {
    const { life, companion } = setup();
    companion.need('ask');
    life.need.mockClear();
    companion.work('think');
    expect(life.need).not.toHaveBeenCalled();
    companion.release();
    expect(life.need).toHaveBeenLastCalledWith('think');
    expect(life.release).not.toHaveBeenCalled();
  });

  it('idles on release when work ended during the need', () => {
    const { life, companion } = setup();
    companion.work('think');
    companion.need('warn');
    companion.work(null);
    companion.release();
    expect(life.release).toHaveBeenCalledTimes(1);
  });

  it('plays listen and talk above work and resumes work afterwards', () => {
    const { life, companion } = setup();
    companion.work('think');
    companion.voice('listening');
    expect(life.need).toHaveBeenLastCalledWith('listen');
    companion.voice('speaking');
    expect(life.need).toHaveBeenLastCalledWith('talk');
    companion.voice(null);
    expect(life.need).toHaveBeenLastCalledWith('think');
    expect(life.release).not.toHaveBeenCalled();
  });

  it('releases when voice ends and nothing else is active', () => {
    const { life, companion } = setup();
    companion.voice('speaking');
    companion.voice(null);
    expect(life.release).toHaveBeenCalledTimes(1);
  });

  it('keeps a permission need above voice and falls back to voice on release', () => {
    const { life, companion } = setup();
    companion.need('ask');
    life.need.mockClear();
    companion.voice('listening');
    expect(life.need).not.toHaveBeenCalled();
    companion.release();
    expect(life.need).toHaveBeenLastCalledWith('listen');
  });

  it('replays work raised before the life loop attaches', () => {
    const companion = TestBed.inject(Companion);
    companion.work('think');
    const life = {
      need: vi.fn(),
      celebrate: vi.fn(),
      release: vi.fn(),
      poke: vi.fn(),
    };
    companion.attach(life);
    expect(life.need).toHaveBeenCalledWith('think');
  });
});
