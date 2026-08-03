const SWIPE_MAX = 128;
const SWIPE_THRESHOLD = 86;

// Creates touch and portrait-orientation state for article swipe gestures.
export function createArticleMobileSwipeState() {
  return {
    isMobilePortrait: false,
    mediaQuery: null,
    swipeStartX: 0,
    swipeStartY: 0,
    swipeTranslateX: 0,
    swipeTracking: false,
    swipeLocked: false,
    swipeSuppressClick: false
  };
}

// Exposes the article transform while a mobile swipe is active.
export const articleMobileSwipeComputed = {
  // Returns the inline transform used while a mobile swipe is active.
  mobileSwipeStyle() {
    if (!this.isMobilePortrait && !this.swipeTranslateX) return {};

    return {
      transform: `translateX(${this.swipeTranslateX}px)`,
      transition: this.swipeTracking ? 'none' : 'transform 180ms ease'
    };
  }
};

// Groups portrait detection and right-swipe favorite behavior.
export const articleMobileSwipeMethods = {
  // Sets up the listener that tracks mobile portrait orientation.
  setupMediaQueryListener() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    this.mediaQuery = window.matchMedia('(max-width: 879px) and (orientation: portrait)');
    this.isMobilePortrait = this.mediaQuery.matches;
    if (this.mediaQuery.addEventListener) {
      this.mediaQuery.addEventListener('change', this.handleMediaChange);
    } else if (this.mediaQuery.addListener) {
      this.mediaQuery.addListener(this.handleMediaChange);
    }
  },

  // Removes the listener that tracks mobile portrait orientation.
  teardownMediaQueryListener() {
    if (this.mediaQuery) {
      if (this.mediaQuery.removeEventListener) {
        this.mediaQuery.removeEventListener('change', this.handleMediaChange);
      } else if (this.mediaQuery.removeListener) {
        this.mediaQuery.removeListener(this.handleMediaChange);
      }
      this.mediaQuery = null;
    }
  },

  // Updates the portrait state when the media query changes.
  handleMediaChange(event) {
    this.isMobilePortrait = event.matches;
    if (!event.matches) this.resetSwipe();
  },

  // Starts tracking a right-swipe favorite gesture in mobile portrait mode.
  onSwipeTouchStart(event) {
    if (!this.isMobilePortrait || event.touches.length !== 1) {
      this.resetSwipe();
      return;
    }

    const touch = event.touches[0];
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
    this.swipeTranslateX = 0;
    this.swipeTracking = true;
    this.swipeLocked = false;
    this.swipeSuppressClick = false;
  },

  // Updates the article offset while ignoring vertical scroll gestures.
  onSwipeTouchMove(event) {
    if (!this.swipeTracking || !this.isMobilePortrait) return;
    if (event.touches.length !== 1) {
      this.resetSwipe();
      return;
    }

    const touch = event.touches[0];
    const deltaX = touch.clientX - this.swipeStartX;
    const deltaY = touch.clientY - this.swipeStartY;

    if (!this.swipeLocked && Math.abs(deltaY) > Math.abs(deltaX)) {
      this.resetSwipe();
      return;
    }

    if (deltaX <= 0) {
      this.swipeTranslateX = 0;
      return;
    }

    this.swipeLocked = true;
    this.swipeSuppressClick = true;
    this.swipeTranslateX = Math.min(deltaX, SWIPE_MAX);
    if (event.cancelable) event.preventDefault();
  },

  // Toggles favorite status when the swipe crosses the threshold.
  onSwipeTouchEnd() {
    if (!this.swipeTracking) return;

    const shouldToggle = this.swipeTranslateX >= SWIPE_THRESHOLD;
    this.swipeTracking = false;

    if (shouldToggle) this.markAsFavorite();

    this.resetSwipe(false);
    if (this.swipeSuppressClick) {
      window.setTimeout(() => {
        this.swipeSuppressClick = false;
      }, 250);
    }
  },

  // Resets all swipe gesture state.
  resetSwipe(clearSuppressClick = true) {
    this.swipeTranslateX = 0;
    this.swipeTracking = false;
    this.swipeLocked = false;
    if (clearSuppressClick) this.swipeSuppressClick = false;
  }
};
