import { describe, expect, it } from 'vitest';

import {
  MEDIA_PROVIDER_REGISTRY,
  detectMediaProvider,
  isKnownMediaProvider,
  providerFromMetadata,
  providerFromUrl
} from '../../utils/mediaProviderRegistry.js';

describe('mediaProviderRegistry', () => {
  it('contains only the intentionally supported canonical providers', () => {
    expect(Object.keys(MEDIA_PROVIDER_REGISTRY)).toEqual([
      'youtube',
      'vimeo',
      'spotify',
      'soundcloud'
    ]);
    expect(Object.isFrozen(MEDIA_PROVIDER_REGISTRY)).toBe(true);
  });

  it('normalizes and resolves only registered metadata aliases', () => {
    expect(providerFromMetadata(' YouTube ')).toBe('youtube');
    expect(providerFromMetadata('www.youtube.com')).toBe('youtube');
    expect(providerFromMetadata('YouTube   Video')).toBe('youtube');
    expect(providerFromMetadata('YT')).toBe('youtube');
    expect(providerFromMetadata('JWPlayer')).toBeNull();
    expect(providerFromMetadata('MyVideoHost')).toBeNull();
    expect(providerFromMetadata('foobar')).toBeNull();
  });

  it('detects registered domains and their subdomains without matching lookalikes', () => {
    expect(providerFromUrl('https://player.vimeo.com/video/123')).toBe('vimeo');
    expect(providerFromUrl('https://music.youtube-nocookie.com/embed/example')).toBe('youtube');
    expect(providerFromUrl('https://youtu.be/example')).toBe('youtube');
    expect(providerFromUrl('https://youtube.com.attacker.example/video')).toBeNull();
    expect(providerFromUrl('not a URL')).toBeNull();
  });

  it('uses structured YouTube identity, URLs, then metadata in priority order', () => {
    expect(detectMediaProvider({
      videoId: 'gZUDEBbZSp4',
      urls: ['https://vimeo.com/123'],
      metadataValues: ['spotify']
    })).toBe('youtube');
    expect(detectMediaProvider({
      urls: ['https://w.soundcloud.com/player'],
      metadataValues: ['vimeo']
    })).toBe('soundcloud');
    expect(detectMediaProvider({ metadataValues: ['SPOTIFY'] })).toBe('spotify');
    expect(detectMediaProvider({ metadataValues: ['JWPlayer'] })).toBeNull();
  });

  it('recognizes canonical ids without treating aliases as canonical ids', () => {
    expect(isKnownMediaProvider('youtube')).toBe(true);
    expect(isKnownMediaProvider('YouTube')).toBe(false);
    expect(isKnownMediaProvider('youtube.com')).toBe(false);
    expect(isKnownMediaProvider('jwplayer')).toBe(false);
  });
});
