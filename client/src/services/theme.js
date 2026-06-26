const THEME_OVERRIDE_STORAGE_KEY = 'rssmonster-theme-override';

// This function returns the user's saved theme mode, defaulting new users to system.
export function getThemeMode() {
  const savedTheme = window.localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY);

  if (savedTheme === 'system' || savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, 'system');
  return 'system';
}

// This function returns the user's saved theme override when one exists.
export function getThemeOverride() {
  const themeMode = getThemeMode();

  return themeMode === 'light' || themeMode === 'dark' ? themeMode : null;
}

// This function returns the current system color-scheme preference.
export function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// This function returns the saved override or falls back to the system preference.
export function getPreferredTheme() {
  return getThemeOverride() ?? getSystemTheme();
}

// This function applies the selected color theme without changing the user's preference.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  const themeColor = getComputedStyle(document.documentElement)
    .getPropertyValue(theme === 'dark' ? '--bg-bounce' : '--theme-color-light')
    .trim();

  document.body.style.background = themeColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
}

// This function saves a user-selected theme mode and applies it.
export function setThemeMode(theme) {
  window.localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, theme);
  applyTheme(theme === 'system' ? getSystemTheme() : theme);
}

// This function listens for system theme changes until a user override is set.
export function subscribeToSystemTheme(onThemeChange) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = (event) => {
    if (!getThemeOverride()) {
      onThemeChange(event.matches ? 'dark' : 'light');
    }
  };

  mediaQuery.addEventListener('change', handleChange);

  return () => mediaQuery.removeEventListener('change', handleChange);
}
