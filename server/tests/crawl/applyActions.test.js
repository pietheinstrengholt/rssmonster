import { describe, expect, it, vi } from 'vitest';

import applyActions from '../../services/crawl/applyActions.js';

// This function creates a tagging action for one searchable-field assertion.
const tagAction = regularExpression => ({
  name: 'Matching rule',
  actionType: 'tag',
  regularExpression,
  tagValue: 'matched'
});

const article = {
  title: 'Important release announcement',
  contentHtml: '<p>Rendered publisher body</p>',
  contentText: 'Rendered publisher body',
  description: 'A separate feed summary',
  url: 'https://example.com/releases/version-2'
};

describe('applyActions searchable article fields', () => {
  it.each([
    ['title', 'release announcement'],
    ['content HTML', 'Rendered publisher body'],
    ['content text', '^Rendered publisher body$'],
    ['description', 'separate feed summary'],
    ['URL', '/releases/version-2$']
  ])('matches action regular expressions against %s', (_field, expression) => {
    const result = applyActions([tagAction(expression)], article);

    expect(result.tags).toEqual(['matched']);
  });

  it('preserves anchored HTML-body rule behavior when other fields are present', () => {
    const result = applyActions([
      tagAction('^<p>Rendered publisher body</p>$')
    ], article);

    expect(result.tags).toEqual(['matched']);
  });

  it('does not match a rule when none of the explicit fields contain it', () => {
    const result = applyActions([tagAction('not-present')], article);

    expect(result.tags).toEqual([]);
  });

  it.each([
    ['advertisement', 'advertisementScore'],
    ['badquality', 'qualityScore']
  ])('sets the %s action score to the lowest quality bucket', (actionType, scoreField) => {
    const result = applyActions([{
      name: 'Score override',
      actionType,
      regularExpression: 'Rendered publisher body'
    }], article);

    expect(result[scoreField]).toBe(0);
  });

  it('marks delete matches for persistence with delete status', () => {
    const result = applyActions([{
      name: 'Delete matching articles',
      actionType: 'delete',
      regularExpression: 'Rendered publisher body'
    }], article);

    expect(result).toMatchObject({
      shouldDelete: true,
      status: 'delete'
    });
  });

  it('logs and skips malformed regular expressions', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(applyActions([tagAction('[')], article).tags).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      'Error testing regex for action "Matching rule"'
    );

    consoleError.mockRestore();
  });
});
