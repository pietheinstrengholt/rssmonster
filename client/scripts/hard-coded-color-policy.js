// Files that define semantic tokens are the destination for migrations, not UI consumers to ratchet.
export const EXCLUDED_COLOR_SOURCES = new Set([
  'src/assets/styles/theme.css'
]);

// Durable exceptions are capped and must explain why a literal is more correct than a semantic token.
export const APPROVED_COLOR_EXCEPTIONS = [
  // Publisher/platform brand colors preserve the recognizable identity of article media sources.
  ...[
    ['#dc2626', 1], ['#991b1b', 2],
    ['#1185fe', 1], ['#0866c6', 2],
    ['#ff4500', 1], ['#b83200', 2],
    ['#000', 2], ['#fff', 4],
    ['#6364ff', 1], ['#4547d9', 2],
    ['#1e40af', 1], ['#1e3a8a', 2]
  ].map(([literal, maxOccurrences]) => ({
    category: 'publisher-platform-brand',
    file: 'src/components/articles/Article.vue',
    literal,
    maxOccurrences,
    reason: 'Preserves the current publisher or media-platform icon identity.'
  })),

  // Article-content compatibility rules control embedded publisher content rather than application chrome.
  {
    category: 'article-content-compatibility',
    file: 'src/components/articles/articleContentOverrides.css',
    literal: '#000',
    maxOccurrences: 1,
    reason: 'Keeps normalized YouTube embeds on their expected black canvas.'
  },

  // Intentional var() fallbacks preserve rendering when a component is consumed without the full theme.
  ...[
    ['src/components/articles/Article.vue', '#e5e7eb', 2],
    ['src/components/articles/ArticleMedia.vue', '#2563eb', 1],
    ['src/components/articles/UnreadSelectionContext.vue', '#0b0f14', 1],
    ['src/components/articles/UnreadSelectionContext.vue', '#2a3342', 1],
    ['src/components/briefing/BriefingContextText.vue', '#e5e7eb', 1],
    ['src/components/briefing/BriefingContextText.vue', '#9ca3af', 1],
    ['src/components/briefing/BriefingContextText.vue', '#222836', 1],
    ['src/components/briefing/BriefingContextText.vue', '#2a3342', 1],
    ['src/components/briefing/BriefingContextText.vue', '#60a5fa', 2],
    ['src/components/briefing/BriefingContextText.vue', '#93c5fd', 2],
    ['src/components/briefing/DailyBriefingIntro.vue', '#e5e7eb', 2],
    ['src/components/briefing/DailyBriefingIntro.vue', '#0b0f14', 1],
    ['src/components/briefing/DailyBriefingIntro.vue', '#2a3342', 1],
    ['src/components/briefing/DailyBriefingIntro.vue', '#9ca3af', 2],
    ['src/components/dialogs/UnreadConfigurationModal.vue', '#2a3342', 1],
    ['src/components/dialogs/UnreadConfigurationModal.vue', '#60a5fa', 1],
    ['src/components/dialogs/UnreadConfigurationModal.vue', '#222836', 1],
    ['src/components/dialogs/UnreadConfigurationModal.vue', '#9ca3af', 1]
  ].map(([file, literal, maxOccurrences]) => ({
    category: 'intentional-var-fallback',
    file,
    literal,
    maxOccurrences,
    reason: 'Preserves the reviewed fallback when the referenced semantic variable is unavailable.',
    varFallback: true
  })),

  // Other reviewed exceptions use CSS-native color semantics that intentionally follow their context.
  {
    category: 'other-reviewed-exception',
    file: 'src/components/briefing/BriefingContextText.vue',
    literal: 'currentColor',
    maxOccurrences: 1,
    reason: 'Makes the focus outline follow the action text color in both themes.'
  },
  {
    category: 'other-reviewed-exception',
    file: 'src/components/shared/BootstrapIcon.vue',
    literal: 'currentColor',
    maxOccurrences: 1,
    reason: 'Makes the shared icon inherit the semantic color chosen by its caller.'
  },
  {
    category: 'other-reviewed-exception',
    file: 'src/components/sidebar/SidebarNavItem.vue',
    literal: 'currentColor',
    maxOccurrences: 1,
    reason: 'Makes the clicked-state icon inherit the navigation item color.'
  }
];

// Legacy UI literals are tracked by file and normalized value; reducing a count ratchets the limit down.
export const HARD_CODED_COLOR_BASELINE = {
  'src/components/articles/ArticleEmptyState.vue': {
    'rgba(30,58,138,0.24)': 1,
    'rgba(30,58,138,0.72)': 1
  },
  'src/components/articles/ArticleLoadingState.vue': {
    'rgba(255,255,255,0.12)': 1,
    'rgba(255,255,255,0.45)': 1
  },
  'src/components/articles/ArticleMedia.vue': {
    'rgba(17,24,39,0.14)': 1,
    'rgba(17,24,39,0.88)': 2,
    'rgba(255,255,255,0.18)': 2
  },
  'src/components/articles/SmartFoldersGridOverview.vue': {
    'rgba(0,0,0,0.28)': 1,
    'rgba(15,23,42,0.08)': 1
  },
  'src/components/dialogs/UnreadConfigurationModal.vue': {
    'rgba(127,29,29,0.28)': 1,
    'rgba(15,23,42,0.2)': 1,
    'rgba(37,99,235,0.4)': 1
  },
};
