import { load } from 'cheerio';
import { describe, expect, it } from 'vitest';

import processHtmlContent from '../../services/crawl/content/processHtmlContent.js';
import {
  transformWordPressContent,
  transformWordPressSourceContent
} from '../../services/crawl/content/compatibility/transformWordPressContent.js';
import { hashOriginalContent } from '../../utils/articleContentHashes.js';

// This function applies the WordPress DOM stage to an HTML fragment.
function transformDom(html) {
  const $ = load(html, { xml: { xmlMode: false } }, false);
  transformWordPressContent($);
  return $;
}

// This function parses source-stage output as an HTML fragment.
function transformedSourceFragment(html) {
  return load(transformWordPressSourceContent(html), { xml: { xmlMode: false } }, false);
}

describe('WordPress embed shortcodes', () => {
  it('converts a valid youtu.be URL into a fallback link', () => {
    const transformed = transformWordPressSourceContent(
      '[embed]https://youtu.be/pvE2gyWnVHA[/embed]'
    );

    expect(transformed).toBe(
      '<figure class="embed embed-youtube">' +
      '<a href="https://youtu.be/pvE2gyWnVHA">Watch on YouTube</a></figure>'
    );
  });

  it('converts a valid YouTube watch URL into a fallback link', () => {
    const transformed = transformWordPressSourceContent(
      '[embed]https://www.youtube.com/watch?v=pvE2gyWnVHA&amp;t=10[/embed]'
    );

    expect(transformed).toContain('href="https://youtu.be/pvE2gyWnVHA"');
  });

  it('preserves a malformed YouTube video ID unchanged', () => {
    const source = '[embed]https://youtu.be/too-short[/embed]';

    expect(transformWordPressSourceContent(source)).toBe(source);
  });

  it('preserves an unsupported provider unchanged', () => {
    const source = '[embed]https://vimeo.com/123456789[/embed]';

    expect(transformWordPressSourceContent(source)).toBe(source);
  });

  it('preserves an embed shortcode without a closing marker', () => {
    const source = '[embed]https://youtu.be/pvE2gyWnVHA';

    expect(transformWordPressSourceContent(source)).toBe(source);
  });

  it('is idempotent after converting an embed shortcode', () => {
    const transformed = transformWordPressSourceContent(
      '[embed]https://youtube.com/watch?v=pvE2gyWnVHA[/embed]'
    );

    expect(transformWordPressSourceContent(transformed)).toBe(transformed);
  });
});

