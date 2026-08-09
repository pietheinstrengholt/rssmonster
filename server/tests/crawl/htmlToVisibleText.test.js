import { describe, expect, it } from 'vitest';

import htmlToVisibleText from '../../services/crawl/content/htmlToVisibleText.js';

describe('htmlToVisibleText', () => {
  it('preserves paragraph and heading boundaries', () => {
    expect(htmlToVisibleText(
      '<h1>Heading <em>text</em></h1><p>Hello</p><p>world</p>'
    )).toBe('Heading text\n\nHello\n\nworld');
  });

  it('preserves list, line-break, and table structure', () => {
    expect(htmlToVisibleText(
      '<ul><li>One</li><li>Two<br>continued</li></ul>' +
      '<table><tr><th>Name</th><th>Value</th></tr><tr><td>A</td><td>B</td></tr></table>'
    )).toBe('One\nTwo\ncontinued\nName Value\nA B');
  });

  it('preserves preformatted line boundaries with stable whitespace', () => {
    expect(htmlToVisibleText('<pre>first  value\n  second value</pre>'))
      .toBe('first value\nsecond value');
  });

  it('decodes entities without interpreting encoded markup', () => {
    expect(htmlToVisibleText('<p>Fish &amp; chips; use &lt;script&gt;</p>'))
      .toBe('Fish & chips; use <script>');
  });

  it('excludes executable, metadata, template, and explicitly hidden content', () => {
    expect(htmlToVisibleText(
      '<head><title>Metadata</title></head><p>Visible</p>' +
      '<script>script text</script><style>style text</style>' +
      '<template>template text</template><p hidden>hidden text</p>' +
      '<p aria-hidden="true">aria text</p><p style="display: none">styled text</p>'
    )).toBe('Visible');
  });

  it('recovers useful boundaries from malformed HTML', () => {
    expect(htmlToVisibleText('<div><p>First<p>Second<ul><li>Third<li>Fourth'))
      .toBe('First\n\nSecond\n\nThird\nFourth');
  });
});
