const THEME_STORAGE_KEY = 'rssmonster-theme';

// This function returns the saved theme or falls back to the system preference.
export function getPreferredTheme() {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// This function applies and persists the selected color theme.
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);

  const themeColor = getComputedStyle(document.documentElement)
    .getPropertyValue(theme === 'dark' ? '--bg-bounce' : '--theme-color-light')
    .trim();

  document.body.style.background = themeColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
}
