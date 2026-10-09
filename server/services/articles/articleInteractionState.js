// Read state is independent of exposure and attention. Favorites own their signal clock.
export const articleStateValues = (kind, value, now = new Date()) => kind === 'set-status'
  ? { status: value, readAt: value === 'read' ? now : null }
  : { favoriteInd: Number(value), favoritedAt: value ? now : null };
