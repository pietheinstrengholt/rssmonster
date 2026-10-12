import { describe, expect, it } from 'vitest';
import {
  getQualityClass,
  getQualityIcon,
  getToneClass,
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

  it('maps tone scores to their existing classes', () => {
    expect([55, 35, 10].map(getToneClass)).toEqual([
      'tone-moderate',
      'tone-poor',
      'tone-very-poor'
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
