<template>
    <form class="smart-folder-config" @submit.prevent="save">
        <div class="smart-folder-config__top">
            <label class="smart-folder-field smart-folder-field--name">
                <span>Name</span>
                <input
                    v-model.trim="draftConfig.name"
                    type="text"
                    class="app-form-control"
                    placeholder="e.g. Hot AI Articles"
                />
            </label>

            <label class="smart-folder-field smart-folder-field--limit">
                <span>Maximum articles</span>
                <select v-model.number="draftConfig.limitCount" class="app-form-select">
                    <option :value="50">50</option>
                    <option :value="100">100</option>
                    <option :value="250">250</option>
                    <option :value="500">500</option>
                </select>
            </label>
        </div>

        <div class="smart-folder-config-grid">
            <!-- Status -->
            <fieldset class="smart-folder-panel">
                <legend>
                    Status
                    <BootstrapIcon icon="info-circle-fill" title="Filter by read state and engagement markers. Read and unread cannot be combined." />
                </legend>

                <label class="smart-folder-check">
                    <input
                        v-model="draftConfig.status.unread"
                        type="checkbox"
                        class="app-form-check-input"
                        :disabled="draftConfig.status.read"
                        @change="onStatusFilterChange('unread')"
                    />
                    <BootstrapIcon icon="record-circle-fill" />
                    Unread
                </label>

                <label class="smart-folder-check">
                    <input
                        v-model="draftConfig.status.read"
                        type="checkbox"
                        class="app-form-check-input"
                        :disabled="draftConfig.status.unread"
                        @change="onStatusFilterChange('read')"
                    />
                    <BootstrapIcon icon="circle-fill" />
                    Read
                </label>

                <label class="smart-folder-check">
                    <input v-model="draftConfig.status.favorite" class="app-form-check-input" type="checkbox" />
                    <BootstrapIcon icon="bookmark-fill" />
                    Favorited
                </label>

                <label class="smart-folder-check">
                    <input v-model="draftConfig.status.clicked" class="app-form-check-input" type="checkbox" />
                    <BootstrapIcon icon="arrow-up-right-square-fill" />
                    Clicked
                </label>

                <label class="smart-folder-check">
                    <input v-model="draftConfig.status.hot" class="app-form-check-input" type="checkbox" />
                    <BootstrapIcon icon="fire" />
                    Hot
                </label>
            </fieldset>

            <!-- Date -->
            <fieldset class="smart-folder-panel">
                <legend>
                    Date / Time
                    <BootstrapIcon icon="info-circle-fill" title="Limit results to a fixed date range or a relative first-seen window." />
                </legend>

                <label class="smart-folder-field">
                    <span>Date range</span>
                    <select v-model="draftConfig.date.preset" class="app-form-select" :disabled="draftConfig.date.useRelative">
                        <option value="">Any time</option>
                        <option value="@today">Today</option>
                        <option value="@yesterday">Yesterday</option>
                        <option value="@lastweek">Last week</option>
                        <option value="@last7days">Last 7 days</option>
                        <option value="@last30days">Last 30 days</option>
                    </select>
                </label>

                <label class="smart-folder-check smart-folder-check--switch">
                    <input v-model="draftConfig.date.useRelative" class="app-form-check-input" type="checkbox" />
                    Relative range
                </label>

                <div v-if="draftConfig.date.useRelative" class="smart-folder-inline-fields">
                    <input
                        v-model.number="draftConfig.date.relativeAmount"
                        type="number"
                        min="1"
                        max="365"
                        class="app-form-control"
                    />

                    <select v-model="draftConfig.date.relativeUnit" class="app-form-select">
                        <option value="h">hours</option>
                        <option value="d">days</option>
                    </select>

                    <span>ago</span>
                </div>
            </fieldset>

            <!-- Content -->
            <fieldset class="smart-folder-panel">
                <legend>
                    Content
                    <BootstrapIcon icon="info-circle-fill" title="Match articles by one tag, title text, author, language, or free-text search." />
                </legend>

                <label class="smart-folder-field">
                    <span>Tags</span>
                    <input
                        v-model.trim="draftConfig.content.tags"
                        type="text"
                        class="app-form-control"
                        placeholder="ai"
                        @keydown="preventTagSeparator"
                        @input="normalizeDraftTag"
                    />
                </label>

                <label class="smart-folder-field">
                    <span>Title contains</span>
                    <input
                        v-model.trim="draftConfig.content.title"
                        type="text"
                        class="app-form-control"
                        placeholder="e.g. javascript"
                    />
                </label>

                <label class="smart-folder-field">
                    <span>Author</span>
                    <input
                        v-model.trim="draftConfig.content.author"
                        type="text"
                        class="app-form-control"
                        placeholder="e.g. John Doe"
                    />
                </label>

                <label class="smart-folder-field">
                    <span>Free text</span>
                    <input
                        v-model.trim="draftConfig.content.text"
                        type="text"
                        class="app-form-control"
                        placeholder="Search in article text"
                    />
                </label>
            </fieldset>

            <!-- Quality -->
            <fieldset v-if="aiEnabled" class="smart-folder-panel">
                <legend>
                    Quality & Scores
                    <BootstrapIcon icon="info-circle-fill" title="Set minimum quality and freshness thresholds for matching articles." />
                </legend>

                <label class="smart-folder-range">
                    <span>Minimum quality</span>
                    <strong>{{ Number(draftConfig.scores.quality).toFixed(2) }}</strong>
                    <input
                        v-model.number="draftConfig.scores.quality"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                    />
                </label>

                <label class="smart-folder-range">
                    <span>Minimum freshness</span>
                    <strong>{{ Number(draftConfig.scores.freshness).toFixed(2) }}</strong>
                    <input
                        v-model.number="draftConfig.scores.freshness"
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                    />
                </label>
            </fieldset>

            <!-- Events -->
            <fieldset v-if="aiEnabled" class="smart-folder-panel">
                <legend>
                    Events & Clusters
                    <BootstrapIcon icon="info-circle-fill" title="Filter by event membership, developing-story state, or minimum event size." />
                </legend>

                <label class="smart-folder-check">
                    <input
                        v-model="draftConfig.events.isEvent"
                        type="checkbox"
                        class="app-form-check-input"
                        :disabled="draftConfig.events.useMinimumCount || draftConfig.events.isDeveloping || draftConfig.events.isNotDeveloping"
                        @change="onEventFilterChange('isEvent')"
                    />
                    Is event
                </label>

                <label class="smart-folder-check">
                    <input
                        v-model="draftConfig.events.isNotEvent"
                        type="checkbox"
                        class="app-form-check-input"
                        :disabled="draftConfig.events.useMinimumCount || draftConfig.events.isDeveloping || draftConfig.events.isNotDeveloping"
                        @change="onEventFilterChange('isNotEvent')"
                    />
                    Is not event
                </label>

                <label class="smart-folder-check">
                    <input
                        v-model="draftConfig.events.isDeveloping"
                        type="checkbox"
                        class="app-form-check-input"
                        :disabled="draftConfig.events.isNotEvent || draftConfig.events.isNotDeveloping"
                        @change="onEventFilterChange('isDeveloping')"
                    />
                    Is developing story
                </label>

                <label class="smart-folder-check">
                    <input
                        v-model="draftConfig.events.isNotDeveloping"
                        type="checkbox"
                        class="app-form-check-input"
                        :disabled="draftConfig.events.isDeveloping"
                        @change="onEventFilterChange('isNotDeveloping')"
                    />
                    Is not developing story
                </label>

                <label class="smart-folder-check">
                    <input v-model="draftConfig.events.useMinimumCount" class="app-form-check-input" type="checkbox" :disabled="draftConfig.events.isDeveloping || draftConfig.events.isNotDeveloping" @change="onEventFilterChange('useMinimumCount')" />
                    Minimum articles in event / cluster
                </label>

                <div v-if="draftConfig.events.useMinimumCount" class="smart-folder-inline-fields">
                    <select v-model.number="draftConfig.events.minimumCount" class="app-form-select">
                        <option :value="2">2</option>
                        <option :value="3">3</option>
                        <option :value="5">5</option>
                        <option :value="10">10</option>
                    </select>

                    <span>articles or more</span>
                </div>
            </fieldset>

            <!-- Sorting -->
            <fieldset class="smart-folder-panel">
                <legend>
                    Sorting
                    <BootstrapIcon icon="info-circle-fill" title="Choose how matching articles are ordered, or leave sorting unchanged." />
                </legend>

                <label class="smart-folder-field">
                    <span>Sort by</span>
                    <select v-model="draftConfig.sort.field" class="app-form-select">
                        <option value="">None</option>
                        <option value="trust">Trust</option>
                        <option v-if="aiEnabled" value="recommended">Recommended</option>
                        <option v-if="aiEnabled" value="attention">Most Engaged</option>
                        <option v-if="aiEnabled" value="quality">Quality</option>
                        <option value="published-desc">Published date (newest)</option>
                        <option value="published-asc">Published date (oldest)</option>
                    </select>
                </label>

                <label class="smart-folder-field">
                    <span>Language</span>
                    <select v-model="draftConfig.content.language" class="app-form-select">
                        <option value="">Any language</option>
                        <option value="en">English</option>
                        <option value="nl">Dutch</option>
                        <option value="de">German</option>
                        <option value="fr">French</option>
                        <option value="es">Spanish</option>
                    </select>
                </label>
            </fieldset>
        </div>

        <div class="smart-folder-generated-query">
            <span>Generated query</span>

            <code :class="{ 'input-invalid': generatedQueryInvalid }" :title="generatedQueryError">{{ generatedSmartFolderQuery }}</code>

            <button
                type="button"
                class="app-button app-button--icon-only smart-folder-query-copy"
                title="Copy query"
                aria-label="Copy generated query"
                @click="copyGeneratedQuery"
            >
                <BootstrapIcon icon="copy" />
            </button>
        </div>

        <p v-if="generatedQueryInvalid" class="smart-folder-query-error">
            {{ generatedQueryError }}
        </p>

        <div class="smart-folder-config-actions">
            <button type="button" class="app-button app-button--outline-danger smart-folder-config-delete" @click="$emit('delete')">
                <BootstrapIcon icon="trash3-fill" />
                Delete
            </button>

            <button type="button" class="app-button app-button--outline-secondary" @click="$emit('cancel')">
                Cancel
            </button>

            <button type="button" class="app-button app-button--outline-secondary" @click="saveAsCopy">
                Save as copy
            </button>

            <button type="submit" class="app-button app-button--primary" :disabled="generatedQueryInvalid">
                Save and close
            </button>
        </div>
    </form>
