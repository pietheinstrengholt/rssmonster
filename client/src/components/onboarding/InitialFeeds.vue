<template>
  <div class="onboarding">
    <div class="onboarding__topbar">
      <div class="onboarding__brand">
        <span class="onboarding__brand-icon" aria-hidden="true"><BootstrapIcon icon="rss-fill" /></span>
        <strong>RSSMonster</strong>
      </div>
      <button type="button" class="app-button onboarding__skip" :disabled="completing || setupPending" @click="$emit('completed')">Skip for now →</button>
    </div>
    <header class="onboarding__hero">
      <div class="onboarding__hero-copy">
        <p class="onboarding__eyebrow">Getting started</p>
        <h2>Welcome to RSSMonster</h2>
        <p class="onboarding__intro">Start with your own sources, import subscriptions, or explore optional starter topics.</p>
      </div>
      <div class="onboarding__hero-art" aria-hidden="true">
        <span class="onboarding__hero-orbit onboarding__hero-orbit--globe"><BootstrapIcon icon="compass-fill" /></span>
        <span class="onboarding__hero-orbit onboarding__hero-orbit--article"><BootstrapIcon icon="newspaper" /></span>
        <span class="onboarding__hero-orbit onboarding__hero-orbit--heart"><BootstrapIcon icon="heart" /></span>
        <div class="onboarding__hero-window">
          <div class="onboarding__hero-window-dots"><span></span><span></span><span></span></div>
          <div class="onboarding__hero-window-body">
            <span class="onboarding__hero-rss"><BootstrapIcon icon="rss-fill" /></span>
            <div class="onboarding__hero-lines"><span></span><span></span><span></span><span></span></div>
          </div>
        </div>
      </div>
    </header>
    <div class="onboarding__getting-started">
      <h3>What would you like to follow?</h3>
      <p>Choose how you want to get started. You can always add more feeds later.</p>
    </div>
    <div class="onboarding__actions">
      <button type="button" class="onboarding__action" :disabled="completing || setupPending" @click="uiStore.setShowModal('NewFeed')">
        <span class="onboarding__action-icon" aria-hidden="true"><BootstrapIcon icon="link-45deg" /></span>
        <span class="onboarding__action-copy">
          <strong>Add your first RSS Feed</strong>
          <span>Add any RSS feed from a website you follow.</span>
        </span>
        <BootstrapIcon class="onboarding__action-arrow" icon="arrow-right" aria-hidden="true" />
      </button>
      <button type="button" class="onboarding__action" :disabled="completing || setupPending" @click="uiStore.setShowModal('ImportSubscriptions')">
        <span class="onboarding__action-icon" aria-hidden="true"><BootstrapIcon icon="upload" /></span>
        <span class="onboarding__action-copy">
          <strong>Import subscriptions</strong>
          <span>Bring in your existing feeds from another reader.</span>
        </span>
        <BootstrapIcon class="onboarding__action-arrow" icon="arrow-right" aria-hidden="true" />
      </button>
      <button type="button" class="onboarding__action" :disabled="completing || setupPending" @click="$emit('completed')">
        <span class="onboarding__action-icon" aria-hidden="true"><BootstrapIcon icon="file-earmark-text" /></span>
        <span class="onboarding__action-copy">
          <strong>Start empty</strong>
          <span>Set up your space and add feeds one by one.</span>
        </span>
        <BootstrapIcon class="onboarding__action-arrow" icon="arrow-right" aria-hidden="true" />
      </button>
    </div>
    <div class="onboarding__info">
      <div class="onboarding__info-item">
        <span class="onboarding__info-icon" aria-hidden="true"><BootstrapIcon icon="info-circle-fill" /></span>
        <div class="onboarding__info-copy">
          <strong>Nothing is selected by default.</strong>
          <span>You’re in control — add your own feeds now, or explore starter topics below.</span>
        </div>
      </div>
      <div class="onboarding__info-item onboarding__info-item--tip">
        <BootstrapIcon icon="lightbulb-fill" aria-hidden="true" />
        <span><strong>Tip:</strong> You can always change, organize or remove feeds later.</span>
      </div>
    </div>

    <section class="onboarding__selection" aria-labelledby="starter-feeds-heading">
      <div class="onboarding__section-heading">
        <div>
          <h3 id="starter-feeds-heading">Starter topics <span>(optional)</span></h3>
          <p>Discover useful feeds and select only the sources you are interested in.</p>
        </div>
      </div>

      <div class="onboarding__topics">
        <fieldset v-for="topic in topics" :key="topic.name" class="onboarding__topic" :data-topic="topic.name">
          <legend class="app-visually-hidden">{{ topic.name }}</legend>
          <div class="onboarding__topic-header" aria-hidden="true">
            <span class="onboarding__topic-icon">
              <BootstrapIcon :icon="{
                Technology: 'cpu-fill', Science: 'compass-fill', Reddit: 'reddit',
                Development: 'file-code-fill', 'AI & Science': 'stars', Games: 'controller',
                'Business & Economy': 'graph-up-arrow', 'World & News': 'newspaper',
                'Security & Privacy': 'shield-check'
              }[topic.name]" />
            </span>
            <div class="onboarding__topic-heading">
              <strong>{{ topic.name }}</strong>
              <span>{{ topic.feeds.length }} feeds</span>
            </div>
          </div>
          <ul class="onboarding__feed-list">
            <li
              v-for="feed in topic.feeds"
              :key="feed.url"
              class="onboarding__feed-item"
            >
              <label class="onboarding__feed-option" :for="`feed-${feed.url}`">
                <input
                  type="checkbox"
                  v-model="feed.selected"
                  :id="`feed-${feed.url}`"
                />
                <span class="onboarding__feed-title">{{ feed.title }}</span>
              </label>
            </li>
          </ul>
        </fieldset>
      </div>
    </section>

    <div
      v-if="setupMessage"
      class="onboarding__message"
      :class="`onboarding__message--${setupMessageType}`"
      role="alert"
    >
      {{ setupMessage }}
    </div>

    <div class="actions">
      <p class="onboarding__actions-note">You can also skip this step and start with an empty account.</p>
      <button type="button" class="onboarding__start" :disabled="completing || setupPending || !feeds.some(feed => feed.selected)" @click="start">
        {{ setupPending ? 'Adding selected feeds…' : 'Start with selected feeds' }}
        <BootstrapIcon v-if="!setupPending" icon="arrow-right" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.onboarding {
  box-sizing: border-box;
  width: min(100%, 1120px);
  margin: 0 auto;
  padding: 32px 36px 56px;
  color: var(--text-primary);
}

