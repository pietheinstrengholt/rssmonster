// Native pinch zoom must retain control of one-finger panning.
export const isViewportZoomed = () => (window.visualViewport?.scale ?? 1) > 1;
