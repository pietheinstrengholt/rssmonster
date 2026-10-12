import { describe, expect, it } from 'vitest';
import { canonicalArticleState, canonicalArticleExpression } from '../src/services/articleStateContract.js';
import { validateSearchQuery } from '../src/services/queryValidation.js';
import { parseSmartFolderQuery, buildSmartFolderQuery } from '../src/components/settings/smartFolders/smartFolderQuery.js';
import { smartFolderRulePreview } from '../src/services/currentViewSmartFolder.js';

describe('saved and opened-original compatibility', () => {
  it('normalizes legacy snapshots and settings without overriding canonical state', () => {
    expect(canonicalArticleState({ status: 'favorite', favoriteInd: 1, savedInd: 0, clickedAmount: 4, favoritedAt: '2026-09-01',
      favoriteCount: 5, actions: [{ kind: 'set-favorite', actionId: 'stable-id', value: true }] }))
      .toEqual({ status: 'saved', savedInd: 0, openedOriginalCount: 4, savedAt: '2026-09-01', savedCount: 5,
        actions: [{ kind: 'set-saved', actionId: 'stable-id', value: true }] });
  });
  it('keeps quoted phrases while canonicalizing aliases and validates either vocabulary', () => {
    const old = 'title:"favorite:true clicked:false" favorite:true star:false clicked:true';
    expect(canonicalArticleExpression(old)).toBe('title:"favorite:true clicked:false" saved:true saved:false openedOriginal:true');
    for (const query of [old, 'saved:true openedOriginal:true', 'OPENEDORIGINAL:false', 'clicked:false star:true']) expect(validateSearchQuery(query).valid).toBe(true);
  });
  it('reads legacy folders and writes canonical expressions with consistent chips', () => {
    const draft = parseSmartFolderQuery('favorite:true clicked:true');
    expect(draft.status).toMatchObject({ saved: true, openedOriginal: true });
    const query = buildSmartFolderQuery(draft);
    expect(query).toContain('saved:true openedOriginal:true');
    expect(query).not.toMatch(/favorite:|clicked:|star:/);
    expect(smartFolderRulePreview('saved:true openedOriginal:true').map(rule => rule.label)).toEqual(['Saved', 'Opened originals']);
  });
});

it('normalizes reading modes in restored browser settings and nested snapshots', () => {
  expect(canonicalArticleState({ viewMode: 'full', settings: { viewMode: 'minimal' }, content: 'full minimal' }))
    .toEqual({ viewMode: 'expanded', settings: { viewMode: 'headlines' }, content: 'full minimal' });
});
