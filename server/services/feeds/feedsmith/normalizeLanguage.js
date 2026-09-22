const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

// Publisher declarations are hints, not arbitrary text to insert into analysis prompts.
const normalizeLanguage = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) return null;
  try {
    const locale = new Intl.Locale(value.trim());
    if (['und', 'mul', 'zxx'].includes(locale.language) || !languageNames.of(locale.language)) return null;
    return locale.baseName;
  } catch {
    return null;
  }
};

export default function resolveLanguageHint(entry, feed, selectedContent, selectedDescription) {
  const candidates = [
    selectedContent.value ? selectedContent.language : selectedDescription.language,
    entry.language,
    entry.xml?.lang,
    ...(entry.dc?.languages || []),
    ...(entry.dcterms?.languages || []),
    feed.language,
    feed.xml?.lang,
    ...(feed.dc?.languages || []),
    ...(feed.dcterms?.languages || [])
  ];
  return candidates.map(normalizeLanguage).find(Boolean) || null;
}
