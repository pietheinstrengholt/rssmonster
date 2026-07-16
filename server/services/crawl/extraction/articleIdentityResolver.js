// This function returns identity already normalized by the configured feed adapter.
const articleIdentityResolver = entry => ({
  externalId: entry?.externalId ?? null,
  externalIdType: entry?.externalIdType ?? null
});

export default articleIdentityResolver;
