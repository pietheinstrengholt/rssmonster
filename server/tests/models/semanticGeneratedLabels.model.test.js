import { describe, expect, it } from 'vitest';
import db from '../../models/index.js';

const { Event, Island, Topic } = db;

describe('generated semantic label model fields', () => {
  it.each([
    ['Event', Event, 'generatedName'],
    ['Topic', Topic, 'generatedName'],
    ['Island', Island, 'generatedLabel']
  ])('defines %s.%s as an optional 255-character string', (_name, model, field) => {
    const attribute = model.getAttributes()[field];

    expect(attribute.allowNull).toBe(true);
    expect(attribute.defaultValue).toBeNull();
    expect(attribute.type.options.length).toBe(255);
  });
});