.onboarding__topbar,
.onboarding__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.onboarding__topbar {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 28px;
}

.onboarding__brand { font-size: 17px; }
.onboarding__skip { color: var(--text-secondary); }

.onboarding__brand-icon,
.onboarding__hero-rss,
.onboarding__hero-orbit,
.onboarding__action-icon,
.onboarding__topic-icon,
.onboarding__info-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
}

.onboarding__brand-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--color-brand);
  color: var(--text-inverted);
  font-size: 16px;
}

.onboarding__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  gap: 40px;
  align-items: center;
  margin-bottom: 28px;
}

.onboarding__hero-copy { min-width: 0; }
.onboarding__eyebrow {
  margin: 0 0 8px;
  color: var(--color-brand);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.onboarding h2 {
  margin: 0;
  font-size: clamp(24px, 3vw, 28px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.onboarding__intro {
  max-width: 540px;
  margin: 10px 0 0;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.55;
}

.onboarding__hero-art {
  position: relative;
  width: 250px;
  height: 150px;
  justify-self: end;
}

.onboarding__hero-window {
  position: absolute;
  top: 34px;
  left: 42px;
  box-sizing: border-box;
  width: 165px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  box-shadow: 0 12px 30px var(--shadow-card-subtle-color);
}

.onboarding__hero-window-dots {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.onboarding__hero-window-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-strong);
}

.onboarding__hero-window-body { display: flex; gap: 10px; }
.onboarding__hero-rss {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--settings-orange-bg);
  color: var(--color-brand);
}

.onboarding__hero-lines {
  display: grid;
  flex: 1;
  gap: 5px;
  align-content: center;
}

.onboarding__hero-lines span {
  height: 5px;
  border-radius: 999px;
  background: var(--border-default);
}
.onboarding__hero-lines span:nth-child(2) { width: 85%; }
.onboarding__hero-lines span:nth-child(3) { width: 92%; }
.onboarding__hero-lines span:nth-child(4) { width: 65%; }

.onboarding__hero-orbit {
  position: absolute;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  font-size: 19px;
  box-shadow: 0 8px 20px var(--shadow-card-subtle-color);
}
.onboarding__hero-orbit--globe {
  top: 18px;
  left: 4px;
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.onboarding__hero-orbit--article {
  top: 0;
  right: 28px;
  background: var(--settings-success-bg);
  color: var(--settings-success-text);
}
.onboarding__hero-orbit--heart {
  right: 0;
  bottom: 20px;
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
}

.onboarding__getting-started { margin-bottom: 16px; }
.onboarding__getting-started h3 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.onboarding__getting-started p,
.onboarding__section-heading p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.onboarding__actions,
.onboarding__topics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.onboarding__action {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 112px;
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
}
.onboarding__action:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--surface-hover);
  box-shadow: 0 8px 18px var(--shadow-card-subtle-color);
}
.onboarding__action:is(:active, :focus-visible):not(:disabled) {
  border-color: var(--color-brand);
  background: var(--surface-brand-soft);
}
.onboarding__action:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 3px;
}
.onboarding__action:disabled { opacity: 0.55; cursor: not-allowed; }
.onboarding__action-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--surface-chrome);
  color: var(--text-secondary);
  font-size: 20px;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.onboarding__action:is(:active, :focus-visible):not(:disabled) .onboarding__action-icon {
  background: var(--surface-brand-active);
  color: var(--color-brand-hover);
}
.onboarding__action-copy { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
.onboarding__action-copy strong { font-size: 14px; font-weight: 700; }
.onboarding__action-copy > span { color: var(--text-secondary); font-size: 12px; line-height: 1.45; }
.onboarding__action-arrow { color: var(--text-secondary); font-size: 17px; }
.onboarding__action:is(:active, :focus-visible):not(:disabled) .onboarding__action-arrow { color: var(--color-brand-hover); }

.onboarding__info {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 0.6fr);
  gap: 18px;
  align-items: center;
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--surface-selected);
}
.onboarding__info-item { display: flex; gap: 12px; align-items: center; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.onboarding__info-copy { display: flex; flex-direction: column; gap: 2px; }
.onboarding__info-item strong { color: var(--text-primary); }
.onboarding__info-item--tip { padding-left: 18px; border-left: 1px solid var(--border-default); }
.onboarding__info-icon { width: 30px; height: 30px; border-radius: 50%; background: var(--surface-card); color: var(--color-primary); }

.onboarding__selection { margin-top: 32px; }
.onboarding__section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; }
.onboarding__section-heading h3 { margin: 0; font-size: 17px; font-weight: 700; }
.onboarding__section-heading h3 span { color: var(--text-secondary); font-weight: 400; }
.onboarding__topics { margin-top: 18px; }
.onboarding__topic {
  min-width: 0;
  margin: 0;
  padding: 15px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-card);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.onboarding__topic:hover { border-color: var(--border-strong); box-shadow: 0 8px 18px var(--shadow-card-subtle-color); }
