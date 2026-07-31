import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  categoryFindAll: vi.fn(),
  importOpmlSubscriptions: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Category: {
      findAll: mocked.categoryFindAll
    },
    Feed: {}
  }
}));

vi.mock('../../services/feeds/opmlImport.js', () => {
  // Identifies invalid import inputs for controller status mapping.
  class OpmlImportError extends Error {}

  return {
    OpmlImportError,
    importOpmlSubscriptions: mocked.importOpmlSubscriptions
  };
});

const {
  OpmlImportError
} = await import('../../services/feeds/opmlImport.js');
const {
  exportOpml,
  generateOpml,
  importOpml
} = await import('../../controllers/opml.js');

// Builds an authenticated OPML request with optional upload overrides.
const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  ...overrides
});

// Builds the response methods used by OPML upload and download handlers.
const createResponse = () => {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
    send: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe('OPML controller', () => {
  beforeEach(() => {
    mocked.categoryFindAll.mockReset();
    mocked.importOpmlSubscriptions.mockReset();
  });

  it('generates escaped OPML with categories and optional feed descriptions', async () => {
    mocked.categoryFindAll.mockResolvedValue([
      {
        name: 'News & Analysis',
        feeds: [
          {
            feedName: 'Security <Daily>',
            feedDesc: 'Threats "and" fixes',
            url: 'https://example.com/feed?a=1&b=2'
          },
          {
            feedName: 'Empty description',
            feedDesc: '',
            url: 'https://example.com/other'
          }
        ]
      },
      {
        name: 'No feeds',
        feeds: []
      }
    ]);

    const opml = await generateOpml(42);

    expect(mocked.categoryFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 42 } })
    );
    expect(opml).toContain('News &amp; Analysis');
    expect(opml).toContain('Security &lt;Daily&gt;');
    expect(opml).toContain('Threats &quot;and&quot; fixes');
    expect(opml).toContain('feed?a=1&amp;b=2');
    expect(opml).toContain('text="No feeds"');
  });

  it('exports OPML as a timestamped XML attachment', async () => {
    mocked.categoryFindAll.mockResolvedValue([]);
    const res = createResponse();

    await exportOpml(createRequest(), res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/xml; charset=utf-8'
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/^attachment; filename="rssmonster-export-\d+\.opml"$/)
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<opml version="2.0">')
    );
  });

  it('rejects OPML export and import without a user ID', async () => {
    const exportRes = createResponse();
    const importRes = createResponse();
    const req = createRequest({ userData: {} });

    await exportOpml(req, exportRes);
    await importOpml(req, importRes);

    expect(exportRes.status).toHaveBeenCalledWith(401);
    expect(importRes.status).toHaveBeenCalledWith(401);
    expect(mocked.categoryFindAll).not.toHaveBeenCalled();
    expect(mocked.importOpmlSubscriptions).not.toHaveBeenCalled();
  });

  it('requires an uploaded OPML buffer', async () => {
    const res = createResponse();

    await importOpml(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'No OPML file provided'
    });
  });

  it('returns the import summary produced by the subscription service', async () => {
    const result = {
      feedsCreated: 2,
      feedsExisting: 1,
      feedsFailed: 0
    };
    mocked.importOpmlSubscriptions.mockResolvedValue(result);
    const buffer = Buffer.from('<opml />');
    const res = createResponse();

    await importOpml(createRequest({ file: { buffer } }), res);

    expect(mocked.importOpmlSubscriptions).toHaveBeenCalledWith({
      userId: 42,
      content: buffer
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: 'OPML import completed',
      ...result
    });
  });

  it('maps invalid OPML to a client error', async () => {
    mocked.importOpmlSubscriptions.mockRejectedValue(
      new OpmlImportError('Invalid OPML format')
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await importOpml(
      createRequest({ file: { buffer: Buffer.from('invalid') } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid OPML format'
    });
  });

  it('does not expose unexpected OPML service errors', async () => {
    mocked.importOpmlSubscriptions.mockRejectedValue(
      new Error('database details')
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createResponse();

    await importOpml(
      createRequest({ file: { buffer: Buffer.from('valid') } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'OPML import failed' });
  });
});
