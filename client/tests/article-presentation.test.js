import { describe, expect, it } from 'vitest';
import {
  getQualityClass,
  getQualityIcon,
  getSentimentClass,
  scoreLabel
} from '../src/services/articlePresentation.js';

describe('article presentation helpers', () => {
  it('maps quality scores to their existing icons', () => {
    expect([95, 85, 75, 65, 50].map(getQualityIcon)).toEqual([
      'patch-check-fill',
      'patch-check-fill',
      'exclamation-circle-fill',
      'exclamation-triangle-fill',
      'x-octagon-fill'
    ]);
  });

  it('maps quality scores to their existing classes', () => {
    expect([95, 85, 75, 65, 50].map(getQualityClass)).toEqual([
      'quality-excellent',
      'quality-good',
      'quality-okay',
      'quality-weak',
      'quality-poor'
    ]);
  });

  it('maps sentiment scores to their existing classes', () => {
    expect([55, 35, 10].map(getSentimentClass)).toEqual([
      'sentiment-moderate',
      'sentiment-poor',
      'sentiment-very-poor'
    ]);
  });

  it('maps article scores to their existing labels', () => {
    expect([95, 85, 75, 65, 50].map(scoreLabel)).toEqual([
      'Excellent',
      'Good',
      'Okay',
      'Weak',
      'Poor'
    ]);
  });
});