.onboarding__topic-header { display: flex; gap: 12px; align-items: center; margin-bottom: 10px; }
.onboarding__topic-icon { width: 44px; height: 44px; border-radius: 12px; font-size: 20px; background: var(--color-primary-soft); color: var(--color-primary); }
.onboarding__topic[data-topic='Reddit'] .onboarding__topic-icon,
.onboarding__topic[data-topic='Business & Economy'] .onboarding__topic-icon { background: var(--settings-orange-bg); color: var(--settings-orange-text); }
.onboarding__topic[data-topic='Science'] .onboarding__topic-icon,
.onboarding__topic[data-topic='Security & Privacy'] .onboarding__topic-icon { background: var(--settings-success-bg); color: var(--settings-success-text); }
.onboarding__topic[data-topic='AI & Science'] .onboarding__topic-icon,
.onboarding__topic[data-topic='Games'] .onboarding__topic-icon { background: var(--settings-rule-bg); color: var(--settings-rule-text); }
.onboarding__topic[data-topic='World & News'] .onboarding__topic-icon { background: var(--settings-danger-bg); color: var(--settings-danger-text); }
.onboarding__topic-heading { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.onboarding__topic-heading strong { font-size: 13px; font-weight: 700; }
.onboarding__topic-heading span { color: var(--text-secondary); font-size: 11px; }
.onboarding__feed-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
.onboarding__feed-option { display: flex; min-height: 32px; gap: 9px; align-items: center; padding: 3px 4px; border-radius: 6px; cursor: pointer; }
.onboarding__feed-option:hover { background: var(--surface-hover); }
.onboarding__feed-option input { width: 16px; height: 16px; flex: 0 0 auto; margin: 0; accent-color: var(--color-primary); }
.onboarding__feed-option:has(input:focus-visible) { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.onboarding__feed-title { color: var(--text-secondary); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
.onboarding__feed-option:hover .onboarding__feed-title,
.onboarding__feed-option:has(input:checked) .onboarding__feed-title { color: var(--text-primary); }
.onboarding__feed-option:has(input:checked) .onboarding__feed-title { font-weight: 600; }

.onboarding__message {
  margin-top: 20px;
  padding: 11px 13px;
  border: 1px solid var(--border-danger);
  border-radius: 8px;
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
  font-size: 13px;
}

.onboarding__message--warning {
  border-color: var(--border-warning);
  background: var(--surface-warning);
  color: var(--color-warning);
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.onboarding__start {
  display: inline-flex;
  min-height: 40px;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: var(--color-primary);
  color: var(--text-inverted);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.onboarding__start:hover:not(:disabled) {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
}

.onboarding__start:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.onboarding__start:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.onboarding__actions-note { margin: 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.onboarding__start { flex-shrink: 0; }

@media (min-width: 880px) {
  .onboarding {
    flex: 1;
    min-height: 0;
    width: 100%;
    padding: 32px max(36px, calc(50% - 524px)) 56px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
  }
}

@media (max-width: 1199px) {
  .onboarding__action { grid-template-columns: 1fr auto; align-content: start; }
  .onboarding__action-icon { grid-column: 1 / -1; }
}

@media (max-width: 1000px) {
  .onboarding__topics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .onboarding__hero { grid-template-columns: minmax(0, 1fr) 210px; gap: 24px; }
  .onboarding__hero-art { transform: scale(0.86); transform-origin: right center; }
}

@media (max-width: 767px) {
  .onboarding { padding: 24px 18px 40px; }
  .onboarding__hero { grid-template-columns: 1fr; }
  .onboarding__hero-art { display: none; }
  .onboarding__getting-started h3 { font-size: 21px; }
  .onboarding__actions, .onboarding__topics, .onboarding__info { grid-template-columns: 1fr; }
  .onboarding__action { grid-template-columns: 44px minmax(0, 1fr) auto; min-height: 100px; }
  .onboarding__action-icon { grid-column: auto; }
  .onboarding__info-item--tip { padding: 12px 0 0; border-left: 0; border-top: 1px solid var(--border-default); }
  .onboarding__feed-option { min-height: var(--control-height-touch); }
  .actions { align-items: stretch; flex-direction: column; gap: 16px; }
  .onboarding__start { width: 100%; }
}
</style>

<script>
import { mapStores } from 'pinia';
import { useUiStore } from '../../store/ui.js';
import { useOverviewStore } from '../../store/overview.js';
import { createCategory } from '../../api/categories';
import { createFeed } from '../../api/feeds';
import { isFatalActionError, notifyActionError } from '../../services/actionNotifications.js';

export default {
  props: { completing: Boolean },
  emits: ['completed'],
  computed: {
    ...mapStores(useOverviewStore, useUiStore),
    topics() {
      return [...new Set(this.feeds.map(feed => feed.category))].map(name => ({
        name, feeds: this.feeds.filter(feed => feed.category === name)
      }));
    }
  },
  name: "InitialFeeds",
  // This function creates the initial onboarding form state.
  data() {
    return {
        setupMessage: '',
        setupMessageType: 'danger',
        setupPending: false,
        feeds: [
            // Technology
            {
                title: "Ars Technica",
                url: "https://arstechnica.com/feed/",
                category: "Technology",
                selected: false
            },
            {
                title: "The Verge",
                url: "https://www.theverge.com/rss/index.xml",
                category: "Technology",
                selected: false
            },

            // Science
            {
                title: "Quanta Magazine",
                url: "https://www.quantamagazine.org/feed/",
                category: "Science",
                selected: false
            },
            {
                title: "ScienceDaily",
                url: "https://www.sciencedaily.com/rss/all.xml",
                category: "Science",
                selected: false
            },

            // Reddit
            {
                title: "Reddit - All",
                url: "https://www.reddit.com/.rss",
                category: "Reddit",
                selected: false
            },
            {
                title: "Reddit - Technology",
                url: "https://www.reddit.com/r/technology/.rss",
                category: "Reddit",
                selected: false
            },

            // Development
            {
                title: "Hacker News",
                url: "https://news.ycombinator.com/rss",
                category: "Development",
                selected: false
            },
            {
                title: "Smashing Magazine",
                url: "https://www.smashingmagazine.com/feed/",
                category: "Development",
                selected: false
            },

            // AI & Science
            {
                title: "MIT Technology Review",
                url: "https://www.technologyreview.com/feed/",
                category: "AI & Science",
                selected: false
            },
            {
                title: "IEEE Spectrum",
                url: "https://spectrum.ieee.org/rss/fulltext",
                category: "AI & Science",
                selected: false
            },

            // Games
            {
                title: "Polygon",
                url: "https://www.polygon.com/rss/index.xml",
                category: "Games",
                selected: false
            },
            {
                title: "Rock Paper Shotgun",
                url: "https://www.rockpapershotgun.com/feed",
                category: "Games",
                selected: false
            },

            // Business & Economy
            {
                title: "Financial Times - Technology",
                url: "https://www.ft.com/technology?format=rss",
                category: "Business & Economy",
                selected: false
            },
            {
                title: "CNBC - Business",
                url: "https://www.cnbc.com/id/10001147/device/rss/rss.html",
                category: "Business & Economy",
                selected: false
            },

            // World & News
            {
                title: "BBC - World News",
                url: "https://feeds.bbci.co.uk/news/world/rss.xml",
                category: "World & News",
                selected: false
            },
            {
                title: "The Guardian - World News",
                url: "https://www.theguardian.com/world/rss",
                category: "World & News",
                selected: false
            },

            // Security & Privacy
            {
                title: "Krebs on Security",
                url: "https://krebsonsecurity.com/feed/",
                category: "Security & Privacy",
                selected: false
            },
            {
                title: "The Hacker News",
                url: "https://feeds.feedburner.com/TheHackersNews",
                category: "Security & Privacy",
                selected: false
            }
        ]
    };
  },

  methods: {
    // This function creates the selected starter data and completes setup despite recoverable failures.
    async start() {
      if (this.setupPending || !this.feeds.some(feed => feed.selected)) return;

      this.setupMessage = '';
      this.setupPending = true;

      try {
        const categoryResult = await this.createCategoriesFromSelectedFeeds();
        if (categoryResult.fatal) return;

        const feedResult = await this.createFeedsFromSelectedFeeds();
        if (feedResult.fatal) return;

        const failedCategoryCount = categoryResult.failedNames.length;
        const failedFeedCount = feedResult.failedTitles.length;

        if (failedCategoryCount || failedFeedCount) {
          const changedCount = categoryResult.createdCount + feedResult.createdCount;
          this.setupMessageType = changedCount > 0 ? 'warning' : 'danger';
          this.setupMessage = this.formatSetupFailureMessage(
            failedCategoryCount,
            failedFeedCount,
            changedCount > 0,
            feedResult.failedTitles
          );
          notifyActionError(this.setupMessage);
        }

        this.$emit("completed");
      } finally {
        this.setupPending = false;
      }
    },

    // This function creates missing categories and reports recoverable failures for safe retries.
    async createCategoriesFromSelectedFeeds() {
      const requiredCategories = [
        ...new Set(
          this.feeds
            .filter(feed => feed.selected)
            .map(feed => feed.category)
        )
      ];

      const existingNames = this.overviewStore.categories.map(c => c.name);
      const resultSummary = {
        createdCount: 0,
        failedNames: [],
        fatal: false
      };

      for (const name of requiredCategories) {
        if (existingNames.includes(name)) continue;

        try {
          const result = await createCategory(name);

          this.overviewStore.addCategory(result.data);
          existingNames.push(name);
          resultSummary.createdCount += 1;

        } catch (err) {
          console.error(`Error creating onboarding category "${name}":`, err);
          if (isFatalActionError(err)) {
            resultSummary.fatal = true;
            return resultSummary;
          }
          resultSummary.failedNames.push(name);
        }
      }

      return resultSummary;
    },

    // This function creates missing starter feeds and leaves successful additions in retry-safe store state.
    async createFeedsFromSelectedFeeds() {
      const resultSummary = {
        createdCount: 0,
        failedTitles: [],
        fatal: false
      };

      for (const feed of this.feeds.filter(f => f.selected)) {
        const category = this.overviewStore.categories.find(
          c => c.name === feed.category
        );

        if (!category) {
          resultSummary.failedTitles.push(feed.title);
          continue;
        }

        // Prevent duplicate feeds
        const exists = category.feeds.some(f => f.url === feed.url || f.feedUrl === feed.url);
        if (exists) continue;

        try {
          const result = await createFeed({
            categoryId: category.id,
            feedName: feed.title,
            url: feed.url
          });

          const newFeed = result.data.feed ?? result.data;
          this.overviewStore.addFeed(category.id, newFeed);
          resultSummary.createdCount += 1;

        } catch (err) {
          console.error(`Error creating onboarding feed "${feed.title}":`, err);
          if (isFatalActionError(err)) {
            resultSummary.fatal = true;
            return resultSummary;
          }
          resultSummary.failedTitles.push(feed.title);
        }
      }

      return resultSummary;
    },

    // This function summarizes skipped starter content without exposing backend details.
    formatSetupFailureMessage(failedCategoryCount, failedFeedCount, hasPartialSuccess, failedTitles) {
      const failures = [];
      if (failedCategoryCount) {
        failures.push(`${failedCategoryCount} ${failedCategoryCount === 1 ? 'category' : 'categories'}`);
      }
      if (failedFeedCount) {
        failures.push(`${failedFeedCount} selected ${failedFeedCount === 1 ? 'feed' : 'feeds'}`);
      }

      const prefix = hasPartialSuccess
        ? 'Some starter content was added, but'
        : 'No starter content was added because';

      const skippedFeeds = failedTitles.length ? ` Not added: ${failedTitles.join(', ')}.` : '';
      return `${prefix} ${failures.join(' and ')} could not be added.${skippedFeeds} You can add feeds later using Add a feed.`;
    }
  }
};
</script>
