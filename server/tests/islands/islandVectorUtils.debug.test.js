import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('ISLAND_DEBUG', 'true');

const { debugIsland } = await import('../../services/islands/islandVectorUtils.js');

describe('island vector diagnostics', () => {
  it('logs diagnostics with and without structured payloads', () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    debugIsland('plain diagnostic');
    debugIsland('structured diagnostic', { islandId: 7 });

    expect(consoleLog).toHaveBeenNthCalledWith(1, '[ISLAND DEBUG] plain diagnostic');
    expect(consoleLog).toHaveBeenNthCalledWith(
      2,
      '[ISLAND DEBUG] structured diagnostic',
      { islandId: 7 }
    );
  });
});
