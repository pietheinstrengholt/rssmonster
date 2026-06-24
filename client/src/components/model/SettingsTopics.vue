<template>
  <div class="settings-group">
    <h4>Events and topics</h4>
    <p class="text-muted mb-3">
      Events group related articles into current stories. Topics connect those events and articles into longer-running themes.
    </p>

    <div v-if="loading" class="d-flex align-items-center gap-2 mb-3">
      <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
      <span>Loading events and topics...</span>
    </div>

    <div v-else-if="error" class="alert alert-danger mb-3">
      {{ error }}
    </div>

    <div v-else>
      <div class="row g-3 mb-3">
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Active events</div>
              <div class="fs-4 fw-semibold">{{ totals.activeEventCount }}</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Topics</div>
              <div class="fs-4 fw-semibold">{{ totals.topicCount }}</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Event articles</div>
              <div class="fs-4 fw-semibold">{{ totals.eventLinkedArticles }}</div>
            </div>
          </div>
        </div>
        <div class="col-md-3">
          <div class="card h-100">
            <div class="card-body">
              <div class="text-muted small text-uppercase">Topic coverage</div>
              <div class="fs-4 fw-semibold">{{ formatPercent(totals.topicCoveragePercent) }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-body">
              <h5 class="mb-3">Event health</h5>
              <dl class="row mb-0">
                <dt class="col-7 fw-normal text-muted">Unclustered articles</dt>
                <dd class="col-5 text-end">{{ totals.unclusteredArticles }}</dd>
                <dt class="col-7 fw-normal text-muted">Articles linked to events</dt>
                <dd class="col-5 text-end">{{ totals.eventLinkedArticles }}</dd>
                <dt class="col-7 fw-normal text-muted">New events created</dt>
                <dd class="col-5 text-end">{{ totals.eventCount }}</dd>
                <dt class="col-7 fw-normal text-muted">Unassigned articles</dt>
                <dd class="col-5 text-end">{{ totals.unassignedArticles }}</dd>
                <dt class="col-7 fw-normal text-muted">Event reuse ratio</dt>
                <dd class="col-5 text-end">{{ formatPercent(totals.eventReuseRatio) }}</dd>
                <dt class="col-7 fw-normal text-muted">New event ratio</dt>
                <dd class="col-5 text-end">{{ formatPercent(totals.newEventRatio) }}</dd>
                <dt class="col-7 fw-normal text-muted">Average articles per event</dt>
                <dd class="col-5 text-end">{{ formatNumber(totals.averageArticlesPerEvent) }}</dd>
                <dt class="col-7 fw-normal text-muted">Largest event size</dt>
                <dd class="col-5 text-end">{{ totals.largestEventSize }} articles</dd>
              </dl>
            </div>
          </div>
        </div>

        <div class="col-lg-6">
          <div class="card h-100">
            <div class="card-body">
              <h5 class="mb-3">Topic health</h5>
              <dl class="row mb-0">
                <dt class="col-7 fw-normal text-muted">Topics</dt>
                <dd class="col-5 text-end">{{ totals.topicCount }}</dd>
                <dt class="col-7 fw-normal text-muted">Topics with events</dt>
                <dd class="col-5 text-end">{{ totals.topicsWithEvents }}</dd>
                <dt class="col-7 fw-normal text-muted">Events linked to topics</dt>
                <dd class="col-5 text-end">{{ totals.eventsLinkedToTopics }}</dd>
                <dt class="col-7 fw-normal text-muted">Events without topics</dt>
                <dd class="col-5 text-end">{{ totals.eventsWithoutTopics }}</dd>
                <dt class="col-7 fw-normal text-muted">Articles linked to topics</dt>
                <dd class="col-5 text-end">{{ totals.articlesLinkedToTopics }}</dd>
                <dt class="col-7 fw-normal text-muted">Average events per topic</dt>
                <dd class="col-5 text-end">{{ formatNumber(totals.averageEventsPerTopic) }}</dd>
              </dl>
            </div>
          </div>
        </div>
      </div>

      <div class="row g-3 mb-3">
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-body">
              <h5 class="mb-3">Event sizes</h5>
              <div v-if="eventSizeBuckets.length" class="d-flex flex-column gap-2">
                <div v-for="bucket in eventSizeBuckets" :key="bucket.bucket" class="d-flex justify-content-between">
                  <span class="text-muted">Events with {{ bucket.bucket }} {{ bucket.bucket === '1' ? 'article' : 'articles' }}</span>
                  <span>{{ bucket.count }}</span>
                </div>
              </div>
              <div v-else class="text-muted">No event sizes yet.</div>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-body">
              <h5 class="mb-3">Event statuses</h5>
              <div v-if="eventStatuses.length" class="d-flex flex-column gap-2">
                <div v-for="status in eventStatuses" :key="status.status" class="d-flex justify-content-between">
                  <span class="text-muted text-capitalize">{{ status.status }}</span>
                  <span>{{ status.count }}</span>
                </div>
              </div>
              <div v-else class="text-muted">No events yet.</div>
            </div>
          </div>
        </div>
        <div class="col-lg-4">
          <div class="card h-100">
            <div class="card-body">
              <h5 class="mb-3">Topic types</h5>
              <div v-if="topicTypes.length" class="d-flex flex-column gap-2">
                <div v-for="type in topicTypes" :key="type.topicType" class="d-flex justify-content-between">
                  <span class="text-muted text-capitalize">{{ type.topicType }}</span>
                  <span>{{ type.count }}</span>
                </div>
              </div>
              <div v-else class="text-muted">No topics yet.</div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!events.length && !topics.length" class="alert alert-info mb-3">
        Events and topics will appear here after articles have been clustered.
      </div>

      <div v-else class="row g-3 mb-3">
        <div class="col-lg-6">
          <h5 class="mb-2">Largest events</h5>
          <div class="list-group">
            <div v-for="event in events" :key="event.id" class="list-group-item">
              <div class="d-flex justify-content-between gap-3">
                <div>
                  <div class="fw-semibold">{{ event.name || `Event #${event.id}` }}</div>
                  <div class="text-muted small">
                    {{ event.articleCount }} articles · {{ event.topicCount }} topics · {{ formatDate(event.updatedAt) }}
                  </div>
                </div>
                <span class="badge align-self-start" :class="statusClass(event.status)">
                  {{ event.status }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="col-lg-6">
          <h5 class="mb-2">Recent topics</h5>
          <div class="list-group">
            <div v-for="topic in topics" :key="topic.id" class="list-group-item">
              <div class="d-flex justify-content-between gap-3">
                <div>
                  <div class="fw-semibold">{{ topic.name }}</div>
                  <div class="text-muted small">
                    {{ topic.linkedEventCount }} events · {{ topic.linkedArticleCount }} articles · {{ formatDate(topic.lastActivityAt) }}
                  </div>
                </div>
                <span class="badge align-self-start" :class="topicTypeClass(topic.topicType)">
                  {{ topic.topicType }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="d-flex justify-content-end">
      <button type="button" class="btn btn-secondary" @click="reload" :disabled="loading">Refresh</button>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
:global(:root[data-theme='dark']) {
  .card {
    --bs-card-bg: var(--bg-modal);
    --bs-card-border-color: var(--border-color);
    --bs-card-color: var(--text-inverted);
  }

  .list-group {
    --bs-list-group-bg: var(--bg-modal);
    --bs-list-group-color: var(--text-inverted);
    --bs-list-group-border-color: var(--border-color);
    --bs-list-group-action-hover-bg: var(--bg-control);
    --bs-list-group-action-hover-color: var(--text-inverted);
  }
}
</style>

<script>
import { fetchTopicsOverview } from '../../api/settings';

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
      return status === 'archived' ? 'text-bg-secondary' : 'text-bg-success';
    },
    topicTypeClass(topicType) {
      return {
        event: 'text-bg-primary',
        behavioral: 'text-bg-info',
        hybrid: 'text-bg-success'
      }[topicType] || 'text-bg-secondary';
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
