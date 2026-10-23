import { describe, expect, it } from 'vitest';
import { OutputBuffer } from './output-buffer';

describe('OutputBuffer', () => {
  it('batches pushes until taken', () => {
    const buffer = new OutputBuffer();
    buffer.push('ab');
    buffer.push('cd');
    expect(buffer.take()).toEqual({ data: 'abcd', seq: 4 });
    expect(buffer.take()).toBeUndefined();
  });

  it('keeps seq monotonic across takes', () => {
    const buffer = new OutputBuffer();
    buffer.push('abc');
    const first = buffer.take();
    buffer.push('de');
    const second = buffer.take();
    expect(first?.seq).toBe(3);
    expect(second?.seq).toBe(5);
  });

  it('trims history at a newline once over the bound', () => {
    const buffer = new OutputBuffer(10);
    buffer.push('aaaa\nbbbb\ncccc\n');
    const snap = buffer.snapshot();
    expect(snap.data.length).toBeLessThanOrEqual(10);
    expect(snap.data).toBe('cccc\n');
    expect(snap.seq).toBe(15);
  });

  it('does not overlap snapshot and take', () => {
    const buffer = new OutputBuffer();
    buffer.push('one');
    const snap = buffer.snapshot();
    buffer.push('two');
    const next = buffer.take();
    expect(snap.data).toBe('one');
    expect(next?.seq).toBeGreaterThan(snap.seq);
    expect(buffer.snapshot()).toEqual({ data: 'onetwo', seq: 6 });
  });
});
