import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Article from '../src/components/articles/Article.vue';
import { createFocusedStores } from './helpers/focusedStores.js';
import { getRenderedArticleText } from '../src/services/articleContentService.js';

let wrappers, synthesis;
const article = {
  id: 42, title: 'Do not speak the article title', feed: { feedName: 'Do not speak this source' },
  author: 'Do not speak the author', content: '<h2>Body heading</h2><p>Clean <strong>article</strong> text.</p>',
  language: 'nl', status: 'unread', url: 'https://example.com/article'
};
const render = (props = {}, mode = 'reader') => {
  const stores = createFocusedStores({ selection: { currentSelection: { viewMode: mode, grouping: 'none' } } });
  const wrapper = mount(Article, { attachTo: document.body, props: { ...article, readerDetail: true, readerToolbar: true, ...props }, global: { plugins: [stores.pinia] } });
  wrappers.push(wrapper);
  return { wrapper, stores };
};
const listen = wrapper => wrapper.find('button[aria-label="Listen to article"]');
const utterance = () => synthesis.speak.mock.calls.at(-1)[0];

beforeEach(() => {
  wrappers = [];
  synthesis = {
    paused: false,
    cancel: vi.fn(), speak: vi.fn(),
    pause: vi.fn(() => { synthesis.paused = true; }),
    resume: vi.fn(() => { synthesis.paused = false; })
  };
  vi.stubGlobal('speechSynthesis', synthesis);
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text; } });
});
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Reader article speech', () => {
  it('starts, pauses and resumes the same cleaned article utterance', async () => {
    const { wrapper } = render();
    expect(listen(wrapper).attributes()).toMatchObject({ title: 'Listen to article', 'aria-pressed': 'false' });
    await listen(wrapper).trigger('click');
    expect(utterance().text).toBe('Body heading Clean article text.');
    expect(utterance().lang).toBe('nl');
    expect(listen(wrapper).attributes('aria-pressed')).toBe('true');
    await listen(wrapper).trigger('click');
    expect(synthesis.pause).toHaveBeenCalledOnce();
    expect(listen(wrapper).attributes('aria-description')).toContain('Paused');
    expect(listen(wrapper).attributes('aria-pressed')).toBe('false');
    await listen(wrapper).trigger('click');
    expect(synthesis.resume).toHaveBeenCalledOnce();
    expect(listen(wrapper).attributes('aria-pressed')).toBe('true');
    expect(synthesis.speak).toHaveBeenCalledOnce();
  });

  it.each(['full', 'summarized', 'summaryBullets', 'minimal'])('hides listening outside Reader mode: %s', mode => {
    const { wrapper } = render({}, mode);
    expect(listen(wrapper).exists()).toBe(false);
  });

  it.each([{ readerDetail: false }, { readerToolbar: false }])('hides listening outside the selected Reader detail: %s', props => {
    const { wrapper } = render(props);
    expect(listen(wrapper).exists()).toBe(false);
  });

  it.each(['speechSynthesis', 'SpeechSynthesisUtterance'])('hides listening when %s is unavailable', missing => {
    vi.stubGlobal(missing, undefined);
    const { wrapper } = render();
    expect(listen(wrapper).exists()).toBe(false);
  });

  it('cancels when opening another article and ignores late events from the previous one', async () => {
    const { wrapper } = render();
    await listen(wrapper).trigger('click'); const previous = utterance();
    synthesis.cancel.mockClear();
    await wrapper.setProps({ id: 43, content: '<p>New article body.</p>' });
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(listen(wrapper).attributes('aria-pressed')).toBe('false');
    await listen(wrapper).trigger('click');
    previous.onend();
    await flushPromises();
    expect(utterance().text).toBe('New article body.');
    expect(listen(wrapper).attributes('aria-pressed')).toBe('true');
  });

  it('cancels paused playback when leaving Reader mode', async () => {
    const { wrapper, stores } = render();
    await listen(wrapper).trigger('click'); await listen(wrapper).trigger('click');
    synthesis.cancel.mockClear();
    stores.selectionStore.currentSelection.viewMode = 'full';
    await flushPromises();
    expect(synthesis.cancel).toHaveBeenCalledOnce();
    expect(listen(wrapper).exists()).toBe(false);
  });

  it('cancels when the Reader component unmounts', async () => {
    const { wrapper } = render(); await listen(wrapper).trigger('click');
    synthesis.cancel.mockClear(); wrapper.unmount(); wrappers = [];
    expect(synthesis.cancel).toHaveBeenCalledOnce();
  });

  it('replaces another active reader and does not let its unmount stop the new reader', async () => {
    const first = render().wrapper; const second = render({ id: 43 }).wrapper;
    await listen(first).trigger('click'); await listen(second).trigger('click');
    expect(synthesis.speak).toHaveBeenCalledTimes(2);
    expect(listen(first).attributes('aria-pressed')).toBe('false');
    expect(listen(second).attributes('aria-pressed')).toBe('true');
    synthesis.cancel.mockClear(); first.unmount(); wrappers = [second];
    expect(synthesis.cancel).not.toHaveBeenCalled();
  });

  it('starts a new article after cancelling a paused utterance', async () => {
    const { wrapper } = render();
    await listen(wrapper).trigger('click'); await listen(wrapper).trigger('click');
    await wrapper.setProps({ id: 43 }); await listen(wrapper).trigger('click');
    expect(synthesis.resume).toHaveBeenCalledOnce();
    expect(synthesis.paused).toBe(false);
  });

  it.each(['onend', 'onerror'])('returns to idle on %s and can start again', async event => {
    const { wrapper } = render(); await listen(wrapper).trigger('click');
    utterance()[event](); await flushPromises();
    expect(listen(wrapper).attributes('aria-pressed')).toBe('false');
    await listen(wrapper).trigger('click'); expect(synthesis.speak).toHaveBeenCalledTimes(2);
  });

  it('handles a synthesis failure without leaving the active state stuck', async () => {
    synthesis.speak.mockImplementation(() => { throw new Error('Unavailable voice'); });
    const { wrapper } = render(); await listen(wrapper).trigger('click');
    expect(listen(wrapper).attributes('aria-pressed')).toBe('false');
  });

  it('does not speak when the rendered body has no readable text', async () => {
    const { wrapper } = render({ content: '<p hidden>Hidden text.</p><img src="https://example.com/image.png">' });
    await listen(wrapper).trigger('click');
    expect(synthesis.speak).not.toHaveBeenCalled();
  });
});

