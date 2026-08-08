import { onBeforeUnmount, onMounted, ref } from 'vue';

// Resolves a reactive media-query match and owns its browser listener lifecycle.
export function useMediaQuery(query, fallback = false) {
  const mediaQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query)
    : null;
  const fallbackMatches = mediaQuery
    ? false
    : typeof fallback === 'function' ? fallback() : fallback;
  const matches = ref(mediaQuery?.matches ?? Boolean(fallbackMatches));

  // Synchronizes the reactive match when the browser crosses the query boundary.
  const handleChange = event => {
    matches.value = event.matches;
  };

  // Registers modern or legacy MediaQueryList listeners for the component lifetime.
  onMounted(() => {
    if (typeof mediaQuery?.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery?.addListener?.(handleChange);
    }
  });

  // Removes the listener before the consuming component leaves its active scope.
  onBeforeUnmount(() => {
    if (typeof mediaQuery?.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', handleChange);
    } else {
      mediaQuery?.removeListener?.(handleChange);
    }
  });

  return matches;
}
