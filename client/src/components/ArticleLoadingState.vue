<template>
  <section
    class="article-loading-state"
    role="status"
    aria-live="polite"
    aria-label="Loading articles"
  >
    <div class="article-loading-state__header">
      <div class="article-loading-state__mascot" aria-hidden="true">
        <img src="../assets/images/monster.png" alt="">
      </div>

      <h2 class="article-loading-state__title">
        Loading your articles…
      </h2>

      <div class="article-loading-state__dots" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>

    <div class="article-loading-state__articles" aria-hidden="true">
      <article
        v-for="index in 5"
        :key="index"
        class="article-loading-skeleton"
      >
        <div class="article-loading-skeleton__image"></div>

        <div class="article-loading-skeleton__content">
          <div class="article-loading-skeleton__meta"></div>
          <div class="article-loading-skeleton__title"></div>
          <div class="article-loading-skeleton__title article-loading-skeleton__title--short"></div>
          <div class="article-loading-skeleton__description"></div>
        </div>

        <div class="article-loading-skeleton__action"></div>
      </article>
    </div>

    <span class="visually-hidden">Loading articles</span>
  </section>
</template>

<style scoped>
.article-loading-state {
  color: var(--text-primary);
  margin: 0 auto;
  max-width: 880px;
  padding: 72px 24px 32px;
  width: 100%;
}

.article-loading-state__header {
  align-items: center;
  display: flex;
  flex-direction: column;
  margin-bottom: 28px;
  text-align: center;
}

.article-loading-state__mascot {
  align-items: center;
  background: var(--settings-orange-bg);
  border: 1px solid var(--settings-orange-border);
  border-radius: 50%;
  display: flex;
  height: 72px;
  justify-content: center;
  margin-bottom: 14px;
  overflow: hidden;
  width: 72px;
}

.article-loading-state__mascot img {
  height: 52px;
  object-fit: contain;
  width: 52px;
}

.article-loading-state__title {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
}

.article-loading-state__dots {
  display: flex;
  gap: 5px;
  margin-top: 10px;
}

.article-loading-state__dots span {
  animation: article-loading-dot 1.2s ease-in-out infinite;
  background: var(--color-warning);
  border-radius: 50%;
  height: 6px;
  width: 6px;
}

.article-loading-state__dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.article-loading-state__dots span:nth-child(3) {
  animation-delay: 0.3s;
}

.article-loading-state__articles {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.article-loading-skeleton {
  align-items: center;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  display: grid;
  gap: 16px;
  grid-template-columns: 72px minmax(0, 1fr) 18px;
  min-height: 108px;
  padding: 17px 18px;
}

.article-loading-skeleton__content {
  min-width: 0;
}

.article-loading-skeleton__image,
.article-loading-skeleton__meta,
.article-loading-skeleton__title,
.article-loading-skeleton__description,
.article-loading-skeleton__action {
  background: var(--bg-muted);
  overflow: hidden;
  position: relative;
}

.article-loading-skeleton__image {
  border-radius: 8px;
  height: 72px;
  width: 72px;
}

.article-loading-skeleton__meta {
  border-radius: 4px;
  height: 8px;
  margin-bottom: 10px;
  width: 28%;
}

.article-loading-skeleton__title {
  border-radius: 4px;
  height: 12px;
  margin-bottom: 8px;
  width: 82%;
}

.article-loading-skeleton__title--short {
  width: 58%;
}

.article-loading-skeleton__description {
  border-radius: 4px;
  height: 8px;
  margin-top: 11px;
  width: 70%;
}

.article-loading-skeleton__action {
  border-radius: 50%;
  height: 18px;
  width: 18px;
}

.article-loading-skeleton__image::after,
.article-loading-skeleton__meta::after,
.article-loading-skeleton__title::after,
.article-loading-skeleton__description::after,
.article-loading-skeleton__action::after {
  animation: article-loading-shimmer 1.4s ease-in-out infinite;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.45),
    transparent
  );
  content: "";
  inset: 0;
  position: absolute;
  transform: translateX(-100%);
}

@keyframes article-loading-shimmer {
  100% {
    transform: translateX(100%);
  }
}

@keyframes article-loading-dot {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

@media (max-width: 766px) {
  .article-loading-state {
    padding: 36px 16px 24px;
  }

  .article-loading-state__header {
    margin-bottom: 22px;
  }

  .article-loading-skeleton {
    gap: 12px;
    grid-template-columns: 56px minmax(0, 1fr) 18px;
    min-height: 92px;
    padding: 14px;
  }

  .article-loading-skeleton__image {
    height: 56px;
    width: 56px;
  }

  .article-loading-skeleton__description {
    display: none;
  }
}

:global(:root[data-theme='dark']) .article-loading-state {
  color: var(--text-primary);
}

:global(:root[data-theme='dark']) .article-loading-skeleton {
  background: var(--dark-page-surface, var(--bg-page));
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .article-loading-skeleton__image,
:global(:root[data-theme='dark']) .article-loading-skeleton__meta,
:global(:root[data-theme='dark']) .article-loading-skeleton__title,
:global(:root[data-theme='dark']) .article-loading-skeleton__description,
:global(:root[data-theme='dark']) .article-loading-skeleton__action {
  background: var(--bg-control);
}

:global(:root[data-theme='dark']) .article-loading-skeleton__image::after,
:global(:root[data-theme='dark']) .article-loading-skeleton__meta::after,
:global(:root[data-theme='dark']) .article-loading-skeleton__title::after,
:global(:root[data-theme='dark']) .article-loading-skeleton__description::after,
:global(:root[data-theme='dark']) .article-loading-skeleton__action::after {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.12),
    transparent
  );
}

@media (prefers-reduced-motion: reduce) {
  .article-loading-state__dots span,
  .article-loading-skeleton__image::after,
  .article-loading-skeleton__meta::after,
  .article-loading-skeleton__title::after,
  .article-loading-skeleton__description::after,
  .article-loading-skeleton__action::after {
    animation: none;
  }
}
</style>
