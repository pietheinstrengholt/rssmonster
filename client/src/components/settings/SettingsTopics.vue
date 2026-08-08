<template>
  <div class="settings-topics">
    <SettingsPageIntro
      eyebrow="Settings — Topic Insights"
      icon="diagram-3-fill"
      title="Events and topics"
      title-id="topics-title"
    >
      Events group related articles into current stories. Topics connect those events and articles into longer-running themes.
    </SettingsPageIntro>

    <div v-if="loading" class="settings-topics-loading">
      <span class="app-loading-indicator app-loading-indicator--small" role="status" aria-hidden="true"></span>
      <span>Loading events and topics...</span>
    </div>

    <div v-else-if="error" class="app-notice app-notice--danger" role="alert">
      {{ error }}
    </div>

    <div v-else>
      <div class="settings-metric-grid">
        <SettingsMetric label="Active events" :value="totals.activeEventCount" />
        <SettingsMetric label="Topics" :value="totals.topicCount" />
        <SettingsMetric label="Event articles" :value="totals.eventLinkedArticles" />
        <SettingsMetric label="Topic coverage" :value="formatPercent(totals.topicCoveragePercent)" />
      </div>

      <div class="settings-panel-grid">
        <section class="settings-data-panel" aria-labelledby="event-health-title">
          <h4 id="event-health-title">Event health</h4>
          <dl class="settings-definition-list">
            <div><dt>Unclustered articles</dt><dd>{{ totals.unclusteredArticles }}</dd></div>
            <div><dt>Articles linked to events</dt><dd>{{ totals.eventLinkedArticles }}</dd></div>
            <div><dt>New events created</dt><dd>{{ totals.eventCount }}</dd></div>
            <div><dt>Unassigned articles</dt><dd>{{ totals.unassignedArticles }}</dd></div>
            <div><dt>Event reuse ratio</dt><dd>{{ formatPercent(totals.eventReuseRatio) }}</dd></div>
            <div><dt>New event ratio</dt><dd>{{ formatPercent(totals.newEventRatio) }}</dd></div>
            <div><dt>Average articles per event</dt><dd>{{ formatNumber(totals.averageArticlesPerEvent) }}</dd></div>
            <div><dt>Largest event size</dt><dd>{{ totals.largestEventSize }} articles</dd></div>
          </dl>
        </section>

        <section class="settings-data-panel" aria-labelledby="topic-health-title">
          <h4 id="topic-health-title">Topic health</h4>
          <dl class="settings-definition-list">
            <div><dt>Topics</dt><dd>{{ totals.topicCount }}</dd></div>
            <div><dt>Topics with events</dt><dd>{{ totals.topicsWithEvents }}</dd></div>
            <div><dt>Events linked to topics</dt><dd>{{ totals.eventsLinkedToTopics }}</dd></div>
            <div><dt>Events without topics</dt><dd>{{ totals.eventsWithoutTopics }}</dd></div>
            <div><dt>Articles linked to topics</dt><dd>{{ totals.articlesLinkedToTopics }}</dd></div>
            <div><dt>Average events per topic</dt><dd>{{ formatNumber(totals.averageEventsPerTopic) }}</dd></div>
          </dl>
        </section>
      </div>

      <div class="settings-compact-grid">
        <section class="settings-data-panel" aria-labelledby="event-sizes-title">
          <h4 id="event-sizes-title">Event sizes</h4>
          <div v-if="eventSizeBuckets.length" class="settings-compact-list">
            <div v-for="bucket in eventSizeBuckets" :key="bucket.bucket">
              <span>Events with {{ bucket.bucket }} {{ bucket.bucket === '1' ? 'article' : 'articles' }}</span>
              <strong>{{ bucket.count }}</strong>
            </div>
          </div>
          <p v-else class="settings-empty-text">No event sizes yet.</p>
        </section>
        <section class="settings-data-panel" aria-labelledby="event-statuses-title">
          <h4 id="event-statuses-title">Event statuses</h4>
          <div v-if="eventStatuses.length" class="settings-compact-list">
            <div v-for="status in eventStatuses" :key="status.status">
              <span class="settings-compact-label">{{ status.status }}</span>
              <strong>{{ status.count }}</strong>
            </div>
          </div>
          <p v-else class="settings-empty-text">No events yet.</p>
        </section>
        <section class="settings-data-panel" aria-labelledby="topic-types-title">
          <h4 id="topic-types-title">Topic types</h4>
          <div v-if="topicTypes.length" class="settings-compact-list">
            <div v-for="type in topicTypes" :key="type.topicType">
              <span class="settings-compact-label">{{ type.topicType }}</span>
              <strong>{{ type.count }}</strong>
            </div>
          </div>
          <p v-else class="settings-empty-text">No topics yet.</p>
        </section>
      </div>

      <div v-if="!events.length && !topics.length" class="app-notice app-notice--info" role="status">
        Events and topics will appear here after articles have been clustered.
      </div>

      <div v-else class="settings-panel-grid">
        <section class="settings-data-panel" aria-labelledby="largest-events-title">
          <h4 id="largest-events-title">Largest events</h4>
          <div class="settings-object-list">
            <article v-for="event in events" :key="event.id" class="settings-object-row">
              <div>
                <strong>{{ event.name || `Event #${event.id}` }}</strong>
                <p>
                  {{ event.articleCount }} articles &middot; {{ event.topicCount }} topics &middot; {{ formatDate(event.updatedAt) }}
                </p>
              </div>
              <span class="app-status-badge" :class="statusClass(event.status)">
                {{ event.status }}
              </span>
            </article>
          </div>
        </section>

        <section class="settings-data-panel" aria-labelledby="recent-topics-title">
          <h4 id="recent-topics-title">Recent topics</h4>
          <div class="settings-object-list">
            <article v-for="topic in topics" :key="topic.id" class="settings-object-row">
              <div>
                <strong>{{ topic.name }}</strong>
                <p>
                  {{ topic.linkedEventCount }} events &middot; {{ topic.linkedArticleCount }} articles &middot; {{ formatDate(topic.lastActivityAt) }}
                </p>
              </div>
              <span class="app-status-badge" :class="topicTypeClass(topic.topicType)">
                {{ topic.topicType }}
              </span>
            </article>
          </div>
        </section>
      </div>
    </div>

    <div class="settings-refresh-actions">
      <button type="button" class="settings-refresh-button" @click="reload" :disabled="loading">
        <BootstrapIcon icon="arrow-clockwise" aria-hidden="true" />
        Refresh
      </button>
    </div>
  </div>
