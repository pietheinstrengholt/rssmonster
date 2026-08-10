import { describe, expect, it } from 'vitest';

import selectLeadImage, { scoreCandidate } from '../../services/crawl/media/selectLeadImage.js';

describe('selectLeadImage', () => {
  it('ignores malformed candidate URLs while retaining valid candidates', () => {
    expect(selectLeadImage([
      { url: 'not a valid URL', source: 'cleaned-content' },
      { url: 'https://cdn.example/lead.jpg', source: 'cleaned-content' }
    ])).toEqual({
      url: 'https://cdn.example/lead.jpg',
      width: null,
      height: null,
      mimeType: null,
      source: 'cleaned-content'
    });
  });

  it('uses the richest duplicate metadata when ranking one image URL', () => {
    expect(selectLeadImage([
      {
        url: 'https://cdn.example/shared.jpg',
        source: 'cleaned-content',
        position: 1,
        alt: 'Brief'
      },
      {
        url: 'https://cdn.example/shared.jpg',
        source: 'media-thumbnail',
        position: 1,
        alt: 'A detailed editorial photograph'
      },
      {
        url: 'https://cdn.example/first.jpg',
        source: 'cleaned-content',
        position: 0
      }
    ])).toEqual(expect.objectContaining({
      url: 'https://cdn.example/shared.jpg',
      source: 'cleaned-content'
    }));
  });

  it.each([
    'media-content',
    'media-thumbnail',
    'enclosure',
    'publisher'
  ])('keeps existing %s candidates eligible', source => {
    expect(selectLeadImage([{
      url: `https://cdn.example/${source}.jpg`,
      width: 1200,
      height: 675,
      source
    }])).toEqual(expect.objectContaining({ source }));
  });

  it('keeps deterministic input-order tie-breaking for eligible candidates', () => {
    expect(selectLeadImage([
      { url: 'https://cdn.example/first.jpg', source: 'publisher' },
      { url: 'https://cdn.example/second.jpg', source: 'publisher' }
    ])?.url).toBe('https://cdn.example/first.jpg');
  });

  it('scores moderate, extreme, and intermediate aspect ratios differently', () => {
    const moderateRatioScore = scoreCandidate({
      url: 'https://cdn.example/moderate.jpg',
      width: 400,
      height: 1000,
      source: null,
      position: null,
      alt: null
    });
    const intermediateRatioScore = scoreCandidate({
      url: 'https://cdn.example/intermediate.jpg',
      width: 800,
      height: 200,
      source: null,
      position: null,
      alt: null
    });
    const extremeRatioScore = scoreCandidate({
      url: 'https://cdn.example/extreme.jpg',
      width: 2000,
      height: 200,
      source: null,
      position: null,
      alt: null
    });

    expect(moderateRatioScore).toBeGreaterThan(intermediateRatioScore);
    expect(intermediateRatioScore).toBeGreaterThan(extremeRatioScore);
  });

  it('penalizes later article positions up to the configured cap', () => {
    const candidate = {
      url: 'https://cdn.example/positioned.jpg',
      width: null,
      height: null,
      source: null,
      alt: null
    };

    expect(scoreCandidate({ ...candidate, position: 3 })).toBe(-3);
    expect(scoreCandidate({ ...candidate, position: 50 })).toBe(-30);
  });

  it('penalizes small image requests expressed through URL query parameters', () => {
    const candidate = {
      width: 640,
      height: 360,
      source: 'cleaned-content',
      position: null,
      alt: null
    };
    const baselineScore = scoreCandidate({
      ...candidate,
      url: 'https://cdn.example/photo.jpg'
    });
    const smallRequestScore = scoreCandidate({
      ...candidate,
      url: 'https://cdn.example/photo.jpg?WIDTH=200&size=small'
    });

    expect(smallRequestScore).toBe(baselineScore - 50);
  });

  it('gives an invalid URL a noncompetitive score', () => {
    expect(scoreCandidate({
      url: 'not a valid URL',
      width: null,
      height: null,
      source: null,
      position: null,
      alt: null
    })).toBe(Number.NEGATIVE_INFINITY);
  });

  it('rejects empty, tiny, tracking, and decorative image candidates', () => {
    expect(selectLeadImage([
      null,
      { url: '', source: 'cleaned-content' },
      { url: 'https://cdn.example/pixel.jpg', width: 1, height: 1, source: 'cleaned-content' },
      { url: 'https://cdn.example/small.jpg', width: 50, height: 50, source: 'cleaned-content' },
      {
        url: 'https://cdn.example/photo.jpg',
        width: 300,
        height: 170,
        className: 'author portrait',
        source: 'cleaned-content'
      }
    ])).toBeNull();
  });

  it('scores candidates with only one known dimension', () => {
    const widthOnly = scoreCandidate({
      url: 'https://cdn.example/width.jpg',
      width: 1200,
      height: null,
      source: 'cleaned-content',
      position: null,
      alt: null
    });
    const heightOnly = scoreCandidate({
      url: 'https://cdn.example/height.jpg',
      width: null,
      height: 675,
      source: 'cleaned-content',
      position: null,
      alt: null
    });

    expect(widthOnly).toBeGreaterThan(0);
    expect(heightOnly).toBeGreaterThan(0);
  });
});
