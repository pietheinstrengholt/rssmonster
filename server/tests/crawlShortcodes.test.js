import { describe, expect, it, vi } from 'vitest';

import processHtmlContent from '../services/crawl/processHtmlContent.js';
import { transformWordPressContent } from '../services/crawl/compatibility/transformWordPressContent.js';

describe('crawl shortcode cleanup', () => {
  it('removes WordPress caption wrappers while preserving their content', () => {
    const html = [
      '<p>Intro</p>',
      '[caption id="attachment_1" align="aligncenter" width="640"]',
      '<a href="https://example.com/full.jpg"><img src="https://example.com/image.jpg" alt="Example"></a>',
      'An example image caption.',
      '[/caption]'
    ].join('');

    const cleaned = transformWordPressContent(html);

    expect(cleaned).not.toContain('[caption');
    expect(cleaned).not.toContain('[/caption]');
    expect(cleaned).toContain('<img src="https://example.com/image.jpg" alt="Example">');
    expect(cleaned).toContain('An example image caption.');
  });

  it('stores shortcode-cleaned original and stripped crawl content', () => {
    const html = [
      '<p>Intro text with enough words for processing.</p>',
      '[caption id="attachment_1" align="aligncenter" width="640"]',
      '<a href="https://example.com/full.jpg"><img src="https://example.com/image.jpg" alt="Example"></a>',
      'An example image caption.',
      '[/caption]',
      '[embed]https://youtu.be/pvE2gyWnVHA[/embed]'
    ].join('');

    const hotlinkBatcher = { add: vi.fn() };
    const result = processHtmlContent(
      html,
      null,
      'https://example.com/article',
      { id: 1, userId: 1, feedName: 'Example Feed' },
      'Example title',
      hotlinkBatcher
    );

    expect(result.content).not.toContain('[caption');
    expect(result.content).not.toContain('[/caption]');
    expect(result.content).not.toContain('[embed]');
    expect(result.content).toContain('Watch on YouTube');
    expect(result.stripped).not.toContain('[caption');
    expect(result.stripped).not.toContain('[/caption]');
    expect(result.text).toContain('An example image caption.');
  });
});
