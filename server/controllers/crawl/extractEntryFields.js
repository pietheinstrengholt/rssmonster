/* ======================================================
   Extract entry fields
   ------------------------------------------------------
   Extracts relevant fields from the RSS/Atom entry
====================================================== */
function extractEntryFields(entry) {
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
      null
  };
}

export default extractEntryFields;
