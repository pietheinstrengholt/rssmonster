import { describe, expect, it } from 'vitest';

import { generateTopicName } from '../../services/topics/shared/topicName.service.js';

describe('generateTopicName', () => {
  it('names topics from repeated semantic anchors instead of article sentences', () => {
    const name = generateTopicName({
      semanticUnit: {
        title: 'Mercedes driver George Russell suffered a late setback in qualifying'
      },
      seedEvents: [
        { event: { name: 'Mercedes driver George Russell suffered a late setback in qualifying' } },
        { event: { name: 'George Russell says Mercedes must solve race pace problems' } }
      ]
    });

    expect(name).toBe('George Russell / Mercedes');
    expect(name).not.toMatch(/\bsuffered\b/i);
    expect(name).not.toMatch(/\bsays\b/i);
  });

  it('uses shared technology phrases for lower-event titles', () => {
    const name = generateTopicName({
      semanticUnit: {
        title: 'react hook form and zod validation patterns for complex forms'
      },
      seedEvents: [
        { event: { name: 'react hook form zod validation patterns for multi step forms' } },
        { event: { name: 'react hook form zod schema validation in production forms' } }
      ]
    });

    expect(name).toBe('React Hook Form Zod / Validation Patterns');
  });

  it('strips publisher suffixes in fallback names', () => {
    const name = generateTopicName({
      semanticUnit: {
        title: 'OpenAI releases new model for coding - Example News'
      }
    });

    expect(name).toBe('OpenAI');
  });

  it('trims weak words from both edges of fallback labels', () => {
    const name = generateTopicName({
      semanticUnit: {
        title: 'Latest Quantum Computing Update'
      }
    });

    expect(name).toBe('Quantum Computing');
  });

  it('caps long generated names at a complete word boundary', () => {
    const longEntity = 'International Consortium Advanced Quantum Telecommunications Infrastructure Observatory Research Partnership';
    const name = generateTopicName({
      semanticUnit: { title: `${longEntity} publishes research` }
    });

    expect(name.length).toBeLessThanOrEqual(90);
    expect(name).not.toMatch(/\s$/);
  });

  it('falls back to the default when titles contain only weak vocabulary', () => {
    expect(generateTopicName({
      semanticUnit: { title: 'the latest news' }
    })).toBe('Untitled Topic');

    expect(generateTopicName({
      semanticUnit: { title: 'the latest news' },
      seedEvents: [{ event: { name: 'live report updates' } }]
    })).toBe('Untitled Topic');
  });
});
