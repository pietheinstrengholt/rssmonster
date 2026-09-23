import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { optimizePng } from '../scripts/optimize-png.js';

describe('Generated PNG optimization', () => {
  it.each([1, 0.5])('preserves dimensions and RGBA pixels for alpha=%s', async alpha => {
    const original = await sharp({ create: {
      width: 64, height: 64, channels: 4,
      background: { r: 31, g: 123, b: 211, alpha }
    } }).png({ compressionLevel: 0 }).toBuffer();

    const optimized = await optimizePng(original);
    const decode = contents => sharp(contents).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const before = await decode(original);
    const after = await decode(optimized);

    expect(after.info.width).toBe(before.info.width);
    expect(after.info.height).toBe(before.info.height);
    expect(after.data).toEqual(before.data);
    expect(optimized.length).toBeLessThan(original.length);
  });
});
