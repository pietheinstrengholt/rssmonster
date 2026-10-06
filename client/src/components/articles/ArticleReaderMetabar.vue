<template>
  <div ref="row" class="reader-metabar">
    <div ref="leading" class="reader-metabar__leading"><slot name="leading" /></div>
    <div class="reader-metabar__badges"><slot /></div>
    <button v-if="hiddenIds.size" ref="disclosure" type="button" class="reader-metabar__disclosure" :aria-label="expanded ? 'Hide more article badges' : 'Show more article badges'" :title="expanded ? 'Hide more article badges' : 'Show more article badges'" :aria-controls="panelId" :aria-expanded="expanded" @click.stop="toggleOverflow">
      <BootstrapIcon icon="three-dots" context="control" aria-hidden="true" />
    </button>
    <div :id="panelId" ref="overflowPanel" class="reader-metabar__overflow" :class="{ 'reader-metabar__overflow--open': expanded }" role="group" aria-label="More article badges" :inert="expanded ? undefined : ''" :aria-hidden="expanded ? undefined : 'true'">
      <div v-for="entry in entries" v-show="hiddenIds.has(entry.id)" :key="entry.id" :ref="element => setOverflowTarget(entry.id, element)" class="reader-metabar__overflow-item"></div>
    </div>
  </div>
</template>

<script>
import { useId } from 'vue';

export default {
  setup() { return { panelId: `reader-badges-${useId()}` }; },
  provide() { return { readerMetabar: this }; },
  data() {
    return { entries: [], hiddenIds: new Set(), expanded: false, overflowTargets: new Map() };
  },
  mounted() {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.scheduleMeasure);
      this.resizeObserver.observe(this.$refs.row);
      for (const entry of this.entries) this.resizeObserver.observe(entry.element);
    }
    // Async explanations and tag disclosure can change the badges without resizing the pane.
    this.mutationObserver = new MutationObserver(this.scheduleMeasure);
    this.mutationObserver.observe(this.$refs.row, { childList: true, characterData: true, subtree: true });
    document.addEventListener('pointerdown', this.onOutsidePress);
    document.addEventListener('keydown', this.onEscape);
    this.scheduleMeasure();
  },
  beforeUnmount() {
    this.unmounting = true;
    this.resizeObserver?.disconnect();
    this.mutationObserver.disconnect();
    cancelAnimationFrame(this.measureFrame);
    document.removeEventListener('pointerdown', this.onOutsidePress);
    document.removeEventListener('keydown', this.onEscape);
  },
  methods: {
    setOverflowTarget(id, element) {
      if (element) this.overflowTargets.set(id, element);
      else this.overflowTargets.delete(id);
    },
    registerBadge(id, element, anchor) {
      this.entries.push({ id, element, anchor });
      this.resizeObserver?.observe(element);
      this.scheduleMeasure();
    },
    unregisterBadge(id) {
      const entry = this.entries.find(entry => entry.id === id);
      if (entry) this.resizeObserver?.unobserve(entry.element);
      this.entries = this.entries.filter(entry => entry.id !== id);
      if (!this.unmounting) this.scheduleMeasure();
    },
    scheduleMeasure() {
      cancelAnimationFrame(this.measureFrame);
      this.measureFrame = requestAnimationFrame(this.measure);
    },
    measure() {
      const { row, leading } = this.$refs;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const available = Math.max(0, row.clientWidth - leading.getBoundingClientRect().width - gap);
      const entries = [...this.entries].sort((a, b) => a.anchor.compareDocumentPosition(b.anchor) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
      if (entries.some((entry, index) => entry.id !== this.entries[index].id)) this.entries = entries;
      // Measure each original badge, including those in the closed overflow panel.
      const widths = entries.map(({ element }) => {
        element.title = element.textContent.trim();
        element.style.maxWidth = 'none';
        const width = element.getBoundingClientRect().width;
        element.style.maxWidth = '';
        return width;
      });
      const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
      let visibleCount = widths.length;
      if (total > available + 1) {
        const room = Math.max(0, available - 30 - gap);
        let used = 0;
        visibleCount = 0;
        for (const width of widths) {
          const next = used + (visibleCount ? gap : 0) + width;
          if (next > room + 1) break;
          used = next;
          visibleCount++;
        }
        // Preserve the first badge's identity and shorten its label only at very narrow widths.
        if (!visibleCount && room > 0) visibleCount = 1;
      }
      const hiddenIds = new Set(entries.slice(visibleCount).map(entry => entry.id));
      const focused = document.activeElement;
      const focusedMoves = entries.find(entry => hiddenIds.has(entry.id) !== this.hiddenIds.has(entry.id) && entry.element.contains(focused));
      if (focusedMoves && hiddenIds.has(focusedMoves.id)) this.expanded = true;
      if (focusedMoves) this.$nextTick(() => focused.focus());
      if (hiddenIds.size !== this.hiddenIds.size || [...hiddenIds].some(id => !this.hiddenIds.has(id))) this.hiddenIds = hiddenIds;
      if (!hiddenIds.size && this.expanded) {
        this.expanded = false;
        if (this.$refs.disclosure === document.activeElement) this.entries[0]?.element.querySelector('button, a')?.focus();
      }
    },
    async toggleOverflow() {
      this.expanded = !this.expanded;
      if (!this.expanded) return;
      await this.$nextTick();
      this.$refs.overflowPanel.querySelector('button, a')?.focus();
    },
    onOutsidePress(event) {
      if (!this.$refs.row.contains(event.target)) this.expanded = false;
    },
    onEscape(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || !this.expanded) return;
      event.preventDefault();
      this.expanded = false;
      this.$refs.disclosure?.focus();
    }
  }
};
</script>

<style scoped>
.reader-metabar {
  position: relative;
  flex-wrap: nowrap;
}

.reader-metabar__leading {
  display: flex;
  align-items: center;
  min-height: 24px;
  flex: 0 0 auto;
}

.reader-metabar__badges {
  display: flex;
  align-items: center;
  flex: 1;
  flex-wrap: nowrap;
  gap: inherit;
  min-width: 0;
}

.reader-metabar__disclosure {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 30px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
  background: var(--surface-control);
  color: var(--text-secondary);
  cursor: pointer;
}

.reader-metabar__disclosure:hover {
  background: var(--surface-hover);
}

.reader-metabar__disclosure:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.reader-metabar__overflow {
  position: absolute;
  inset: calc(100% + 6px) 0 auto auto;
  z-index: var(--layer-dropdown);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: max-content;
  max-width: 100%;
  max-height: 50vh;
  overflow: auto;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
  background: var(--surface-card);
  box-shadow: var(--shadow-modal);
  visibility: hidden;
  pointer-events: none;
}

.reader-metabar__overflow-item {
  width: max-content;
  max-width: 100%;
}

.reader-metabar__overflow--open {
  visibility: visible;
  pointer-events: auto;
}
</style>
