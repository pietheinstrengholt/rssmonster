import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import { transformSubstackContent } from '../../services/crawl/compatibility/transformSubstackContent.js';

// This function loads HTML as a document so the transformer can replace its body.
function loadDocument(html) {
  return load(html);
}

describe('transformSubstackContent', () => {
  it('does nothing when Substack body markup is absent', () => {
    const $ = loadDocument('<header>Header</header><main><p>Article</p></main><footer>Footer</footer>');
    const original = $.html();

    transformSubstackContent($);

    expect($.html()).toBe(original);
  });

  it('does nothing when the combined visible text is below the threshold', () => {
    const $ = loadDocument(
      '<header>Header</header>' +
      '<div class="body markup"><p>Short article body.</p></div>' +
      '<footer>Footer</footer>'
    );
    const original = $.html();

    transformSubstackContent($);

    expect($.html()).toBe(original);
  });

  it('isolates multiple meaningful bodies while preserving their nodes and order', () => {
    const firstText = `First ${'article text '.repeat(15)}`;
    const secondText = `Second ${'article text '.repeat(15)}`;
    const $ = loadDocument(
      '<header><img src="https://example.com/logo.png"></header>' +
      '<div class="body markup"><p data-part="first">' + firstText + '</p>' +
      '<button type="button">Keep button</button></div>' +
      '<nav>Subscription navigation</nav>' +
      '<section class="body markup"><a class="share" href="/share">Share</a>' +
      '<img src="/article.jpg" data-original="yes"><p data-part="second">' + secondText + '</p></section>' +
      '<footer><a href="/unsubscribe">Unsubscribe</a></footer>'
    );

    transformSubstackContent($);

    expect($('body').children().toArray().map(el => el.name)).toEqual([
      'p',
      'button',
      'a',
      'img',
      'p'
    ]);
    expect($('body [data-part]').toArray().map(el => $(el).attr('data-part'))).toEqual([
      'first',
      'second'
    ]);
    expect($('button').text()).toBe('Keep button');
    expect($('a.share').attr('href')).toBe('/share');
    expect($('img').attr('src')).toBe('/article.jpg');
    expect($('img').attr('data-original')).toBe('yes');
    expect($('header, nav, footer, a[href="/unsubscribe"]')).toHaveLength(0);
  });

  it('is idempotent after isolating the article body', () => {
    const $ = loadDocument(
      '<header>Header</header><div class="body markup"><p>' +
      'Meaningful article content. '.repeat(20) +
      '</p></div><footer>Footer</footer>'
    );

    transformSubstackContent($);
    const firstTransformation = $.html();
    transformSubstackContent($);

    expect($.html()).toBe(firstTransformation);
  });
});
