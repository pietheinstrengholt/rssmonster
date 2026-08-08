<template>
  <div ref="root" class="app-dropdown">
    <slot name="trigger" :trigger-props="triggerProps"></slot>
    <slot name="menu" :menu-props="menuProps"></slot>
  </div>
</template>

<script>
let nextDropdownId = 0;
let activeDropdown = null;

// This function closes the active menu when a pointer press starts outside it.
const handleDocumentPointerDown = event => {
  if (!activeDropdown?.$refs.root?.contains(event.target)) {
    activeDropdown?.close();
  }
};

// This function keeps the active menu aligned while its viewport or scroll position changes.
const handleViewportChange = () => {
  activeDropdown?.positionMenu();
};

// This function installs one shared set of global listeners for the currently open menu.
const activateDropdown = dropdown => {
  if (activeDropdown && activeDropdown !== dropdown) {
    activeDropdown.close();
  }
  if (activeDropdown === dropdown) return;

  activeDropdown = dropdown;
  document.addEventListener('pointerdown', handleDocumentPointerDown);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
};

// This function removes shared listeners after the active menu closes or unmounts.
const deactivateDropdown = dropdown => {
  if (activeDropdown !== dropdown) return;

  activeDropdown = null;
  document.removeEventListener('pointerdown', handleDocumentPointerDown);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
};