describe('Rendered article speech text', () => {
  it('excludes hidden, interactive, navigation and ad subtrees while retaining inline and block boundaries', () => {
    const root = document.createElement('div');
    root.innerHTML = `<p>First <a href="https://example.com">linked</a> sentence.</p><p>Second<br>line.</p>
      <div hidden>Hidden attribute</div><div aria-hidden="true">ARIA hidden</div><div inert>Inert text</div>
      <div style="display:none">Not displayed</div><div style="visibility:hidden">Invisible</div><div style="opacity:0">Transparent</div>
      <style>.speech-hidden { display:none; }</style><div class="speech-hidden">Hidden by CSS</div>
      <nav>Navigation</nav><button>Button label</button><form>Form label</form><script>Script contents</script>
      <aside class="advertisement">Advertisement</aside><div class="advertisements">Ads</div><div id="advertisement">Another ad</div>
      <div class="social-share">Share controls</div><details><summary>Closed summary</summary>Hidden details</details>
      <details open><summary>Open summary</summary><p>Visible details.</p></details>`;
    document.body.append(root);
    expect(getRenderedArticleText(root)).toBe('First linked sentence. Second line. Closed summary Open summary Visible details.');
    root.remove();
  });

  it('excludes a body hidden by an ancestor', () => {
    const parent = document.createElement('div'); parent.hidden = true;
    const root = document.createElement('p'); root.textContent = 'Hidden article'; parent.append(root); document.body.append(parent);
    expect(getRenderedArticleText(root)).toBe(''); parent.remove();
  });
});
