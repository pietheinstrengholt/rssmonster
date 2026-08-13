import { describe, expect, it } from 'vitest';
import {
  getShellMode,
  SHELL_BREAKPOINT,
  SHELL_MEDIA_QUERY,
  SHELL_MODE
} from '../src/config/responsiveLayout.js';
import appShellSource from '../src/AppShell.vue?raw';
import mobileToolbarSource from '../src/components/shell/MobileToolbar.vue?raw';

describe('responsive shell contract', () => {
  it('defines the three contiguous shell states', () => {
    expect(SHELL_BREAKPOINT).toEqual({ SIDEBAR: 768, DESKTOP: 880 });
    expect(SHELL_MEDIA_QUERY).toEqual({
      MOBILE: '(max-width: 767px)',
      HYBRID: '(min-width: 768px) and (max-width: 879px)',
      DESKTOP: '(min-width: 880px)',
      PERSISTENT_SIDEBAR: '(min-width: 768px)'
    });
  });

  it.each([
    [0, SHELL_MODE.MOBILE],
    [767, SHELL_MODE.MOBILE],
    [768, SHELL_MODE.HYBRID],
    [879, SHELL_MODE.HYBRID],
    [880, SHELL_MODE.DESKTOP],
    [1440, SHELL_MODE.DESKTOP]
  ])('resolves %ipx as %s', (width, mode) => {
    expect(getShellMode(width)).toBe(mode);
  });

  it('keeps shell ownership centralized and CSS boundaries documented', () => {
    expect(appShellSource).toContain('shellMode: useShellMode()');
    expect(appShellSource).toContain('0–767px mobile, 768–879px hybrid, and 880px+ desktop');
    expect(mobileToolbarSource).not.toContain('MOBILE_LANDSCAPE_WIDTH');
    expect(mobileToolbarSource).not.toContain('handleResize');
  });
});
