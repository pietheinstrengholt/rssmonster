import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  getPreferredTheme,
  getSystemTheme,
  getThemeMode,
  getThemeOverride,
  setThemeMode,
  subscribeToSystemTheme
} from '../src/services/theme.js';
import articleMediaSource from '../src/components/articles/ArticleMedia.vue?raw';
import settingsSectionErrorSource from '../src/components/settings/SettingsSectionError.vue?raw';
import settingsSectionLoadingSource from '../src/components/settings/SettingsSectionLoading.vue?raw';
import actionErrorNoticeSource from '../src/components/shared/ActionErrorNotice.vue?raw';
import connectivityStatusSource from '../src/components/shared/ConnectivityStatus.vue?raw';
import feedRefreshProgressSource from '../src/components/shared/FeedRefreshProgress.vue?raw';
import sidebarSource from '../src/components/sidebar/Sidebar.vue?raw';

const THEME_OVERRIDE_STORAGE_KEY = 'rssmonster-theme-override';

// This function installs a controllable color-scheme media query for each test.
const mockSystemTheme = (matches = false) => {
  const mediaQuery = {
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  };
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQuery));
  return mediaQuery;
};

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  document.head.innerHTML = '<meta name="theme-color" content="">';
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('theme preferences', () => {
  it('defaults missing and invalid saved values to the system mode', () => {
    expect(getThemeMode()).toBe('system');
    expect(window.localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY)).toBe('system');

    window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, 'sepia');
    expect(getThemeMode()).toBe('system');
    expect(window.localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY)).toBe('system');
  });

  it.each(['system', 'light', 'dark'])('returns the supported saved mode %s', mode => {
    window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, mode);

    expect(getThemeMode()).toBe(mode);
  });

  it('returns only explicit light and dark overrides', () => {
    window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, 'light');
    expect(getThemeOverride()).toBe('light');

    window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, 'system');
    expect(getThemeOverride()).toBeNull();
  });

  it('uses the current system preference when no override exists', () => {
    const mediaQuery = mockSystemTheme(true);

    expect(getSystemTheme()).toBe('dark');
    expect(getPreferredTheme()).toBe('dark');

    mediaQuery.matches = false;
    expect(getSystemTheme()).toBe('light');
  });

  it('prefers a saved override over the system preference', () => {
    mockSystemTheme(false);
    window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, 'dark');

    expect(getPreferredTheme()).toBe('dark');
  });

  it.each([
    [false, 'system', 'light'],
    [true, 'system', 'dark'],
    [true, 'light', 'light'],
    [false, 'dark', 'dark']
  ])('resolves OS dark=%s with %s mode to %s', (systemDark, mode, expectedTheme) => {
    mockSystemTheme(systemDark);
    window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, mode);

    const resolvedTheme = getPreferredTheme();
    applyTheme(resolvedTheme);

    expect(resolvedTheme).toBe(expectedTheme);
    expect(document.documentElement.dataset.theme).toBe(expectedTheme);
  });

  // Verifies component presentation reads the resolved root theme instead of OS media state.
  it('keeps direct system-preference detection out of component styles', () => {
    const componentSources = [
      articleMediaSource,
      settingsSectionErrorSource,
      settingsSectionLoadingSource,
      actionErrorNoticeSource,
      connectivityStatusSource,
      feedRefreshProgressSource,
      sidebarSource
    ];

    expect(componentSources.every(source => !source.includes('prefers-color-scheme'))).toBe(true);
  });
});

describe('theme application', () => {
  it.each([
    ['dark', '--bg-bounce', 'rgb(17, 24, 39)'],
    ['light', '--bg-bounce', 'rgb(248, 249, 250)']
  ])('applies the %s theme and its configured browser color', (theme, property, color) => {
    document.documentElement.style.setProperty(property, color);

    applyTheme(theme);

    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(document.documentElement.style.colorScheme).toBe(theme);
    expect(document.body.style.background).toBe(color);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe(color);
  });

  it('applies a theme when the browser theme-color metadata is absent', () => {
    document.querySelector('meta[name="theme-color"]').remove();
    document.documentElement.style.setProperty('--bg-bounce', '#ffffff');

    expect(() => applyTheme('light')).not.toThrow();
  });

  it('saves explicit modes and resolves system mode before applying it', () => {
    mockSystemTheme(true);
    document.documentElement.style.setProperty('--bg-bounce', '#111111');

    setThemeMode('system');

    expect(window.localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY)).toBe('system');
    expect(document.documentElement.dataset.theme).toBe('dark');

    document.documentElement.style.setProperty('--bg-bounce', '#ffffff');
    setThemeMode('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});

describe('system theme subscription', () => {
  it('forwards changes without an override and removes its listener on cleanup', () => {
    const mediaQuery = mockSystemTheme();
    const onThemeChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(onThemeChange);
    const handler = mediaQuery.addEventListener.mock.calls[0][1];

    handler({ matches: true });
    expect(onThemeChange).toHaveBeenCalledWith('dark');

    handler({ matches: false });
    expect(onThemeChange).toHaveBeenLastCalledWith('light');

    unsubscribe();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', handler);
  });

  it('ignores system changes while an explicit override is saved', () => {
    const mediaQuery = mockSystemTheme();
    const onThemeChange = vi.fn();
    window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, 'dark');
    subscribeToSystemTheme(onThemeChange);

    mediaQuery.addEventListener.mock.calls[0][1]({ matches: false });

    expect(onThemeChange).not.toHaveBeenCalled();
  });
});
