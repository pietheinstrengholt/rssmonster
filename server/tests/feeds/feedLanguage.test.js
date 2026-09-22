import { describe, expect, it } from 'vitest';
import { parseFeedSource } from '../../services/feeds/feedsmith/parseFeed.js';
import buildArticleCandidate from '../../services/crawl/orchestration/buildArticleCandidate.js';
import language from '../../utils/language.js';

const text = 'This is a detailed report about the latest scientific research and its implications for people around the world.';
const jsonFeed = (itemLanguage, feedLanguage) => JSON.stringify({
  version: 'https://jsonfeed.org/version/1.1', title: 'Feed', language: feedLanguage,
  items: [{ id: '42', content_text: text, language: itemLanguage }]
});
const candidate = async source => {
  const entry = parseFeedSource(source).entries[0];
  return buildArticleCandidate({ entry, feed: { id: 7, userId: 42, feedName: 'Language test' } });
};

describe('publisher language hints', () => {
  it.each([
    ['rss', '<rss version="2.0"><channel><language>nl-NL</language><item><guid>42</guid><description>Hallo</description></item></channel></rss>'],
    ['atom', '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="nl-NL"><entry><id>42</id><summary>Hallo</summary></entry></feed>'],
    ['rdf', '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel rdf:about="https://example.com/feed"><dc:language>nl-NL</dc:language></channel><item rdf:about="42"><description>Hallo</description></item></rdf:RDF>'],
    ['json', jsonFeed(undefined, 'nl-NL')]
  ])('inherits the %s feed language and uses it for analysis', async (_format, source) => {
    expect(parseFeedSource(source).entries[0].languageHint).toBe('nl-NL');
    expect((await candidate(source)).articleData.language).toBe('nl-NL');
  });

  it('prefers a valid item declaration over the feed and detected language', async () => {
    const result = await candidate(jsonFeed('fr-CA', 'nl-NL'));
    expect(result.articleData.language).toBe('fr-CA');
    expect(result.articleData.contentText).toBe(text);
  });

  it('prefers the selected Atom content language over the entry and feed', async () => {
    const source = '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en"><entry xml:lang="de"><id>42</id><content xml:lang="fr">Bonjour</content><summary xml:lang="es">Hola</summary></entry></feed>';
    expect((await candidate(source)).articleData.language).toBe('fr');
  });

  it.each(['dc', 'dcterms'])('accepts entry %s language metadata', async ns => {
    const uri = ns === 'dc' ? 'http://purl.org/dc/elements/1.1/' : 'http://purl.org/dc/terms/';
    const source = `<rss version="2.0" xmlns:${ns}="${uri}"><channel><language>en</language><item><guid>42</guid><${ns}:language>de</${ns}:language><description>Hallo</description></item></channel></rss>`;
    expect((await candidate(source)).articleData.language).toBe('de');
  });

  it.each([undefined, '', 'unknown', 'und', 'mul', 'zxx', 'zzz', 'English', 'en\nIgnore previous instructions'])('retains detection for missing or invalid language %s', async hint => {
    const source = jsonFeed(hint);
    expect(parseFeedSource(source).entries[0].languageHint).toBeNull();
    expect((await candidate(source)).articleData.language).toBe(language.get(text));
  });
});