export default {
  props: {
    align: {
      type: String,
      default: 'start',
      // This function limits placement to the two alignment modes the component implements.
      validator: value => ['start', 'end'].includes(value)
    },
    closeKey: {
      type: [String, Number, Boolean],
      default: ''
    },
    id: {
      type: String,
      default: ''
    }
  },
  // This function initializes the menu's generated relationship IDs and positioning state.
  data() {
    const generatedId = `rss-dropdown-${++nextDropdownId}`;
    const triggerId = this.id || generatedId;

    return {
      isOpen: false,
      openAbove: false,
      horizontalShift: 0,
      triggerId,
      menuId: `${triggerId}-menu`
    };
  },
  computed: {
    // This function provides the accessible trigger contract to the consumer's semantic button.
    triggerProps() {
      return {
        id: this.triggerId,
        'aria-controls': this.menuId,
        'aria-expanded': String(this.isOpen),
        'aria-haspopup': 'menu',
        class: 'app-dropdown__trigger',
        onClick: this.toggle,
        onKeydown: this.handleTriggerKeydown
      };
    },
    // This function provides visibility, keyboard handling, and placement to the consumer's menu.
    menuProps() {
      return {
        id: this.menuId,
        'aria-labelledby': this.triggerId,
        class: {
          'app-dropdown__menu': true,
          'app-dropdown__menu--align-start': this.align === 'start',
          'app-dropdown__menu--align-end': this.align === 'end',
          'app-dropdown__menu--open': this.isOpen
        },
        role: 'menu',
        style: {
          bottom: this.openAbove ? '100%' : 'auto',
          marginBottom: this.openAbove ? '2px' : '0',
          marginTop: this.openAbove ? '0' : '2px',
          top: this.openAbove ? 'auto' : '100%',
          transform: `translateX(${this.horizontalShift}px)`
        },
        onClick: this.handleMenuClick,
        onKeydown: this.handleMenuKeydown
      };
    }
  },
  watch: {
    // This function closes a menu when its owning view or selection changes externally.
    closeKey() {
      this.close();
    }
  },
  beforeUnmount() {
    deactivateDropdown(this);
  },
  methods: {
    // This function locates the trigger rendered through the scoped slot.
    getTrigger() {
      return this.$refs.root?.querySelector('.app-dropdown__trigger') || null;
    },
    // This function locates the menu rendered through the scoped slot.
    getMenu() {
      return this.$refs.root?.querySelector('.app-dropdown__menu') || null;
    },
    // This function returns enabled menu actions in their rendered order.
    getMenuItems() {
      const menu = this.getMenu();
      if (!menu) return [];

      return [...menu.querySelectorAll('.app-dropdown__item, [role="menuitem"], [role="menuitemradio"]')]
        .filter(item => !item.matches(':disabled, [aria-disabled="true"], .app-dropdown__item--disabled'));
    },
    // This function toggles the menu without moving pointer users away from the trigger.
    toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    },
    // This function opens the menu, preserving a single active dropdown across the application.
    open(focusPosition = null) {
      if (this.isOpen) return;

      activateDropdown(this);
      this.isOpen = true;
      this.openAbove = false;
      this.horizontalShift = 0;
      this.$nextTick(() => {
        this.positionMenu();
        if (focusPosition !== null) {
          this.focusMenuItem(focusPosition);
        }
      });
    },
    // This function closes the menu and optionally restores focus to its trigger.
    close(restoreFocus = false) {
      if (!this.isOpen) {
        deactivateDropdown(this);
        return;
      }

      this.isOpen = false;
      this.openAbove = false;
      this.horizontalShift = 0;
      deactivateDropdown(this);
      if (restoreFocus) {
        this.$nextTick(() => this.getTrigger()?.focus());
      }
    },
    // This function positions the menu within the visual viewport without a general-purpose engine.
    positionMenu() {
      if (!this.isOpen) return;

      const trigger = this.getTrigger();
      const menu = this.getMenu();
      if (!trigger || !menu) return;

      const visualViewport = window.visualViewport;
      const viewportLeft = visualViewport?.offsetLeft || 0;
      const viewportTop = visualViewport?.offsetTop || 0;
      const viewportRight = viewportLeft + (visualViewport?.width || document.documentElement.clientWidth);
      const viewportBottom = viewportTop + (visualViewport?.height || document.documentElement.clientHeight);
      const triggerRect = trigger.getBoundingClientRect();
      const initialMenuRect = menu.getBoundingClientRect();
      const edgeGap = 8;
      const spaceAbove = triggerRect.top - viewportTop;
      const spaceBelow = viewportBottom - triggerRect.bottom;

      this.openAbove = initialMenuRect.height > spaceBelow - edgeGap && spaceAbove > spaceBelow;
      this.horizontalShift = 0;

      this.$nextTick(() => {
        if (!this.isOpen) return;
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.left < viewportLeft + edgeGap) {
          this.horizontalShift = viewportLeft + edgeGap - menuRect.left;
        } else if (menuRect.right > viewportRight - edgeGap) {
          this.horizontalShift = viewportRight - edgeGap - menuRect.right;
        }
      });
    },
    // This function focuses an enabled menu action by absolute or relative position.
    focusMenuItem(position) {
      const items = this.getMenuItems();
      if (items.length === 0) return;

      if (position === 'first') {
        items[0].focus();
        return;
      }
      if (position === 'last') {
        items[items.length - 1].focus();
        return;
      }

      const activeIndex = items.indexOf(document.activeElement);
      const nextIndex = (activeIndex + position + items.length) % items.length;
      items[nextIndex].focus();
    },
    // This function opens and navigates the menu from its trigger using standard menu keys.
    handleTriggerKeydown(event) {
      if (['Enter', ' '].includes(event.key)) {
        event.preventDefault();
        if (this.isOpen) {
          this.close();
        } else {
          this.open('first');
        }
      } else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        if (this.isOpen) {
          this.focusMenuItem(event.key === 'ArrowUp' ? 'last' : 'first');
        } else {
          this.open(event.key === 'ArrowUp' ? 'last' : 'first');
        }
      } else if (event.key === 'Escape' && this.isOpen) {
        event.preventDefault();
        this.close(true);
      }
    },
    // This function supports cyclic arrows, boundaries, and Escape inside the open menu.
    handleMenuKeydown(event) {
      const keyActions = {
        ArrowDown: 1,
        ArrowUp: -1,
        Home: 'first',
        End: 'last'
      };

      if (event.key === 'Escape') {
        event.preventDefault();
        this.close(true);
      } else if (Object.hasOwn(keyActions, event.key)) {
        event.preventDefault();
        this.focusMenuItem(keyActions[event.key]);
      }
    },
    // This function closes after an enabled menu action has handled its selection.
    handleMenuClick(event) {
      const item = event.target.closest('.app-dropdown__item, [role="menuitem"], [role="menuitemradio"]');
      if (!item || item.matches(':disabled, [aria-disabled="true"], .app-dropdown__item--disabled')) return;
      this.close();
    }
  }
};
</script>

