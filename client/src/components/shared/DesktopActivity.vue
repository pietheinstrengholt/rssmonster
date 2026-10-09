<template>
  <button type="button" class="desktop-activity" :title="details" @click="$emit('details')">
    <BootstrapIcon :icon="icon" decorative />
    <span role="status">{{ error || label }}</span>
  </button>
</template>

<script>
import { fetchDesktopActivity } from '../../api/desktop';
import { desktopActivityLabel, desktopActivityDetails } from '../../services/desktopActivity';

export default {
  name: 'DesktopActivity',
  emits: ['details'],
  data: () => ({ activity: null, error: '', timer: null, stopped: false }),
  computed: {
    label() { return desktopActivityLabel(this.activity); },
    details() { return desktopActivityDetails(this.activity); },
    icon() {
      if (this.error || this.activity?.status === 'error') return 'exclamation-triangle';
      if (['refreshing', 'processing', 'starting'].includes(this.activity?.status)) return 'arrow-repeat';
      return this.activity?.status === 'disabled' ? 'pause-circle' : 'check-circle';
    }
  },
  mounted() { void this.poll(); },
  beforeUnmount() { this.stopped = true; clearTimeout(this.timer); },
  methods: {
    async poll() {
      try {
        const { data } = await fetchDesktopActivity();
        if (!this.stopped) { this.activity = data; this.error = ''; }
      } catch {
        if (!this.stopped) this.error = 'Background status unavailable';
      } finally {
        if (!this.stopped) this.timer = setTimeout(() => { void this.poll(); }, 5000);
      }
    }
  }
};
</script>

<style scoped>
.desktop-activity {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.75rem;
  text-align: left;
}
.desktop-activity:hover { background: var(--surface-hover); }
.desktop-activity:focus-visible { outline: 2px solid var(--color-link); outline-offset: 2px; }
</style>
