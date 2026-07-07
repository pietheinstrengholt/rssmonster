<template>
  <section class="article-empty-state" aria-labelledby="article-empty-state-title">
    <div class="article-empty-state-illustration" aria-hidden="true">
      <div class="article-empty-state-circle">
        <i class="bi bi-newspaper"></i>
      </div>
      <i class="bi bi-send article-empty-state-plane"></i>
    </div>

    <h2 id="article-empty-state-title" class="article-empty-state-title">
      No posts found
    </h2>

    <p class="article-empty-state-text">
      There are no articles that match your current filters.<br>
      Try adjusting your filters or check back later.
    </p>

    <div class="article-empty-state-actions">
      <button type="button" class="article-empty-state-primary" @click="$emit('clear-filters')">
        <i class="bi bi-search" aria-hidden="true"></i>
        Clear filters
      </button>

      <button type="button" class="article-empty-state-secondary" @click="$emit('refresh-feeds')">
        <i class="bi bi-arrow-clockwise" aria-hidden="true"></i>
        Refresh feeds
      </button>
    </div>

    <div class="article-empty-state-divider" aria-hidden="true">
      <span>OR</span>
    </div>

    <button type="button" class="article-empty-state-link" @click="$emit('open-smart-folders')">
      <i class="bi bi-folder" aria-hidden="true"></i>
      Explore smart folders
    </button>
  </section>
</template>

<script>
export default {
  emits: ['clear-filters', 'refresh-feeds', 'open-smart-folders']
}
</script>

<style scoped>
.article-empty-state {
  align-items: center;
  background: var(--bg-page);
  color: var(--text-primary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: calc(100vh - 96px);
  padding: 72px 24px;
  text-align: center;
}

.article-empty-state-illustration {
  align-items: center;
  display: flex;
  height: 180px;
  justify-content: center;
  margin-bottom: 28px;
  position: relative;
  width: 260px;
}

.article-empty-state-circle {
  align-items: center;
  background: linear-gradient(180deg, var(--color-primary-soft) 0%, rgba(232, 242, 254, 0.35) 100%);
  border-radius: 999px;
  color: var(--color-primary-text, var(--color-primary-hover));
  display: inline-flex;
  font-size: 72px;
  height: 180px;
  justify-content: center;
  opacity: 0.9;
  width: 180px;
}

.article-empty-state-plane {
  color: var(--color-primary);
  font-size: 32px;
  opacity: 0.55;
  position: absolute;
  right: 36px;
  top: 24px;
  transform: rotate(16deg);
}

.article-empty-state-title {
  color: var(--text-primary);
  font-size: 28px;
  font-weight: 750;
  line-height: 1.2;
  margin: 0;
}

.article-empty-state-text {
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.55;
  margin: 12px 0 26px;
  max-width: 460px;
}

.article-empty-state-actions {
  align-items: center;
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 10px;
}

.article-empty-state-primary,
.article-empty-state-secondary {
  align-items: center;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 700;
  gap: 8px;
  height: 42px;
  justify-content: center;
  padding: 0 18px;
  transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.article-empty-state-primary {
  background: var(--color-primary);
  border: 0;
  box-shadow: 0 10px 22px rgba(37, 99, 235, 0.18);
  color: var(--text-inverted);
}

.article-empty-state-primary:hover {
  background: var(--color-primary-hover);
}

.article-empty-state-secondary {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.article-empty-state-secondary:hover {
  background: var(--bg-selected-soft, var(--bg-selected));
  border-color: var(--color-primary-soft);
  color: var(--color-primary-text, var(--color-primary-hover));
}

.article-empty-state-divider {
  align-items: center;
  color: var(--text-meta, var(--text-muted));
  display: flex;
  font-size: 12px;
  font-weight: 700;
  gap: 16px;
  letter-spacing: 0.08em;
  margin: 28px 0 22px;
  width: min(360px, 100%);
}

.article-empty-state-divider::before,
.article-empty-state-divider::after {
  background: var(--border-subtle);
  content: "";
  flex: 1;
  height: 1px;
}

.article-empty-state-link {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  color: var(--color-primary);
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 700;
  gap: 8px;
  justify-content: center;
}

.article-empty-state-link:hover {
  color: var(--color-primary-hover);
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 766px) {
  .article-empty-state {
    min-height: calc(100vh - 140px);
    padding: 48px 18px;
  }

  .article-empty-state-illustration {
    height: 150px;
    margin-bottom: 22px;
    width: 220px;
  }

  .article-empty-state-circle {
    font-size: 58px;
    height: 150px;
    width: 150px;
  }

  .article-empty-state-plane {
    font-size: 26px;
    right: 26px;
    top: 20px;
  }

  .article-empty-state-title {
    font-size: 24px;
  }

  .article-empty-state-text {
    font-size: 15px;
  }

  .article-empty-state-actions {
    flex-direction: column;
    max-width: 360px;
    width: 100%;
  }

  .article-empty-state-primary,
  .article-empty-state-secondary {
    width: 100%;
  }
}

:global(:root[data-theme='dark'] .article-empty-state) {
  background: var(--dark-bg-page, var(--bg-page));
  color: var(--dark-text-primary, var(--text-primary));
}

:global(:root[data-theme='dark'] .article-empty-state-circle) {
  background: linear-gradient(180deg, rgba(30, 58, 138, 0.72) 0%, rgba(30, 58, 138, 0.24) 100%);
  color: var(--color-link-hover);
}

:global(:root[data-theme='dark'] .article-empty-state-plane) {
  color: var(--color-link);
  opacity: 0.90;
}

:global(:root[data-theme='dark'] .article-empty-state-title) {
  color: var(--dark-text-primary, var(--text-primary));
}

:global(:root[data-theme='dark'] .article-empty-state-text) {
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-empty-state-secondary) {
  background: var(--dark-bg-card, var(--bg-card));
  border-color: var(--dark-border, var(--border-color));
  color: var(--dark-text-body, var(--text-secondary));
}

:global(:root[data-theme='dark'] .article-empty-state-secondary:hover) {
  background: var(--dark-bg-hover, var(--bg-hover));
  color: var(--color-link-hover);
}

:global(:root[data-theme='dark'] .article-empty-state-divider) {
  color: var(--dark-text-muted, var(--text-muted));
}

:global(:root[data-theme='dark'] .article-empty-state-divider::before),
:global(:root[data-theme='dark'] .article-empty-state-divider::after) {
  background: var(--dark-border, var(--border-color));
}

:global(:root[data-theme='dark'] .article-empty-state-link) {
  color: var(--color-link);
}

:global(:root[data-theme='dark'] .article-empty-state-link:hover) {
  color: var(--color-link-hover);
}
</style>
