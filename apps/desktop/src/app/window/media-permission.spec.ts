import { describe, expect, it } from 'vitest';
import { allowCheck, allowRequest } from './media-permission';

const own = 'file:///app/index.html?voiceFake=x';
const isOwn = (url: string | undefined) => url === own;

describe('allowRequest', () => {
  it('allows audio from our renderer', () => {
    expect(
      allowRequest(
        'media',
        { requestingUrl: own, mediaTypes: ['audio'] },
        isOwn,
      ),
    ).toBe(true);
  });

  it('denies video, audio+video and missing media types', () => {
    for (const mediaTypes of [['video'], ['audio', 'video'], [], undefined]) {
      expect(
        allowRequest('media', { requestingUrl: own, mediaTypes }, isOwn),
      ).toBe(false);
    }
  });

  it('denies audio from another page', () => {
    expect(
      allowRequest(
        'media',
        { requestingUrl: 'file:///other.html', mediaTypes: ['audio'] },
        isOwn,
      ),
    ).toBe(false);
  });

  it('denies other permissions', () => {
    for (const p of ['notifications', 'geolocation', 'clipboard-read']) {
      expect(allowRequest(p, { requestingUrl: own }, isOwn)).toBe(false);
    }
  });

  it('allows clipboard write only from our renderer', () => {
    expect(
      allowRequest('clipboard-sanitized-write', { requestingUrl: own }, isOwn),
    ).toBe(true);
    expect(
      allowRequest(
        'clipboard-sanitized-write',
        { requestingUrl: 'https://evil.test/' },
        isOwn,
      ),
    ).toBe(false);
  });
});

describe('allowCheck', () => {
  it('allows only the audio media check from our renderer', () => {
    expect(
      allowCheck('media', { requestingUrl: own, mediaType: 'audio' }, isOwn),
    ).toBe(true);
    expect(
      allowCheck('media', { requestingUrl: own, mediaType: 'video' }, isOwn),
    ).toBe(false);
    expect(allowCheck('media', { requestingUrl: own }, isOwn)).toBe(false);
    expect(allowCheck('geolocation', { requestingUrl: own }, isOwn)).toBe(
      false,
    );
    expect(
      allowCheck(
        'media',
        { requestingUrl: 'x://y', mediaType: 'audio' },
        isOwn,
      ),
    ).toBe(false);
  });
});