</template>

<script>
import { validateSmartFolderQuery } from '../../../services/queryValidation';
import {
    buildSmartFolderQuery,
    createEmptySmartFolderConfig,
    normalizeSmartFolderTag,
    parseSmartFolderQuery
} from './smartFolderQuery.js';

// Builds an isolated editor draft from one stored Smart Folder.
function createEditorDraft(smartFolder) {
    const config = createEmptySmartFolderConfig();
    config.name = smartFolder?.name || '';
    config.limitCount = Number(smartFolder?.limitCount) || 50;
    return parseSmartFolderQuery(smartFolder?.query || '', config);
}

export default {
    emits: ['cancel', 'delete', 'save', 'save-copy', 'validation-change'],
    props: {
        smartFolder: { type: Object, required: true },
        aiEnabled: { type: Boolean, default: false }
    },
    // This function creates an editor-owned draft so parent collection data is never mutated.
    data() {
        return {
            draftConfig: createEditorDraft(this.smartFolder)
        };
    },
    computed: {
        // This function returns the stored query represented by the current draft.
        generatedSmartFolderQuery() {
            return buildSmartFolderQuery(this.draftConfig);
        },
        // This function validates the generated query through the shared query contract.
        generatedQueryValidation() {
            return validateSmartFolderQuery(this.generatedSmartFolderQuery);
        },
        // This function reports whether the current draft prevents saving.
        generatedQueryInvalid() {
            return !this.generatedQueryValidation.valid;
        },
        // This function returns the current query validation message.
        generatedQueryError() {
            return this.generatedQueryValidation.error;
        }
    },
    watch: {
        generatedQueryInvalid: {
            immediate: true,
            // This function keeps the coordinator's global save guard synchronized.
            handler(invalid) {
                this.$emit('validation-change', invalid);
            }
        }
    },
    methods: {
        // This function returns the current draft in the parent collection's persisted shape.
        getFolderUpdate() {
            return {
                name: this.draftConfig.name,
                query: this.generatedSmartFolderQuery,
                limitCount: this.draftConfig.limitCount
            };
        },
        // This function prevents read and unread filters from remaining selected together.
        onStatusFilterChange(changedKey) {
            if (changedKey === 'unread' && this.draftConfig.status.unread) {
                this.draftConfig.status.read = false;
            }

            if (changedKey === 'read' && this.draftConfig.status.read) {
                this.draftConfig.status.unread = false;
            }
        },
        // This function preserves the existing mutually exclusive event filter choices.
        onEventFilterChange(changedKey) {
            if (changedKey === 'isEvent' && this.draftConfig.events.isEvent) {
                this.draftConfig.events.isNotEvent = false;
                this.draftConfig.events.isDeveloping = false;
                this.draftConfig.events.isNotDeveloping = false;
                this.draftConfig.events.useMinimumCount = false;
            }

            if (changedKey === 'isNotEvent' && this.draftConfig.events.isNotEvent) {
                this.draftConfig.events.isEvent = false;
                this.draftConfig.events.isDeveloping = false;
                this.draftConfig.events.isNotDeveloping = false;
                this.draftConfig.events.useMinimumCount = false;
            }

            if (changedKey === 'isDeveloping' && this.draftConfig.events.isDeveloping) {
                this.draftConfig.events.isEvent = false;
                this.draftConfig.events.isNotEvent = false;
                this.draftConfig.events.isNotDeveloping = false;
                this.draftConfig.events.useMinimumCount = false;
            }

            if (changedKey === 'isNotDeveloping' && this.draftConfig.events.isNotDeveloping) {
                this.draftConfig.events.isEvent = false;
                this.draftConfig.events.isNotEvent = false;
                this.draftConfig.events.isDeveloping = false;
                this.draftConfig.events.useMinimumCount = false;
            }

            if (changedKey === 'useMinimumCount' && this.draftConfig.events.useMinimumCount) {
                this.draftConfig.events.isEvent = false;
                this.draftConfig.events.isNotEvent = false;
                this.draftConfig.events.isDeveloping = false;
                this.draftConfig.events.isNotDeveloping = false;
            }
        },
        // This function reduces tag input to the single supported tag.
        normalizeDraftTag() {
            this.draftConfig.content.tags = normalizeSmartFolderTag(this.draftConfig.content.tags);
        },
        // This function prevents separators that would create unsupported multiple tags.
        preventTagSeparator(event) {
            if (event.key === ',' || event.key === ' ') {
                event.preventDefault();
            }
        },
        // This function copies the current generated query when Clipboard support is available.
        async copyGeneratedQuery() {
            await navigator.clipboard?.writeText(this.generatedSmartFolderQuery);
        },
        // This function submits the current editor draft to replace the selected folder.
        save() {
            if (this.generatedQueryInvalid) return;
            this.$emit('save', this.getFolderUpdate());
        },
        // This function submits the current editor draft as a new folder.
        saveAsCopy() {
            if (this.generatedQueryInvalid) return;
            this.$emit('save-copy', this.getFolderUpdate());
        }
    }
};
</script>

