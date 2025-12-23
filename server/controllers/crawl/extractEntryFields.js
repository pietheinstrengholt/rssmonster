/* ======================================================
   Extract entry fields
   ------------------------------------------------------
   Extracts relevant fields from the RSS/Atom entry
====================================================== */
function extractEntryFields(entry) {

  const normalizeDate = value => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  // Categories extraction
  let categoryNames = Array.isArray(entry.categories)
    ? entry.categories
        .map(c => c.name)
        .filter(Boolean)
        .filter(name => !name.includes('|'))
    : [];

  return {
    title: entry.title?.trim() || 'Untitled',
    link: entry.links?.[0]?.href || entry.link,
    description:
      entry.description ||
      entry.summary ||
      entry.contentSnippet ||
      null,
    content:
      entry.content?.encoded ||
      entry.content ||
      entry.description ||
      null,
    author:
      entry.dc?.creator ||
      entry.author ||
      entry.dc?.creators?.[0] ||
      null,
    categories: categoryNames || [],
    published: normalizeDate(
      entry.date_published || 
      entry.pubDate || 
      entry.published || 
      entry.updated ||
      entry.dc?.date || 
      entry.date || 
      entry.created)
  };
}

export default extractEntryFields;
