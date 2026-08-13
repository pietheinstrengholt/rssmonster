import { onBeforeUnmount, onMounted, ref } from 'vue';
import { getShellMode, SHELL_MEDIA_QUERY, SHELL_MODE } from '../config/responsiveLayout.js';

// Owns the canonical responsive shell state for the consuming component lifetime.
export function useShellMode() {
  const desktopQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(SHELL_MEDIA_QUERY.DESKTOP)
    : null;
  const hybridQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(SHELL_MEDIA_QUERY.HYBRID)
    : null;
  const shellMode = ref(desktopQuery
    ? desktopQuery.matches
      ? SHELL_MODE.DESKTOP
      : hybridQuery.matches ? SHELL_MODE.HYBRID : SHELL_MODE.MOBILE
    : getShellMode(typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth));

  const updateShellMode = () => {
    shellMode.value = desktopQuery.matches
      ? SHELL_MODE.DESKTOP
      : hybridQuery.matches ? SHELL_MODE.HYBRID : SHELL_MODE.MOBILE;
  };

  onMounted(() => {
    desktopQuery?.addEventListener?.('change', updateShellMode);
    hybridQuery?.addEventListener?.('change', updateShellMode);
  });
  onBeforeUnmount(() => {
    desktopQuery?.removeEventListener?.('change', updateShellMode);
    hybridQuery?.removeEventListener?.('change', updateShellMode);
  });

  return shellMode;
}
