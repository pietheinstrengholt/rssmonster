export const isIOSDevice = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandaloneWebApp = () =>
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  navigator.standalone === true;
