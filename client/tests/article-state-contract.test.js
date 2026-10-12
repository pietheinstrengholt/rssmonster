import { describe, expect, it } from 'vitest';
import { validateSearchQuery } from '../src/services/queryValidation.js';
import { parseSmartFolderQuery, buildSmartFolderQuery } from '../src/components/settings/smartFolders/smartFolderQuery.js';
import { smartFolderRulePreview } from '../src/services/currentViewSmartFolder.js';

describe('canonical article search contracts', () => {
  it.each(['saved:true openedOriginal:true', 'OPENEDORIGINAL:false', 'saved:false'])('accepts %s', query => {
    expect(validateSearchQuery(query).valid).toBe(true);
  });
  it.each(['favorite:true', 'star:false', 'clicked:true'])('rejects obsolete operator %s', query => {
    expect(validateSearchQuery(query).valid).toBe(false);
  });
  it('preserves quoted text and writes canonical expressions and preview chips', () => {
    const query = 'title:"favorite:true clicked:false" saved:true openedOriginal:true';
    const draft = parseSmartFolderQuery(query);
    expect(draft.status).toMatchObject({ saved: true, openedOriginal: true });
    const written = buildSmartFolderQuery(draft);
    expect(written).toContain('saved:true openedOriginal:true');
    expect(written).toContain('title:"favorite:true clicked:false"');
    expect(smartFolderRulePreview('saved:true openedOriginal:true').map(rule => rule.label)).toEqual(['Saved', 'Opened originals']);
  });
});
