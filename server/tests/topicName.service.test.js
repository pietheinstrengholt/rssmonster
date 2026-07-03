import { describe, expect, it } from 'vitest';

import { generateTopicName } from '../services/topics/shared/topicName.service.js';

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
});
