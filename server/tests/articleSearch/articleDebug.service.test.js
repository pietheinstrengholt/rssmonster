import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  computeRecommendedBreakdown: vi.fn()
}));

vi.mock('../../services/recommendations/recommendedScore.js', () => ({
  computeRecommendedBreakdown: mocked.computeRecommendedBreakdown
}));

import { debugRecommendedScores } from '../../services/articleSearch/articleDebug.service.js';

describe('articleDebug.service', () => {
  let originalNodeEnv;

  // Captures the environment and resets diagnostic collaborators.
  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    mocked.computeRecommendedBreakdown.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'table').mockImplementation(() => {});
  });

  // Restores process state after development-only logging checks.
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  // Keeps ranking diagnostics completely inactive outside development.
  it('does not inspect or log scores outside development', () => {
    process.env.NODE_ENV = 'test';

    debugRecommendedScores([{ article: { id: 1 }, recommended: 0.5 }]);

    expect(mocked.computeRecommendedBreakdown).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.table).not.toHaveBeenCalled();
  });

  // Logs event coverage and normalized score components for development diagnostics.
  it('logs compact score diagnostics in development', () => {
    process.env.NODE_ENV = 'development';
    mocked.computeRecommendedBreakdown.mockReturnValue({
      freshness: 0.12345,
      interestScore: 0.23456,
      positiveInterest: 0.23456,
      negativeInterest: 0,
      quality: 0.76543,
      coverage: 0.34567,
      crossSource: 0.45678,
      corroboration: 0.56789,
      ruleBoost: 0.2,
      eventArticleCount: 8,
      sourceCount: 3
    });
    const getterArticle = {
      id: 1,
      get: vi.fn().mockReturnValue({ id: 9, name: '  Major Climate Event Update  ' })
    };
    const plainArticle = {
      id: 2,
      event: { id: 9, name: 'Second event' }
    };
    const noEventArticle = { id: 3, eventId: null };

    debugRecommendedScores([
      { article: getterArticle, recommended: 0.98765 },
      { article: plainArticle, recommended: 0.4 },
      { article: noEventArticle, recommended: 0.1 }
    ]);

    expect(console.log).toHaveBeenCalledTimes(2);
    expect(console.log.mock.calls[0][0]).toContain('positiveInterest');
    expect(console.log.mock.calls[0][0]).not.toContain('feedTrustBoost');
    expect(console.log.mock.calls[1][0]).toContain('articlesWithEvents=2');
    expect(console.log.mock.calls[1][0]).toContain('events=1');
    expect(console.log.mock.calls[1][0]).toContain('eventCoverage=66.7%');
    expect(console.table).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        articleId: 1,
        eventName: 'major climate',
        freshness: 0.1235,
        recommended: 0.9877
      }),
      expect.objectContaining({ articleId: 3, eventName: '' })
    ]));
    expect(mocked.computeRecommendedBreakdown).toHaveBeenCalledWith(expect.any(Object));
  });

  // Handles an empty ranking result without dividing by zero.
  it('logs zero event coverage for an empty result', () => {
    process.env.NODE_ENV = 'development';

    debugRecommendedScores([]);

    expect(console.log.mock.calls[1][0]).toContain('eventCoverage=0%');
    expect(console.table).toHaveBeenCalledWith([]);
  });
});