describe('WordPress caption shortcodes', () => {
  it('converts an image and plain-text caption into semantic markup', () => {
    const $ = transformedSourceFragment(
      '[caption]<img src="https://example.com/image.jpg" alt="Example" data-size="large">' +
      'A useful caption[/caption]'
    );

    expect($('figure.wp-caption')).toHaveLength(1);
    expect($('figure > img').attr('src')).toBe('https://example.com/image.jpg');
    expect($('figure > img').attr('alt')).toBe('Example');
    expect($('figure > img').attr('data-size')).toBe('large');
    expect($('figure > figcaption').text()).toBe('A useful caption');
  });

  it('preserves valid inline caption markup', () => {
    const $ = transformedSourceFragment(
      '[caption]<img src="image.jpg"><em>A <strong>useful</strong> caption</em>[/caption]'
    );

    expect($('figcaption').html()).toBe('<em>A <strong>useful</strong> caption</em>');
  });

  it('preserves only a safe shortcode id and discards presentation attributes', () => {
    const $ = transformedSourceFragment(
      '[caption id="attachment_123" align="alignright" width="800" style="color:red"]' +
      '<img src="image.jpg">Caption[/caption]'
    );
    const figure = $('figure.wp-caption');

    expect(figure.attr('id')).toBe('attachment_123');
    expect(figure.attr('class')).toBe('wp-caption');
    expect(figure.attr('align')).toBeUndefined();
    expect(figure.attr('width')).toBeUndefined();
    expect(figure.attr('style')).toBeUndefined();
  });

  it('does not preserve an unsafe shortcode id', () => {
    const $ = transformedSourceFragment(
      '[caption id="attachment 123<script>"]<img src="image.jpg">Caption[/caption]'
    );

    expect($('figure.wp-caption').attr('id')).toBeUndefined();
  });

  it('does not create an empty figcaption', () => {
    const $ = transformedSourceFragment(
      '[caption align="alignnone"] <img src="image.jpg"> \n [/caption]'
    );

    expect($('figure.wp-caption')).toHaveLength(1);
    expect($('figcaption')).toHaveLength(0);
  });

  it('unwraps a caption shortcode without an image and preserves its text', () => {
    const source = '[caption width="800"]Caption text without media[/caption]';

    expect(transformWordPressSourceContent(source)).toBe('Caption text without media');
  });

  it('unwraps a malformed caption marker without deleting its content', () => {
    const source = '[caption id="attachment_123"]<img src="image.jpg">Caption without close';
    const transformed = transformWordPressSourceContent(source);

    expect(transformed).toBe('<img src="image.jpg">Caption without close');
  });

  it('converts multiple independent caption blocks in order', () => {
    const $ = transformedSourceFragment(
      '[caption]<img src="first.jpg">First caption[/caption]' +
      '<p>Between</p>' +
      '[caption]<img src="second.jpg">Second caption[/caption]'
    );

    expect($('figure').toArray().map(el => $(el).find('img').attr('src'))).toEqual([
      'first.jpg',
      'second.jpg'
    ]);
    expect($('figcaption').toArray().map(el => $(el).text())).toEqual([
      'First caption',
      'Second caption'
    ]);
  });

  it('leaves existing figure markup unchanged', () => {
    const source = '<figure class="wp-caption"><img src="image.jpg">' +
      '<figcaption>Existing caption</figcaption></figure>';

    expect(transformWordPressSourceContent(source)).toBe(source);
  });

  it('is idempotent after converting a caption shortcode', () => {
    const transformed = transformWordPressSourceContent(
      '[caption id="attachment_123"]<a href="full.jpg"><img src="image.jpg"></a>' +
      'Caption[/caption]'
    );

    expect(transformWordPressSourceContent(transformed)).toBe(transformed);
  });
});

describe('WordPress smiley images', () => {
  it('converts a Unicode emoji alt value into text', () => {
    const $ = transformDom('<p>Hello <img class="wp-smiley" alt="🙂" src="smile.png">!</p>');

    expect($('p').text()).toBe('Hello 🙂!');
    expect($('img')).toHaveLength(0);
  });

  it('converts a multi-codepoint emoji alt value into text', () => {
    const $ = transformDom('<p>Love <img class="wp-smiley" alt="❤️" src="heart.png">.</p>');

    expect($('p').text()).toBe('Love ❤️.');
    expect($('img')).toHaveLength(0);
  });

  it('leaves ASCII descriptive alt text unchanged', () => {
    const $ = transformDom('<img class="wp-smiley" alt="smiling face" src="smile.png">');

    expect($('img.wp-smiley')).toHaveLength(1);
  });

  it('leaves an empty alt value unchanged', () => {
    const $ = transformDom('<img class="wp-smiley" alt="" src="smile.png">');

    expect($('img.wp-smiley')).toHaveLength(1);
  });

  it('recognizes wp-smiley combined with additional classes', () => {
    const $ = transformDom(
      '<p><img class="emoji wp-smiley inline" alt="🙂" src="smile.png"></p>'
    );

    expect($('p').text()).toBe('🙂');
    expect($('img')).toHaveLength(0);
  });

  it('is idempotent after replacing a smiley image', () => {
    const $ = transformDom('<p><img class="wp-smiley" alt="🙂" src="smile.png"></p>');
    const transformed = $.html();

    transformWordPressContent($);

    expect($.html()).toBe(transformed);
  });
});