</template>

<style scoped>
.settings-topics {
  max-width: 1100px;
  color: var(--text-primary);
}

.settings-topics-loading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  color: var(--text-muted);
  font-family: var(--font-family);
  font-size: 14px;
  font-weight: 500;
}

.settings-data-panel h4 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
}

.settings-metric-grid,
.settings-panel-grid,
.settings-compact-grid {
  display: grid;
  gap: 14px;
  margin-bottom: 18px;
}

.settings-metric-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.settings-panel-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.settings-compact-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.settings-data-panel {
  padding: 20px;
}

.settings-data-panel h4 {
  margin-bottom: 14px;
  font-size: 16px;
}

.settings-definition-list {
  display: grid;
  gap: 10px;
  margin: 0;
}

.settings-definition-list div,
.settings-compact-list div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-definition-list dt,
.settings-compact-list span,
.settings-empty-text,
.settings-object-row p {
  color: var(--text-muted);
}

.settings-definition-list dt {
  font-weight: 500;
}

.settings-definition-list dd {
  margin: 0;
  color: var(--text-primary);
  font-weight: 700;
  text-align: right;
}

.settings-compact-list {
  display: grid;
  gap: 10px;
}

.settings-compact-list strong {
  color: var(--text-primary);
}

.settings-compact-label {
  text-transform: capitalize;
}

.settings-empty-text {
  margin: 0;
  font-size: 13px;
}

.settings-object-list {
  display: grid;
  gap: 10px;
}

.settings-object-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  background: var(--settings-neutral-bg);
  border: 1px solid var(--border-default);
  border-radius: 10px;
}

.settings-object-row strong {
  color: var(--text-primary);
  font-size: 14px;
}

.settings-object-row p {
  margin: 3px 0 0;
  font-size: 12px;
}

.settings-object-row .app-status-badge {
  align-self: flex-start;
}

:global(:root[data-theme='dark']) .settings-object-row {
  background: var(--bg-control);
  border-color: var(--border-default);
}

@media (max-width: 900px) {
  .settings-metric-grid,
  .settings-panel-grid,
  .settings-compact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 879px) {
  .settings-metric-grid,
  .settings-panel-grid,
  .settings-compact-grid {
    grid-template-columns: 1fr;
  }

  .settings-object-row {
    flex-direction: column;
  }
}
</style>

<script>
import { fetchTopicsOverview } from '../../api/settings';
import SettingsMetric from './SettingsMetric.vue';
import SettingsPageIntro from './SettingsPageIntro.vue';

const defaultTotals = () => ({
  totalArticles: 0,
  unclusteredArticles: 0,
  eventLinkedArticles: 0,
  unassignedArticles: 0,
  eventCount: 0,
  activeEventCount: 0,
  eventReuseRatio: 0,
  newEventRatio: 0,
  averageArticlesPerEvent: 0,
  largestEventSize: 0,
  topicCount: 0,
  eventsLinkedToTopics: 0,
  topicsWithEvents: 0,
  eventsWithoutTopics: 0,
  articlesLinkedToTopics: 0,
  topicCoveragePercent: 0,
  averageEventsPerTopic: 0
});

export default {
  name: 'SettingsTopics',
  components: {
    SettingsMetric,
    SettingsPageIntro
  },
  emits: ['close'],
  data() {
    return {
      loading: false,
      error: null,
      totals: defaultTotals(),
      eventSizeBuckets: [],
      eventStatuses: [],
      topicTypes: [],
      events: [],
      topics: []
    };
  },
  created() {
    this.reload();
  },
  methods: {
    formatPercent(value) {
      return `${Number(value || 0).toFixed(1)}%`;
    },
    formatNumber(value) {
      return Number(value || 0).toFixed(1);
    },
    formatDate(value) {
      if (!value) return 'No activity yet';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return 'No activity yet';
      return date.toLocaleDateString();
    },
    statusClass(status) {
      return status === 'archived' ? 'app-status-badge--neutral' : 'app-status-badge--success';
    },
    topicTypeClass(topicType) {
      return {
        event: 'app-status-badge--primary',
        behavioral: 'app-status-badge--info',
        hybrid: 'app-status-badge--success'
      }[topicType] || 'app-status-badge--neutral';
    },
    async reload() {
      this.loading = true;
      this.error = null;

      try {
        const response = await fetchTopicsOverview();
        this.totals = response.data?.totals || defaultTotals();
        this.eventSizeBuckets = response.data?.eventSizeBuckets || [];
        this.eventStatuses = response.data?.eventStatuses || [];
        this.topicTypes = response.data?.topicTypes || [];
        this.events = response.data?.events || [];
        this.topics = response.data?.topics || [];
      } catch (err) {
        console.error('Failed loading events and topics overview:', err);
        this.error = 'Failed to load events and topics overview.';
      }

      this.loading = false;
    }
  }
};
</script>
