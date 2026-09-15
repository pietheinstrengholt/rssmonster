import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { articleFeedVisibilityMethods, createArticleFeedVisibilityState, readingContentArea, resolveReadingIdleGraceMs } from '../src/components/articles/feed/visibilityTracking.js';
import ArticleFeed from '../src/components/articles/ArticleFeed.vue';

let context;
let now;
let visibility;
const bounds = (top, bottom) => ({ top, bottom, left: 0, right: 500, width: 500, height: bottom - top });
function article(id, top = 0, bottom = 700, readable = true) {
  const root = document.createElement('article');
  root.id = `article-${id}`;
  const content = document.createElement('div');
  if (readable) content.dataset.readingContent = '';
  content.textContent = 'Readable article text';
  let rect = bounds(top, bottom);
  content.getBoundingClientRect = () => rect;
  root.append(content);
  document.body.append(root);
  context.articles.push({ id });
  context.observedArticleElements.set(String(id), root);
  return { root, content, move: (top, bottom) => { rect = bounds(top, bottom); } };
}
function refreshAt(ms) { now = ms; context.refreshReadingTime(); }
function total(id) { context.pauseReadingTime(); return context.visibleDuration.get(id) || 0; }

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
  visibility = 'visible';
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  vi.stubGlobal('innerHeight', 800);
  context = { ...createArticleFeedVisibilityState(), articles: [], pendingSeenArticleIds: new Set(),
    selectionStore: { currentSelection: { viewMode: 'full', status: 'unread', grouping: 'event' } },
    getSelectedReadingArticleId: () => null, markArticleSeen: vi.fn().mockResolvedValue(true),
    readingTrackingStarted: true };
  for (const [name, method] of Object.entries(articleFeedVisibilityMethods)) context[name] = method.bind(context);
});
afterEach(() => {
  context.pauseReadingTime();
  document.body.replaceChildren();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('eligible reading time', () => {
  it.each(['minimal', 'reader', 'full'].flatMap(viewMode =>
    ['read', 'unread'].flatMap(status => [true, false].map(autoRead => ({ viewMode, status, autoRead })))
  ))('records stationary content independently of read state: %j', async ({ viewMode, status, autoRead }) => {
    article(1);
    context.articles[0].status = status;
    context.selectionStore.currentSelection.viewMode = viewMode;
    context.selectionStore.effectiveMarkAsReadOnScroll = autoRead;
    context.isReaderLayoutActive = viewMode === 'reader';
    context.getSelectedReadingArticleId = () => viewMode === 'full' ? null : 1;
    refreshAt(0);
    now = 60000;
    await context.finishReadingSession();
    expect(context.markArticleSeen).toHaveBeenLastCalledWith(1, 60,
      expect.objectContaining({ attentionOnly: true }));
    expect(context.articles[0].status).toBe(status);
  });

  it('persists exactly 40 seconds for 20 reading, 60 hidden and 20 reading', async () => {
    article(1);
    refreshAt(0);
    now = 20000;
    visibility = 'hidden';
    context.handleReadingVisibility();
    await context.seenPersistenceQueue;
    now = 80000;
    visibility = 'visible';
    context.handleReadingVisibility();
    now = 100000;
    await context.finishReadingSession();
    expect(context.markArticleSeen.mock.calls.map(call => call[1])).toEqual([20, 40]);
  });

  it('expires the inactivity timer while the document remains stationary', async () => {
    vi.spyOn(performance, 'now').mockRestore();
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    article(1);
    context.lastReadingActivityAt = performance.now();
    context.refreshReadingTime();
    await vi.advanceTimersByTimeAsync(180000);
    await context.seenPersistenceQueue;
    expect(context.visibleSince.size).toBe(0);
    expect(context.markArticleSeen).toHaveBeenLastCalledWith(1, 120,
      expect.objectContaining({ attentionOnly: true }));
  });

  it('requests only a state change when a passed article summary was already saved', async () => {
    article(1); refreshAt(0); now = 15000;
    context.pool = new Set(); context.seenPersistenceAttempts = new Map();
    context.selectionStore.effectiveMarkAsReadOnScroll = true;
    await context.finishReadingSession();
    await context.addToPool(1);
    expect(context.markArticleSeen).toHaveBeenLastCalledWith(1, 0,
      expect.objectContaining({ recordObservation: false, markAsReadOnScroll: true }));
  });
  it('does not invent exposure for an automatic read callback without an observation', async () => {
    context.pool = new Set(); context.seenPersistenceAttempts = new Map();
    await context.addToPool(1);
    expect(context.markArticleSeen).toHaveBeenCalledWith(1, 0,
      expect.objectContaining({ recordObservation: false }));
  });

  it('saves the old presentation before measuring different displayed text', async () => {
    const { content } = article(1);
    refreshAt(0); now = 20000;
    let render;
    context.$nextTick = callback => { render = callback; };
    context.scrollArticleListToTop = vi.fn();
    ArticleFeed.watch.articlePresentationSelectionKey.call(context);
    content.innerText = 'word '.repeat(100);
    render(); now = 40000;
    await context.finishReadingSession();
    expect(context.markArticleSeen.mock.calls.map(call => [call[1], call[2].readingWordCount])).toEqual([[20, 3], [20, 100]]);
  });

  it('sends the normalized rendered text length with the saved time', async () => {
    const { content } = article(1);
    content.innerHTML = '<p data-extra="attributes are not reading words">one</p><p>two three four five</p>';
    Object.defineProperty(content, 'innerText', { value: 'one\ntwo  three\u00a0four five' });
    refreshAt(0); now = 15000;
    await context.finishReadingSession();
    expect(context.markArticleSeen).toHaveBeenCalledWith(1, 15,
      expect.objectContaining({ readingWordCount: 5, attentionOnly: true }));
  });
  it('does not resend a successful summary with the same rounded seconds', async () => {
    article(1); refreshAt(0); now = 15100;
    await context.finishReadingSession();
    context.handleReadingActivity(); now = 15300;
    await context.finishReadingSession();
    expect(context.markArticleSeen).toHaveBeenCalledTimes(1);
  });
  it('retries the same captured summary with a bounded number of attempts', async () => {
    article(1); refreshAt(0); now = 15000;
    context.markArticleSeen.mockResolvedValue(false);
    const saving = context.finishReadingSession();
    await vi.advanceTimersByTimeAsync(600);
    await saving;
    expect(context.markArticleSeen).toHaveBeenCalledTimes(3);
    expect(context.markArticleSeen.mock.calls.every(call => call[1] === 15 && call[2].readingWordCount === 3)).toBe(true);
    expect(context.persistedVisibleDuration.has(1)).toBe(false);
  });

  it('records Minimal headline exposure once with zero reading seconds', async () => {
    const { root, content } = article(1, 0, 100, false);
    root.getBoundingClientRect = content.getBoundingClientRect;
    context.selectionStore.currentSelection.viewMode = 'minimal';
    refreshAt(0); await context.seenPersistenceQueue;
    refreshAt(10000); await context.finishReadingSession();
    expect(context.visibleDuration.get(1)).toBe(0);
    expect(context.markArticleSeen).toHaveBeenCalledExactlyOnceWith(1, 0,
      expect.objectContaining({ attentionOnly: true }));
  });
  it('waits for opened Minimal content to enter the viewport', () => {
    const a = article(1, 900, 1200);
    context.selectionStore.currentSelection.viewMode = 'minimal';
    context.getSelectedReadingArticleId = () => 1;
    refreshAt(0); refreshAt(10000);
    expect(context.visibleSince.size).toBe(0);
    a.move(100, 700); refreshAt(20000); now = 35000;
    expect(total(1)).toBe(15000);
  });
  it('does not time unselected content in Minimal or desktop Reader layouts', () => {
    article(1);
    context.selectionStore.currentSelection.viewMode = 'minimal';
    refreshAt(0); now = 10000;
    expect(total(1)).toBe(0);
    context.selectionStore.currentSelection.viewMode = 'reader';
    context.isReaderLayoutActive = true;
    refreshAt(10000); now = 20000;
    expect(total(1)).toBe(0);
  });
  it('does not record hidden exposure and captures it on return', async () => {
    const { root, content } = article(1, 0, 100, false);
    root.getBoundingClientRect = content.getBoundingClientRect;
    visibility = 'hidden'; refreshAt(0);
    expect(context.markArticleSeen).not.toHaveBeenCalled();
    visibility = 'visible'; context.handleReadingVisibility();
    await context.seenPersistenceQueue;
    expect(context.markArticleSeen).toHaveBeenCalledWith(1, 0, expect.objectContaining({ attentionOnly: true }));
  });
  it('preserves existing firstSeen without another exposure-only write', async () => {
    const { root, content } = article(1, 0, 100, false);
    root.getBoundingClientRect = content.getBoundingClientRect;
    context.articles[0].firstSeen = '2026-09-01T00:00:00Z';
    refreshAt(0); await context.finishReadingSession();
    expect(context.markArticleSeen).not.toHaveBeenCalled();
  });
  it('uses a shared reading line even when mobile cards individually clip content', () => {
    const a = article(1, 0, 200);
    const b = article(2, 250, 700);
    for (const { root, content } of [a, b]) {
      root.style.overflowY = 'hidden';
      root.getBoundingClientRect = content.getBoundingClientRect;
      expect(readingContentArea(content).line).toBe(320);
    }
    refreshAt(0);
    expect(context.activeReadingArticleId).toBe(2);
  });
  it('keeps the active Expanded article through small movements in a gap', () => {
    const a = article(1, 0, 270);
    const b = article(2, 370, 700);
    refreshAt(0); expect(context.activeReadingArticleId).toBe(1);
    for (const offset of [-5, 5, -6, 6, -4]) {
      a.move(offset, 270 + offset); b.move(370 + offset, 700 + offset);
      refreshAt(now + 1000); expect(context.activeReadingArticleId).toBe(1);
    }
    a.move(-40, 230); b.move(330, 660);
    refreshAt(now + 1000); expect(context.activeReadingArticleId).toBe(2);
  });
  it.each(['read', 'unread'])('saves %s article attention with automatic scroll marking disabled', async status => {
    const a = article(1); article(2, 900, 1500);
    context.articles[0].status = status;
    context.pool = new Set([1]);
    context.selectionStore.effectiveMarkAsReadOnScroll = false;
    refreshAt(0); a.move(-900, -200); refreshAt(30000);
    await context.seenPersistenceQueue;
    expect(context.markArticleSeen).toHaveBeenCalledWith(1, 30,
      expect.objectContaining({ attentionOnly: true }));
    expect(context.articles[0].status).toBe(status);
  });

  it('defaults to two minutes and accepts a positive configured grace period', () => {
    expect(resolveReadingIdleGraceMs('')).toBe(120000);
    expect(resolveReadingIdleGraceMs('-1')).toBe(120000);
    expect(resolveReadingIdleGraceMs('NaN')).toBe(120000);
    expect(resolveReadingIdleGraceMs('180')).toBe(180000);
  });
  it('counts stationary reading without requiring movement', () => {
    article(1); refreshAt(0); now = 90000;
    expect(total(1)).toBe(90000);
  });
  it('excludes hidden time and resumes with a fresh interval', async () => {
    article(1); refreshAt(0); now = 30000;
    visibility = 'hidden'; context.handleReadingVisibility();
    now = 330000; visibility = 'visible'; context.handleReadingVisibility();
    now = 350000;
    expect(total(1)).toBe(50000);
    await context.flushReadingTime();
    expect(context.markArticleSeen).toHaveBeenLastCalledWith(1, 50, expect.objectContaining({ attentionOnly: true }));
  });
  it('caps delayed timers at the idle deadline and never recovers the idle gap', () => {
    article(1); refreshAt(0); refreshAt(180000);
    expect(context.visibleDuration.get(1)).toBe(120000);
    context.handleReadingActivity(); now = 200000;
    expect(total(1)).toBe(140000);
  });
  it('continues through slow scrolling that renews the grace period', () => {
    article(1); refreshAt(0);
    for (const ms of [90000, 180000, 270000]) { now = ms; context.handleReadingActivity(); }
    now = 300000; expect(total(1)).toBe(300000);
  });
  it('attributes each interval to only one Expanded article and stays stable at boundaries', () => {
    const a = article(1, 0, 330); article(2, 330, 700);
    refreshAt(0); expect(context.activeReadingArticleId).toBe(1);
    a.move(0, 315); refreshAt(10000); expect(context.activeReadingArticleId).toBe(1);
    a.move(-200, 100); refreshAt(30000); expect(context.activeReadingArticleId).toBe(2);
    now = 60000; context.pauseReadingTime();
    expect(context.visibleDuration.get(1)).toBe(30000);
    expect(context.visibleDuration.get(2)).toBe(30000);
  });
  it('uses only the selected Reader article, including already-read content', () => {
    article(1); article(2);
    context.getSelectedReadingArticleId = () => 2;
    refreshAt(0); now = 30000;
    expect(total(2)).toBe(30000); expect(context.visibleDuration.has(1)).toBe(false);
  });
  it('does not time headline-only or offscreen content', () => {
    article(1, 0, 100, false); article(2, 900, 1200);
    refreshAt(0); now = 30000; context.pauseReadingTime();
    expect(context.visibleDuration.size).toBe(0);
  });
  it('clips content to the actual nested reading panel', () => {
    const { root, content, move } = article(1, 0, 200);
    root.style.overflowY = 'auto'; root.getBoundingClientRect = () => bounds(250, 700);
    expect(readingContentArea(content)).toBeNull();
    move(300, 600); expect(readingContentArea(content)).toMatchObject({ top: 300, bottom: 600 });
  });
  it('finalizes and snapshots all durations before a collection is cleared', async () => {
    article(1); refreshAt(0); now = 20000;
    context.visibleDuration.set(2, 10000);
    context.resetVisibilityTracking();
    await Promise.resolve(); await Promise.resolve();
    expect(context.markArticleSeen).toHaveBeenCalledWith(1, 20, expect.objectContaining({ attentionOnly: true }));
    expect(context.markArticleSeen).toHaveBeenCalledWith(2, 10, expect.objectContaining({ attentionOnly: true }));
    expect(context.visibleDuration.size).toBe(0);
  });
  it('saves navigation intervals once without requesting a read-state transition', async () => {
    article(1); refreshAt(0); now = 20000;
    await context.finishReadingSession(); await context.finishReadingSession();
    expect(context.markArticleSeen).toHaveBeenCalledTimes(1);
    expect(context.markArticleSeen).toHaveBeenCalledWith(1, 20, { attentionOnly: true, readingWordCount: 3,
      selection: { viewMode: 'full', status: 'unread', grouping: 'event' } });
  });
  it('renews grace on nested scrolling, keyboard and touch events', () => {
    context.$nextTick = callback => callback();
    context.observeArticles = vi.fn(); context.observeLoadMoreSentinel = vi.fn();
    context.setupObservers();
    const { content } = article(1); refreshAt(0);
    for (const type of ['scroll', 'keydown', 'touchstart', 'touchmove']) {
      now += 90000;
      content.dispatchEvent(new Event(type, { bubbles: type !== 'scroll' }));
      expect(context.lastReadingActivityAt).toBe(now);
    }
    expect(total(1)).toBe(360000);
    context.teardownObservers();
  });
  it('finalizes before navigation and resumes only after the new layout is available', async () => {
    article(1); article(2);
    let selected = 1;
    context.getSelectedReadingArticleId = () => selected;
    let render;
    context.$nextTick = callback => { render = callback; };
    context.observeArticles = vi.fn();
    refreshAt(0); now = 20000;
    ArticleFeed.methods.handleReadingArticleChange.call(context);
    expect(context.visibleDuration.get(1)).toBe(20000);
    expect(context.visibleSince.size).toBe(0);
    selected = 2; now = 25000; render(); now = 35000;
    expect(total(2)).toBe(10000);
    await context.seenPersistenceQueue;
  });
  it('snapshots collection duration even while an earlier save is pending', async () => {
    article(1); refreshAt(0); now = 10000;
    let resolveSave;
    context.markArticleSeen.mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve; }));
    const first = context.finishReadingSession();
    context.handleReadingActivity(); now = 20000;
    context.resetVisibilityTracking();
    const second = context.seenPersistenceQueue;
    resolveSave(true); await first; await second;
    expect(context.markArticleSeen.mock.calls.map(call => call[1])).toEqual([10, 20]);
    expect(context.persistedVisibleDuration.size).toBe(0);
  });
  it('removes timers and listeners on unmount', () => {
    context.$nextTick = callback => callback();
    context.observeArticles = vi.fn(); context.observeLoadMoreSentinel = vi.fn();
    context.setupObservers();
    article(1); refreshAt(0); now = 10000;
    ArticleFeed.beforeUnmount.call(context);
    expect(context.readingTimer).toBeNull();
    const activity = context.lastReadingActivityAt;
    now = 30000; document.dispatchEvent(new Event('keydown'));
    expect(context.lastReadingActivityAt).toBe(activity);
    expect(context.visibleDuration.get(1)).toBe(10000);
  });
});