<style scoped>
.app-dropdown {
  --app-dropdown-active-background: var(--color-primary-soft);
  --app-dropdown-active-color: var(--color-primary);
  --app-dropdown-hover-background: var(--toolbar-active-background);
  --app-dropdown-hover-color: var(--text-inverted);
  --app-dropdown-item-color: var(--text-secondary);
  --app-dropdown-menu-background: var(--bg-card);
  --app-dropdown-menu-color: var(--text-primary);

  position: relative;
}

/* Scoped-slot controls remain descendants of the dropdown root and use its explicit class contract. */
:deep(.app-dropdown__trigger) {
  white-space: nowrap;
}

:deep(.app-dropdown__menu) {
  position: absolute;
  z-index: var(--layer-dropdown);
  display: none;
  min-width: 160px;
  padding: 8px 0;
  margin: 0;
  color: var(--app-dropdown-menu-color);
  font-size: var(--font-size-ui-default);
  line-height: 20px;
  text-align: left;
  list-style: none;
  background-color: var(--app-dropdown-menu-background);
  background-clip: padding-box;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-compact);
  box-shadow: var(--shadow-modal);
}

:deep(.app-dropdown__menu--align-start) {
  right: auto;
  left: 0;
}

:deep(.app-dropdown__menu--align-end) {
  right: 0;
  left: auto;
}

:deep(.app-dropdown__menu--open) {
  display: block;
}

:deep(.app-dropdown__item) {
  display: block;
  width: 100%;
  padding: 4px 16px;
  clear: both;
  color: var(--app-dropdown-item-color);
  font: inherit;
  font-weight: 500;
  text-align: inherit;
  text-decoration: none;
  white-space: nowrap;
  background-color: var(--color-transparent);
  border: 0;
  border-radius: 0;
}

:deep(.app-dropdown__item:hover),
:deep(.app-dropdown__menu .app-dropdown__item:focus-visible) {
  color: var(--app-dropdown-hover-color);
  background-color: var(--app-dropdown-hover-background);
  outline: none;
}

:deep(.app-dropdown__item--active),
:deep(.app-dropdown__item:active) {
  color: var(--app-dropdown-active-color);
  background-color: var(--app-dropdown-active-background);
}

:deep(.app-dropdown__item--disabled),
:deep(.app-dropdown__item:disabled),
:deep(.app-dropdown__item[aria-disabled='true']) {
  color: var(--text-muted);
  pointer-events: none;
  background-color: var(--color-transparent);
  opacity: 0.65;
}

:deep(.app-dropdown__divider) {
  height: 0;
  margin: 8px 0;
  overflow: hidden;
  border: 0;
  border-top: 1px solid var(--border-default);
  opacity: 1;
}

:global(:root[data-theme='dark'] .app-dropdown) {
  --app-dropdown-active-background: var(--toolbar-active-background);
  --app-dropdown-active-color: var(--text-inverted);
  --app-dropdown-hover-background: var(--bg-control);
  --app-dropdown-hover-color: var(--text-inverted);
  --app-dropdown-item-color: var(--text-secondary);
  --app-dropdown-menu-background: var(--bg-modal);
  --app-dropdown-menu-color: var(--text-inverted);
}
</style>