<style scoped>
.smart-folder-config {
  padding: 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-subtle);
}

.smart-folder-config__top {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  gap: 16px;
  margin-bottom: 16px;
}

.smart-folder-config-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.smart-folder-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--bg-primary);
}

.smart-folder-panel legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: auto;
  margin: 0;
  padding: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.smart-folder-field,
.smart-folder-range {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.smart-folder-field span,
.smart-folder-range span {
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.smart-folder-check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 13px;
}

.smart-folder-range input {
  accent-color: var(--color-primary);
}

.smart-folder-inline-fields {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
}

.smart-folder-inline-fields .app-form-control,
.smart-folder-inline-fields .app-form-select {
  max-width: 112px;
}

.smart-folder-range {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
}

.smart-folder-range input {
  grid-column: 1 / -1;
}

.smart-folder-generated-query {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 14px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--bg-primary);
}

.smart-folder-generated-query span {
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 700;
}

.smart-folder-generated-query code {
  overflow: hidden;
  padding: 6px 9px;
  border-radius: var(--radius-control);
  background: var(--settings-query-code-bg);
  color: var(--settings-query-code-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.smart-folder-query-error {
  margin: 8px 0 0;
  color: var(--settings-danger-text);
  font-size: 13px;
}

.smart-folder-config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}

.smart-folder-config-actions .app-button {
  white-space: nowrap;
}

:global(:root[data-theme='dark']) .smart-folder-panel,
:global(:root[data-theme='dark']) .smart-folder-generated-query {
  background: var(--bg-modal);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark']) .smart-folder-config {
  background: var(--bg-control);
  border-color: var(--border-default);
}

@media (max-width: 1100px) {
  .smart-folder-config-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .smart-folder-config__top,
  .smart-folder-config-grid {
    grid-template-columns: 1fr;
  }

  .smart-folder-generated-query {
    grid-template-columns: 1fr auto;
  }

  .smart-folder-generated-query span {
    grid-column: 1 / -1;
  }

  .smart-folder-config-actions {
    flex-direction: column-reverse;
  }

  .smart-folder-config-actions .app-button {
    width: 100%;
  }
}
</style>
