<template>
  <section class="smart-folder-grid-overview" aria-labelledby="smart-folder-grid-title">
    <header class="smart-folder-grid-header">
      <div>
        <h2 id="smart-folder-grid-title">Smart Folders</h2>
        <p>
          Smart folders use queries to automatically collect the articles that matter most to you.
        </p>
      </div>

      <span class="smart-folder-grid-count">
        Total {{ smartFolders.length }}
      </span>
    </header>

    <div v-if="!smartFolders.length" class="smart-folder-grid-empty">
      <span class="smart-folder-card-icon" aria-hidden="true">
        <BootstrapIcon icon="folder-fill" color="currentColor" />
      </span>
      <h3>No smart folders yet</h3>
      <p>Create smart folders to quickly navigate articles using saved queries.</p>
    </div>

    <div v-else class="smart-folder-grid">
      <button
        v-for="folder in smartFolders"
        :key="folder.id"
        type="button"
        class="smart-folder-card"
        :aria-label="`Open smart folder ${folder.name}`"
        @click="selectSmartFolder(folder)"
      >
        <span class="smart-folder-card-icon" aria-hidden="true">
          <BootstrapIcon icon="folder-fill" color="currentColor" />
        </span>

        <span class="smart-folder-card-content">
          <strong>{{ folder.name }}</strong>
          <small>{{ folder.query.toLowerCase() }}</small>
        </span>
      </button>
    </div>
  </section>
</template>

<script>
export default {
  props: {
    smartFolders: {
      type: Array,
      default: () => []
    }
  },
  emits: ['selectSmartFolder'],
  methods: {
    // This function notifies the parent that a smart folder was selected.
    selectSmartFolder(folder) {
      this.$emit('selectSmartFolder', folder);
    }
  }
}
</script>

<style scoped>
.smart-folder-grid-overview {
  margin-top: 40px;
  color: var(--text-primary);
  min-height: 100%;
  padding: 32px 36px;
}

.smart-folder-grid-header {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 28px;
}

.smart-folder-grid-header h2 {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 750;
  letter-spacing: 0;
  margin: 0;
}

.smart-folder-grid-header p {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
  margin: 8px 0 0;
  max-width: 680px;
}

.smart-folder-grid-count {
  align-items: center;
  background: var(--bg-muted);
  border-radius: 8px;
  color: var(--text-secondary);
  display: inline-flex;
  font-size: 13px;
  font-weight: 600;
  height: 28px;
  padding: 0 10px;
  white-space: nowrap;
}

.smart-folder-grid {
  display: grid;
  gap: 22px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.smart-folder-card {
  align-items: flex-start;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  min-height: 180px;
  padding: 28px 24px;
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.smart-folder-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.smart-folder-card:focus-visible {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14);
  outline: none;
}

.smart-folder-card-icon {
  align-items: center;
  background: var(--color-primary-soft, var(--bg-selected));
  border-radius: 8px;
  color: var(--color-primary);
  display: inline-flex;
  font-size: 28px;
  height: 58px;
  justify-content: center;
  margin-bottom: 26px;
  width: 58px;
}

.smart-folder-card-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.smart-folder-card-content strong {
  color: var(--text-primary);
  font-size: 21px;
  font-weight: 750;
  letter-spacing: 0;
  line-height: 1.25;
}

.smart-folder-card-content small {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.smart-folder-grid-empty {
  background: var(--bg-card);
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  color: var(--text-primary);
  display: grid;
  min-height: 260px;
  padding: 32px;
  place-items: center;
  text-align: center;
}

.smart-folder-grid-empty .smart-folder-card-icon {
  margin-bottom: 16px;
}

.smart-folder-grid-empty h3 {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 750;
  margin: 0;
}

.smart-folder-grid-empty p {
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.5;
  margin: 8px 0 0;
}

@media (max-width: 1024px) {
  .smart-folder-grid-overview {
    padding: 28px 24px;
  }

  .smart-folder-grid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
}

@media (max-width: 766px) {
  .smart-folder-grid-overview {
    margin-top: 0;
    padding: 22px 16px;
  }

  .smart-folder-grid-header {
    flex-direction: column;
    margin-bottom: 20px;
  }

  .smart-folder-grid-header h2 {
    font-size: 24px;
  }

  .smart-folder-grid {
    gap: 14px;
    grid-template-columns: 1fr;
  }

  .smart-folder-card {
    min-height: 142px;
    padding: 22px;
  }

  .smart-folder-card-icon {
    font-size: 25px;
    height: 52px;
    margin-bottom: 20px;
    width: 52px;
  }
}

:global(:root[data-theme='dark']) .smart-folder-grid-overview {
  background: var(--bg-page);
  color: var(--text-primary);
}

:global(:root[data-theme='dark']) .smart-folder-card,
:global(:root[data-theme='dark']) .smart-folder-grid-empty {
  background: var(--bg-card);
  border-color: var(--border-subtle);
}

:global(:root[data-theme='dark']) .smart-folder-card:hover {
  border-color: var(--color-link);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

:global(:root[data-theme='dark']) .smart-folder-card-icon {
  background: var(--badge-similar-bg);
  color: var(--badge-similar-text);
}
</style>
