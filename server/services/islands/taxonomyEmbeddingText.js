// Builds the stable, structured text used for every island-taxonomy embedding.
export function buildTaxonomyEmbeddingText({
  categoryName,
  displayName,
  description,
  aliases = []
} = {}) {
  return [
    categoryName ? `Category: ${String(categoryName).trim()}` : null,
    displayName ? `Topic: ${String(displayName).trim()}` : null,
    description ? `Description: ${String(description).trim()}` : null,
    Array.isArray(aliases) && aliases.length
      ? `Aliases: ${aliases.map(alias => String(alias).trim()).filter(Boolean).join(', ')}`
      : null
  ]
    .filter(Boolean)
    .join('\n');
}

export default buildTaxonomyEmbeddingText;
