import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  debugSemanticLog,
  isSemanticDebugEnabled
} from '../../services/observability/semanticLogging.js';

describe('semantic debug logging', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('reuses existing component debug switches without logging by default', () => {
    expect(isSemanticDebugEnabled('event', {})).toBe(false);
    expect(isSemanticDebugEnabled('topic', { TOPIC_DEBUG: 'true' })).toBe(true);
    expect(isSemanticDebugEnabled('topic', { EVENT_DEBUG: '1' })).toBe(true);
    expect(isSemanticDebugEnabled('island', { ISLAND_DEBUG: 'yes' })).toBe(true);
  });

  it('keeps detailed semantic diagnostics available only in debug mode', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    debugSemanticLog('event', '[EVENT] hidden detail');
    expect(log).not.toHaveBeenCalled();

    vi.stubEnv('EVENT_DEBUG', 'true');
    debugSemanticLog('event', '[EVENT] visible detail');
    expect(log).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith('[EVENT] visible detail');
  });
});
