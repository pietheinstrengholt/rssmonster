// Read state is independent of exposure and attention. Saved own their signal clock.
export const articleStateValues = (kind, value, now = new Date()) => kind === 'set-status'
  ? { status: value, readAt: value === 'read' ? now : null }
  : { savedInd: Number(value), savedAt: value ? now : null };
