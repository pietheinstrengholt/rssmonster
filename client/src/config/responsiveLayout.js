// Shell responsive contract mirrored by the documented media queries in AppShell.vue:
// 0–767px mobile, 768–879px hybrid, and 880px+ desktop.
export const SHELL_BREAKPOINT = Object.freeze({
  SIDEBAR: 768,
  DESKTOP: 880
});

export const SHELL_MODE = Object.freeze({
  MOBILE: 'mobile',
  HYBRID: 'hybrid',
  DESKTOP: 'desktop'
});

export const SHELL_MEDIA_QUERY = Object.freeze({
  MOBILE: `(max-width: ${SHELL_BREAKPOINT.SIDEBAR - 1}px)`,
  HYBRID: `(min-width: ${SHELL_BREAKPOINT.SIDEBAR}px) and (max-width: ${SHELL_BREAKPOINT.DESKTOP - 1}px)`,
  DESKTOP: `(min-width: ${SHELL_BREAKPOINT.DESKTOP}px)`,
  PERSISTENT_SIDEBAR: `(min-width: ${SHELL_BREAKPOINT.SIDEBAR}px)`
});

// Resolves the single shell state from available layout width.
export function getShellMode(width) {
  const viewportWidth = Number(width);
  if (viewportWidth < SHELL_BREAKPOINT.SIDEBAR) return SHELL_MODE.MOBILE;
  if (viewportWidth < SHELL_BREAKPOINT.DESKTOP) return SHELL_MODE.HYBRID;
  return SHELL_MODE.DESKTOP;
}
