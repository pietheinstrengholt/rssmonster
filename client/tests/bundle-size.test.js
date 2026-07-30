import { describe, expect, it } from 'vitest';
import {
  evaluateBundleBudgets,
  identifyBundleAssets
} from '../scripts/check-bundle-size.js';

const manifest = {
  '_axios-vendor.js': {
    file: 'assets/axios-vendor-hash.js',
    name: 'axios-vendor'
  },
  '_bootstrap-vendor.js': {
    file: 'assets/bootstrap-vendor-hash.js',
    name: 'bootstrap-vendor'
  },
  '_icons-vendor.js': {
    file: 'assets/icons-vendor-hash.js',
    name: 'icons-vendor'
  },
  '_vue-vendor.js': {
    file: 'assets/vue-vendor-hash.js',
    name: 'vue-vendor'
  },
  'index.html': {
    css: ['assets/index-hash.css'],
    file: 'assets/index-hash.js',
    isEntry: true,
    src: 'index.html'
  }
};

describe('bundle-size checking', () => {
  it('identifies hashed assets through stable manifest metadata', () => {
    expect(identifyBundleAssets(manifest)).toEqual({
      axiosVendor: ['assets/axios-vendor-hash.js'],
      bootstrapVendor: ['assets/bootstrap-vendor-hash.js'],
      entryJavaScript: ['assets/index-hash.js'],
      iconsVendor: ['assets/icons-vendor-hash.js'],
      mainCss: ['assets/index-hash.css'],
      vueVendor: ['assets/vue-vendor-hash.js']
    });
  });

  it('reports the specific raw and gzip limits that are exceeded', () => {
    const budgets = {
      entryJavaScript: {
        gzipBytes: 80,
        label: 'Initial-entry JavaScript',
        rawBytes: 100
      }
    };
    const measurements = {
      entryJavaScript: {
        files: ['assets/index-hash.js'],
        gzipBytes: 81,
        rawBytes: 101
      }
    };

    expect(evaluateBundleBudgets(measurements, budgets)).toEqual([
      'Initial-entry JavaScript (assets/index-hash.js) raw size 0.10 KiB exceeds 0.10 KiB.',
      'Initial-entry JavaScript (assets/index-hash.js) gzip size 0.08 KiB exceeds 0.08 KiB.'
    ]);
  });

  it('passes measurements at or below both limits', () => {
    const budgets = {
      mainCss: {
        gzipBytes: 50,
        label: 'Initial-entry CSS',
        rawBytes: 100
      }
    };
    const measurements = {
      mainCss: {
        files: ['assets/index-hash.css'],
        gzipBytes: 50,
        rawBytes: 100
      }
    };

    expect(evaluateBundleBudgets(measurements, budgets)).toEqual([]);
  });
});
