import { afterEach, describe, expect, it, vi } from 'vitest';

import db from '../../models/index.js';
import {
  getCrawlStatistics,
  getIslandsOverview,
  getOfficialSources,
  getSettings,
  getTopicsOverview,
  setIncludeDevelopingEvents,
  setOfficialSources,
  setSettings,
  setStartupViewMode,
  setThemeMode
} from '../../controllers/setting.js';

const { CrawlRun, OfficialSource, Setting } = db;

// Creates a chainable response recorder for direct controller tests.
function responseRecorder() {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('settings controller branch behavior', () => {
  // Restores model methods and console output after each direct controller scenario.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Enforces user ownership in every exported settings read and mutation handler.
  it.each([
    [getOfficialSources, {}],
    [getCrawlStatistics, { query: {} }],
    [setOfficialSources, { body: {} }],
    [getSettings, {}],
    [setSettings, { body: {} }],
    [setIncludeDevelopingEvents, { body: {} }],
    [setThemeMode, { body: {} }],
    [setStartupViewMode, { body: {} }],
    [getIslandsOverview, {}],
    [getTopicsOverview, {}]
  ])('rejects missing user ownership for handler %#', async (handler, request) => {
    const res = responseRecorder();

    await handler({ userData: {}, ...request }, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: missing userId' });
  });

  // Returns official-source rows and converts model failures into a stable server response.
  it('handles official-source reads and failures', async () => {
    const rows = [{ id: 1, entity: 'Example', domain: 'example.com' }];
    vi.spyOn(OfficialSource, 'findAll')
      .mockResolvedValueOnce(rows)
      .mockRejectedValueOnce(new Error('read failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const success = responseRecorder();
    const failure = responseRecorder();

    await getOfficialSources({ userData: { userId: 7 } }, success);
    await getOfficialSources({ userData: { userId: 7 } }, failure);

    expect(success.status).toHaveBeenCalledWith(200);
    expect(success.json).toHaveBeenCalledWith({ total: 1, officialSources: rows });
    expect(failure.status).toHaveBeenCalledWith(500);
    expect(failure.json).toHaveBeenCalledWith({ error: 'read failed' });
  });

  // Applies the default crawl range and normalizes nullable aggregate values.
  it('returns default-range crawl statistics with numeric zero fallbacks', async () => {
    vi.spyOn(CrawlRun, 'findAll').mockResolvedValue([{
      date: '2026-07-31',
      newArticles: null,
      updatedArticles: '',
      completedCrawls: undefined,
      failedCrawls: 0
    }]);
    const res = responseRecorder();

    await getCrawlStatistics({ userData: { userId: 7 }, query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      days: 30,
      crawlStatistics: [{
        date: '2026-07-31',
        newArticles: 0,
        updatedArticles: 0,
        completedCrawls: 0,
        failedCrawls: 0
      }]
    });
  });

  // Converts crawl-statistics query failures into a stable server response.
  it('handles crawl-statistics query failures', async () => {
    vi.spyOn(CrawlRun, 'findAll').mockRejectedValue(new Error('statistics failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = responseRecorder();

    await getCrawlStatistics({ userData: { userId: 7 }, query: { days: '1' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'statistics failed' });
  });

  // Rejects incomplete source rows before replacing any user-owned configuration.
  it.each([
    { entity: 'Example', domain: '' },
    { entity: '', domain: 'example.com' }
  ])('rejects incomplete official source %#', async officialSource => {
    const destroySpy = vi.spyOn(OfficialSource, 'destroy');
    const res = responseRecorder();

    await setOfficialSources({
      userData: { userId: 7 },
      body: { officialSources: [officialSource] }
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(destroySpy).not.toHaveBeenCalled();
  });

  // Normalizes, deduplicates, and saves valid official-source domains transactionally.
  it('replaces official sources with normalized unique domains', async () => {
    const saved = [{ entity: 'Second', domain: 'example.com', enabled: false }];
    vi.spyOn(db.sequelize, 'transaction').mockImplementation(async operation => operation('tx'));
    const destroySpy = vi.spyOn(OfficialSource, 'destroy').mockResolvedValue(1);
    const createSpy = vi.spyOn(OfficialSource, 'bulkCreate').mockResolvedValue(saved);
    vi.spyOn(OfficialSource, 'findAll').mockResolvedValue(saved);
    const res = responseRecorder();

    await setOfficialSources({
      userData: { userId: 7 },
      body: {
        officialSources: [
          null,
          { entity: 'First', domain: '*.WWW.Example.com/path' },
          { entity: 'Second', domain: 'https://www.example.com/other', enabled: false }
        ]
      }
    }, res);

    expect(destroySpy).toHaveBeenCalledWith({ where: { userId: 7 }, transaction: 'tx' });
    expect(createSpy).toHaveBeenCalledWith([{
      userId: 7,
      entity: 'Second',
      domain: 'example.com',
      enabled: false
    }], { transaction: 'tx' });
    expect(res.json).toHaveBeenCalledWith({ total: 1, officialSources: saved });
  });

  // Clears official sources without issuing an empty bulk insert.
  it('clears official sources from a non-array payload', async () => {
    vi.spyOn(db.sequelize, 'transaction').mockImplementation(async operation => operation('tx'));
    const destroySpy = vi.spyOn(OfficialSource, 'destroy').mockResolvedValue(1);
    const createSpy = vi.spyOn(OfficialSource, 'bulkCreate');
    vi.spyOn(OfficialSource, 'findAll').mockResolvedValue([]);
    const res = responseRecorder();

    await setOfficialSources({
      userData: { userId: 7 },
      body: { officialSources: 'invalid' }
    }, res);

    expect(destroySpy).toHaveBeenCalledOnce();
    expect(createSpy).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ total: 0, officialSources: [] });
  });

  // Validates theme vocabulary and covers both create and update persistence paths.
  it('validates, creates, and updates theme preferences', async () => {
    const invalid = responseRecorder();
    await setThemeMode({ userData: { userId: 7 }, body: { themeMode: 'blue' } }, invalid);
    expect(invalid.status).toHaveBeenCalledWith(400);

    const update = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(Setting, 'findOrCreate')
      .mockResolvedValueOnce([{ update }, true])
      .mockResolvedValueOnce([{ update }, false]);
    const created = responseRecorder();
    const updated = responseRecorder();

    await setThemeMode({ userData: { userId: 7 }, body: { themeMode: 'light' } }, created);
    await setThemeMode({ userData: { userId: 7 }, body: { themeMode: 'dark' } }, updated);

    expect(update).toHaveBeenCalledWith({ themeMode: 'dark' });
    expect(created.json).toHaveBeenCalledWith({ success: true, themeMode: 'light' });
    expect(updated.json).toHaveBeenCalledWith({ success: true, themeMode: 'dark' });
  });

  // Converts persistence failures from dedicated preference handlers into server errors.
  it.each([
    [setThemeMode, { themeMode: 'system' }],
    [setStartupViewMode, { startupViewMode: 'last-used' }]
  ])('handles preference persistence failure for handler %#', async (handler, body) => {
    vi.spyOn(Setting, 'findOrCreate').mockRejectedValue(new Error('write failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = responseRecorder();

    await handler({ userData: { userId: 7 }, body }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'write failed' });
  });
});