describe('WordPress responsive image source repair', () => {
  it('repairs encoded width candidates and an encoded separator', () => {
    const $ = transformDom(
      '<img src="https://example.com/image.jpg%201024w%2C%20' +
      'https://example.com/image-large.jpg%202048w">'
    );

    expect($('img').attr('src')).toBe('https://example.com/image.jpg');
  });

  it('repairs literal width candidates', () => {
    const $ = transformDom('<img src="image.jpg 1024w, image-large.jpg 2048w">');

    expect($('img').attr('src')).toBe('image.jpg');
  });

  it('repairs encoded density candidates', () => {
    const $ = transformDom('<img src="image.jpg%202x,%20image-large.jpg%203x">');

    expect($('img').attr('src')).toBe('image.jpg');
  });

  it('preserves a relative first candidate URL', () => {
    const $ = transformDom('<img src="../image.jpg%201024w,%20../image-large.jpg%202048w">');

    expect($('img').attr('src')).toBe('../image.jpg');
  });

  it('preserves a protocol-relative first candidate URL', () => {
    const $ = transformDom(
      '<img src="//cdn.example/image.jpg%201024w,%20//cdn.example/image-large.jpg%202048w">'
    );

    expect($('img').attr('src')).toBe('//cdn.example/image.jpg');
  });

  it('does not modify an ordinary URL containing an encoded space', () => {
    const source = 'https://example.com/my%20image.jpg';
    const $ = transformDom(`<img src="${source}">`);

    expect($('img').attr('src')).toBe(source);
  });

  it('selects the first valid candidate after an invalid candidate', () => {
    const $ = transformDom(
      '<img src="javascript:alert(1)%201024w,%20/images/good.jpg%202048w">'
    );

    expect($('img').attr('src')).toBe('/images/good.jpg');
  });

  it('leaves a candidate list unchanged when every URL uses a dangerous scheme', () => {
    const source = 'javascript:alert(1)%201024w,%20data:text/html%202048w';
    const $ = transformDom(`<img src="${source}">`);

    expect($('img').attr('src')).toBe(source);
  });

  it('leaves a malformed candidate list unchanged', () => {
    const source = 'image.jpg%201024w,%20image-large.jpg';
    const $ = transformDom(`<img src="${source}">`);

    expect($('img').attr('src')).toBe(source);
  });

  it('is idempotent after repairing an image source', () => {
    const $ = transformDom('<img src="image.jpg%201024w,%20image-large.jpg%202048w">');
    const transformed = $.html();

    transformWordPressContent($);

    expect($.html()).toBe(transformed);
  });
});

describe('WordPress processing integration', () => {
  it('preserves raw original content while transforming and sanitizing derived content', () => {
    const html = '<p>Intro text with enough words for processing.</p>' +
      '[caption id="attachment_1" align="aligncenter" width="640"]' +
      '<img src="https://example.com/image.jpg%201024w,%20' +
      'https://example.com/image-large.jpg%202048w" alt="Example">' +
      'A useful <em>image caption</em>.[/caption]' +
      '<p>Done <img class="wp-smiley" alt="🙂" src="https://example.com/smile.png"></p>' +
      '[embed]https://youtu.be/pvE2gyWnVHA[/embed]';
    const result = processHtmlContent(
      html,
      null,
      'https://example.com/article',
      { id: 1, userId: 1, feedName: 'Example Feed' },
      'Example title'
    );

    expect(result.content).toBe(html);
    expect(result.contentSourceHash).toBe(hashOriginalContent(html));
    expect(result.html).not.toMatch(/\[(?:\/?caption|\/?embed)\b/i);
    expect(result.html).toContain('<figure>');
    expect(result.html).toContain('<figcaption>A useful <em>image caption</em>.</figcaption>');
    expect(result.html).toContain('src="https://example.com/image.jpg"');
    expect(result.html).toContain('Done 🙂');
    expect(result.html).toContain('Watch on YouTube');
  });
});
