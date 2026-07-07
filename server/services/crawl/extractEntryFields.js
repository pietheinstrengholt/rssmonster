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

  const normalizeCategoryName = value =>
    typeof value === 'string'
      ? value.trim()
      : null;

  const extractCategoryName = category => {
    if (!category) return null;

    if (typeof category === 'string') {
      return normalizeCategoryName(category);
    }

    return normalizeCategoryName(
      category.name ||
      category.term ||
      category.label ||
      category.value ||
      category._ ||
      category['#text'] ||
      category.$?.term ||
      category.$?.label ||
      category.$?.value ||
      category.$?.name
    );
  };

  const categorySources = [
    ...(Array.isArray(entry.categories) ? entry.categories : []),
    ...(Array.isArray(entry.category) ? entry.category : entry.category ? [entry.category] : []),
    ...(Array.isArray(entry.tags) ? entry.tags : []),
    ...(Array.isArray(entry.dc?.subject) ? entry.dc.subject : entry.dc?.subject ? [entry.dc.subject] : []),
    ...(Array.isArray(entry.subjects) ? entry.subjects : [])
  ];

  // Categories extraction
  const categoryNames = [...new Set(
    categorySources
      .map(extractCategoryName)
      .filter(Boolean)
      .filter(name => !name.includes('|'))
  )];

  return {
    title: entry.title?.trim() || 'Untitled',
    link: entry.links?.[0]?.href || entry.link,
    description:
      entry.description ||
      null,
    content:
      entry.content?.encoded ||
      entry.content ||
      null,
    author:
      entry.dc?.creator ||
      entry.author ||
      entry.dc?.creators?.[0] ||
      null,
    categories: categoryNames,
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