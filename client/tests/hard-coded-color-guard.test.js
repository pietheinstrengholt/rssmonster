import { describe, expect, it } from 'vitest';
import {
  evaluateColorPolicy,
  extractColorOccurrences,
  formatColorGuardReport
} from '../scripts/check-hard-coded-colors.js';

// Extracts a fixture through the same Vue style-block path used by the command.
const extractVueFixture = source => extractColorOccurrences(source, {
  extension: '.vue',
  filePath: 'src/components/Fixture.vue'
});

// Exercises literal detection, durable exceptions, and the count-based legacy ratchet.
describe('hard-coded color guard', () => {
  // This test limits Vue detection to declarations in style blocks and recognizes supported color syntax.
  it('detects UI color literals without scanning Vue template, script, selectors, or comments', () => {
    const source = `<template><div data-color="#abcdef" /></template>
<script>const example = 'red';</script>
<style scoped>
/* color: #fedcba; */
#abc { color: rgb(1, 2, 3); }
.sample {
  content: "blue";
  mask-image: url("icon-red-#fff.svg");
  border-color: red;
  outline-color: currentColor;
  background: var(--sample-surface, #ABCDEF);
  box-shadow: 0 0 1px oklch(50% 0.2 240);
}
</style>`;
    const occurrences = extractVueFixture(source);

    expect(occurrences.map(occurrence => occurrence.literal)).toEqual([
      'rgb(1, 2, 3)',
      'red',
      'currentColor',
      '#ABCDEF',
      'oklch(50% 0.2 240)'
    ]);
    expect(occurrences.map(occurrence => occurrence.line)).toEqual([5, 9, 10, 11, 12]);
    expect(occurrences[3].isVarFallback).toBe(true);
  });

  // This test keeps approved exceptions narrow, capped, and conditional on fallback semantics.
  it('allowlists only the reviewed number and kind of matching literals', () => {
    const occurrences = extractVueFixture(`<style>
.one { color: var(--text, #fff); }
.two { color: var(--text, #fff); }
.three { color: #fff; }
</style>`);
    const result = evaluateColorPolicy(occurrences, {
      approvedExceptions: [{
        category: 'intentional-var-fallback',
        file: 'src/components/Fixture.vue',
        literal: '#fff',
        maxOccurrences: 1,
        reason: 'Fixture fallback.',
        varFallback: true
      }],
      baseline: {}
    });

    expect(result.approvedCount).toBe(1);
    expect(result.failures).toHaveLength(2);
    expect(result.failures.map(failure => failure.line)).toEqual([3, 4]);
  });

  // This test permits the recorded count, ratchets downward, and rejects new or increased literals.
  it('enforces the per-file and per-literal baseline as an upper bound', () => {
    const source = '.one { color: #123456; }\n.two { border-color: #123456; }';
    const occurrences = extractColorOccurrences(source, {
      extension: '.scss',
      filePath: 'src/components/fixture.scss'
    });
    const accepted = evaluateColorPolicy(occurrences, {
      approvedExceptions: [],
      baseline: { 'src/components/fixture.scss': { '#123456': 2 } }
    });
    const ratcheted = evaluateColorPolicy(occurrences.slice(0, 1), {
      approvedExceptions: [],
      baseline: { 'src/components/fixture.scss': { '#123456': 2 } }
    });
    const rejected = evaluateColorPolicy([
      ...occurrences,
      {
        ...occurrences[1],
        line: 3,
        literal: '#654321',
        normalizedLiteral: '#654321'
      }
    ], {
      approvedExceptions: [],
      baseline: { 'src/components/fixture.scss': { '#123456': 1 } }
    });
    const report = formatColorGuardReport({
      ...rejected,
      fileCount: 1
    });

    expect(accepted.failures).toEqual([]);
    expect(ratcheted.failures).toEqual([]);
    expect(rejected.failures).toHaveLength(2);
    expect(report).toContain('src/components/fixture.scss:2: #123456');
    expect(report).toContain('src/components/fixture.scss:3: #654321');
    expect(report).toContain('Use an existing semantic CSS variable');
  });
});
