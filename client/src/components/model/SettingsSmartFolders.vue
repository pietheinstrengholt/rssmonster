<template>
    <div class="settings-section settings-smart-folders">
        <!-- Info text -->
        <div class="settings-insight-card smart-folders-hero">
            <div class="smart-folders-hero__icon" aria-hidden="true">
                <BootstrapIcon icon="folder-fill" />
            </div>

            <div class="smart-folders-hero__content">
                <h3>Smart Folders</h3>
                <p>
                    Create dynamic saved searches that automatically organize your articles.
                    They update in real-time as new articles arrive.
                </p>
            </div>
        </div>

        <!-- Smart Folder Recommendations trigger & results -->
        <div class="smart-folders-toolbar">
            <div>
                <h4>Smart Folder Insights</h4>
                <p>Let RSSMonster analyze your reading history and suggest useful smart folders.</p>
            </div>

            <button
                type="button"
                class="btn btn-primary"
                @click="fetchSmartFolderInsights"
                :disabled="smartFolderInsightsLoading"
            >
                <span v-if="smartFolderInsightsLoading" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <BootstrapIcon v-else icon="stars" />
                <span>{{ smartFolderInsightsLoading ? 'Loading...' : 'Get insights' }}</span>
            </button>
        </div>

        <div v-if="smartFolderInsightsLoading" class="settings-group d-flex align-items-center gap-2">
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <span>Loading smart folder insights...</span>
        </div>

        <div v-if="smartFolderInsightsError" class="settings-group text-danger">
            {{ smartFolderInsightsError }}
        </div>

        <div v-if="smartFolderRecommendations.length" class="settings-group">
            <label>
                Smart Folder Suggestions
                <span class="info-icon" title="Suggested based on your reading behavior">
                    <BootstrapIcon icon="info-circle-fill" />
                </span>
            </label>

            <div
                v-for="(rec, index) in smartFolderRecommendations"
                :key="'rec-' + index"
                class="action-row"
            >
                <div class="d-flex justify-content-between align-items-start gap-3">
                    <div class="flex-grow-1">
                        <strong>{{ rec.name }}</strong>
                        <div class="text-muted small mt-1">{{ rec.reason }}</div>
                        <code class="d-block mt-2">{{ rec.query }}</code>
                    </div>

                    <button
                        type="button"
                        class="btn btn-add"
                        @click="applySmartFolderRecommendation(rec)"
                    >
                        <BootstrapIcon icon="plus-circle-fill" />
                        Add
                    </button>
                </div>
            </div>
        </div>

        <div
            v-else-if="smartFolderInsightsLoaded && !smartFolderInsightsLoading && !smartFolderInsightsError"
            class="settings-group text-muted small"
        >
            No smart folder insights available yet.
        </div>

        <!-- Smart Folders -->
        <div class="smart-folders-list-header">
            <div>
                <h4>Your Smart Folders</h4>
                <p>Click a smart folder to configure its filters and settings.</p>
            </div>

            <button type="button" class="btn btn-add" @click="addSmartFolder">
                <BootstrapIcon icon="plus-circle-fill" />
                Add Smart Folder
            </button>
        </div>

        <div class="smart-folders-list">
            <article
                v-for="(smartFolder, index) in smartFolders"
                :key="smartFolder.localId"
                class="smart-folder-card"
                :class="{ 'smart-folder-card--open': selectedSmartFolderId === smartFolder.localId }"
            >
                <!-- Collapsed row -->
                <div class="smart-folder-row-wrap">
                    <button
                        type="button"
                        class="smart-folder-row"
                        @click="toggleSmartFolder(smartFolder)"
                    >
                        <span class="smart-folder-row__drag" aria-hidden="true">
                            <BootstrapIcon icon="grip-vertical" />
                        </span>

                        <span class="smart-folder-row__icon" aria-hidden="true">
                            <BootstrapIcon :icon="smartFolder.icon || 'folder-fill'" />
                        </span>

                        <span class="smart-folder-row__main">
                            <strong>{{ smartFolder.name || 'Untitled smart folder' }}</strong>
                            <span>{{ querySummary(smartFolder) }}</span>
                        </span>

                        <span class="smart-folder-row__limit">
                            {{ smartFolder.limitCount || 50 }} max
                        </span>

                        <span class="smart-folder-row__status">
                            <span class="smart-folder-row__status-dot" aria-hidden="true"></span>
                            Active
                        </span>

                        <span class="smart-folder-row__chevron" aria-hidden="true">
                            <BootstrapIcon :icon="selectedSmartFolderId === smartFolder.localId ? 'chevron-up' : 'chevron-down'" />
                        </span>
                    </button>

                    <button
                        type="button"
                        class="btn btn-icon smart-folder-row__more"
                        title="Remove smart folder"
                        @click.stop="removeSmartFolder(index)"
                    >
                        <BootstrapIcon icon="three-dots-vertical" />
                    </button>
                </div>

                <!-- Expanded configuration panel -->
                <form
                    v-if="selectedSmartFolderId === smartFolder.localId"
                    class="smart-folder-config"
                    @submit.prevent="saveSmartFolderConfig(index)"
                >
                    <div class="smart-folder-config__top">
                        <label class="smart-folder-field smart-folder-field--name">
                            <span>Name</span>
                            <input
                                v-model.trim="draftConfig.name"
                                type="text"
                                class="form-control"
                                placeholder="e.g. Hot AI Articles"
                            />
                        </label>

                        <label class="smart-folder-field smart-folder-field--limit">
                            <span>Maximum articles</span>
                            <select v-model.number="draftConfig.limitCount" class="form-select">
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
                                    :disabled="draftConfig.status.unread"
                                    @change="onStatusFilterChange('read')"
                                />
                                <BootstrapIcon icon="circle-fill" />
                                Read
                            </label>

                            <label class="smart-folder-check">
                                <input v-model="draftConfig.status.favorite" type="checkbox" />
                                <BootstrapIcon icon="bookmark-fill" />
                                Favorited
                            </label>

                            <label class="smart-folder-check">
                                <input v-model="draftConfig.status.clicked" type="checkbox" />
                                <BootstrapIcon icon="arrow-up-right-square-fill" />
                                Clicked
                            </label>

                            <label class="smart-folder-check">
                                <input v-model="draftConfig.status.hot" type="checkbox" />
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
                                <select v-model="draftConfig.date.preset" class="form-select" :disabled="draftConfig.date.useRelative">
                                    <option value="">Any time</option>
                                    <option value="@today">Today</option>
                                    <option value="@yesterday">Yesterday</option>
                                    <option value="@lastweek">Last week</option>
                                    <option value="@last7days">Last 7 days</option>
                                    <option value="@last30days">Last 30 days</option>
                                </select>
                            </label>

                            <label class="smart-folder-check smart-folder-check--switch">
                                <input v-model="draftConfig.date.useRelative" type="checkbox" />
                                Relative range
                            </label>

                            <div v-if="draftConfig.date.useRelative" class="smart-folder-inline-fields">
                                <input
                                    v-model.number="draftConfig.date.relativeAmount"
                                    type="number"
                                    min="1"
                                    max="365"
                                    class="form-control"
                                />

                                <select v-model="draftConfig.date.relativeUnit" class="form-select">
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
                                    class="form-control"
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
                                    class="form-control"
                                    placeholder="e.g. javascript"
                                />
                            </label>

                            <label class="smart-folder-field">
                                <span>Author</span>
                                <input
                                    v-model.trim="draftConfig.content.author"
                                    type="text"
                                    class="form-control"
                                    placeholder="e.g. John Doe"
                                />
                            </label>

                            <label class="smart-folder-field">
                                <span>Free text</span>
                                <input
                                    v-model.trim="draftConfig.content.text"
                                    type="text"
                                    class="form-control"
                                    placeholder="Search in article text"
                                />
                            </label>
                        </fieldset>

                        <!-- Quality -->
                        <fieldset class="smart-folder-panel">
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
                        <fieldset class="smart-folder-panel">
                            <legend>
                                Events & Clusters
                                <BootstrapIcon icon="info-circle-fill" title="Filter for event articles, non-event articles, or events with a minimum article count." />
                            </legend>

                            <label class="smart-folder-check">
                                <input
                                    v-model="draftConfig.events.isEvent"
                                    type="checkbox"
                                    :disabled="draftConfig.events.useMinimumCount"
                                    @change="onEventFilterChange('isEvent')"
                                />
                                Is event
                            </label>

                            <label class="smart-folder-check">
                                <input
                                    v-model="draftConfig.events.isNotEvent"
                                    type="checkbox"
                                    :disabled="draftConfig.events.useMinimumCount"
                                    @change="onEventFilterChange('isNotEvent')"
                                />
                                Is not event
                            </label>

                            <label class="smart-folder-check">
                                <input v-model="draftConfig.events.useMinimumCount" type="checkbox" @change="onEventFilterChange('useMinimumCount')" />
                                Minimum articles in event / cluster
                            </label>

                            <div v-if="draftConfig.events.useMinimumCount" class="smart-folder-inline-fields">
                                <select v-model.number="draftConfig.events.minimumCount" class="form-select">
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
                                <select v-model="draftConfig.sort.field" class="form-select">
                                    <option value="">None</option>
                                    <option value="recommended">Recommended</option>
                                    <option value="attention">Most Engaged</option>
                                    <option value="quality">Quality</option>
                                    <option value="published-desc">Published date (newest)</option>
                                    <option value="published-asc">Published date (oldest)</option>
                                </select>
                            </label>

                            <label class="smart-folder-field">
                                <span>Language</span>
                                <select v-model="draftConfig.content.language" class="form-select">
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

                    <!-- Generated query -->
                    <div class="smart-folder-generated-query">
                        <span>Generated query</span>

                        <code :class="{ 'input-invalid': generatedQueryInvalid }" :title="generatedQueryError">{{ generatedSmartFolderQuery }}</code>

                        <button
                            type="button"
                            class="btn btn-icon"
                            title="Copy query"
                            @click="copyGeneratedQuery"
                        >
                            <BootstrapIcon icon="copy" />
                        </button>
                    </div>

                    <p v-if="generatedQueryInvalid" class="smart-folder-query-error">
                        {{ generatedQueryError }}
                    </p>

                    <!-- Actions -->
                    <div class="smart-folder-config-actions">
                        <button type="button" class="btn btn-outline-danger smart-folder-config-delete" @click="removeSmartFolder(index)">
                            <BootstrapIcon icon="trash3-fill" />
                            Delete
                        </button>

                        <button type="button" class="btn btn-outline-secondary" @click="cancelSmartFolderConfig">
                            Cancel
                        </button>

                        <button type="button" class="btn btn-outline-secondary" @click="saveSmartFolderAsCopy">
                            Save as copy
                        </button>

                        <button type="submit" class="btn btn-primary" :disabled="generatedQueryInvalid">
                            Save and close
                        </button>
                    </div>
                </form>
            </article>
        </div>

        <div class="settings-section__actions">
            <button class="btn btn-primary smart-folders-save" @click="save" :disabled="hasInvalidSmartFolders">Save Changes</button>
        </div>
    </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
.settings-section {
  max-width: 1100px;
}

.settings-smart-folders {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.smart-folders-hero,
.smart-folders-toolbar,
.smart-folders-list-header {
  margin: 0;
}

.smart-folders-hero {
  align-items: center;
}

.smart-folders-hero__icon,
.smart-folder-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--bg-surface-muted);
  color: var(--color-primary);
}

.smart-folders-hero__icon {
  width: 52px;
  height: 52px;
  flex: 0 0 52px;
  font-size: 22px;
}

.smart-folders-hero__content {
  flex: 1;
}

.smart-folders-hero__content h3,
.smart-folders-toolbar h4,
.smart-folders-list-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.smart-folders-hero__content p,
.smart-folders-toolbar p,
.smart-folders-list-header p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.smart-folders-toolbar,
.smart-folders-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.smart-folders-toolbar .btn,
.smart-folders-list-header .btn,
.smart-folder-config-actions .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  white-space: nowrap;
}

.smart-folders-list {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--bg-primary);
}

.smart-folder-card + .smart-folder-card {
  border-top: 1px solid var(--border-subtle);
}

.smart-folder-row-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  align-items: stretch;
}

.smart-folder-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  width: 100%;
  gap: 16px;
  padding: 16px;
  border: 0;
  background: var(--color-transparent);
  color: var(--text-primary);
  text-align: left;
}

.smart-folder-row:hover,
.smart-folder-row__more:hover {
  background: var(--bg-hover);
}

.smart-folder-card--open .smart-folder-row,
.smart-folder-card--open .smart-folder-row__more {
  background: var(--bg-selected);
}

.smart-folder-row__drag,
.smart-folder-row__chevron {
  color: var(--text-muted);
}

.smart-folder-row__icon {
  width: 40px;
  height: 40px;
}

.smart-folder-row__main {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.smart-folder-row__main strong {
  overflow: hidden;
  color: var(--text-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.smart-folder-row__main span {
  overflow: hidden;
  color: var(--text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.smart-folder-row__limit {
  padding: 5px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-surface-muted);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.smart-folder-row__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
}

.smart-folder-row__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--color-success);
}

.smart-folder-row__more {
  width: 42px;
  min-height: 100%;
  padding: 0;
  border-radius: 0;
  color: var(--text-secondary);
}

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
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
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

.smart-folder-check input,
.smart-folder-range input {
  accent-color: var(--color-primary);
}

.smart-folder-inline-fields {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
}

.smart-folder-inline-fields .form-control,
.smart-folder-inline-fields .form-select {
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
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
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
  border-radius: 6px;
  background: var(--settings-query-code-bg);
  color: var(--settings-query-code-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.smart-folder-query-error {
  margin: 8px 0 0;
  color: var(--text-danger);
  font-size: 13px;
}

.smart-folder-config-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}

.smart-folders-save {
  display: inline-flex;
  height: 42px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--color-primary) !important;
  border: 0;
  border-radius: 8px;
  color: var(--text-inverted);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.smart-folders-save:hover:not(:disabled) {
  background: var(--color-primary-hover) !important;
}

.smart-folders-save:disabled {
  cursor: not-allowed;
  opacity: 0.90;
}

:global(:root[data-theme='dark']) .smart-folder-panel,
:global(:root[data-theme='dark']) .smart-folders-list,
:global(:root[data-theme='dark']) .smart-folder-generated-query {
  background: var(--bg-modal);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .smart-folder-config {
  background: var(--bg-control);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .smart-folder-row__icon,
:global(:root[data-theme='dark']) .smart-folders-hero__icon {
  background: var(--bg-control);
}

@media (max-width: 1100px) {
  .smart-folder-config-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .smart-folders-toolbar,
  .smart-folders-list-header,
  .smart-folders-hero {
    align-items: stretch;
    flex-direction: column;
  }

  .smart-folder-row {
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    gap: 12px;
  }

  .smart-folder-row__limit,
  .smart-folder-row__status {
    display: none;
  }

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

  .smart-folder-config-actions .btn,
  .smart-folders-list-header .btn,
  .smart-folders-toolbar .btn {
    width: 100%;
  }
}
</style>

<script>
import { saveSmartFolders, fetchSmartFolderInsights } from '../../api/smartfolders';
import { setAuthToken } from '../../api/client';
import { validateSmartFolderQuery } from '../../services/queryValidation';

const createEmptySmartFolderConfig = () => ({
    name: '',
    limitCount: 50,
    status: {
        unread: false,
        read: false,
        favorite: false,
        clicked: false,
        hot: false
    },
    date: {
        preset: '',
        useRelative: false,
        relativeAmount: 7,
        relativeUnit: 'd'
    },
    content: {
        tags: '',
        title: '',
        author: '',
        text: '',
        language: ''
    },
    scores: {
        quality: 0,
        freshness: 0
    },
    events: {
        isEvent: false,
        isNotEvent: false,
        useMinimumCount: false,
        minimumCount: 2
    },
    sort: {
        field: 'recommended'
    }
});

const tokenizeQuery = query => String(query || '').match(/(?:[A-Za-z]+:)?"[^"]*"|\S+/g) || [];

const stripQuotes = value => String(value || '').replace(/^"|"$/g, '').replace(/\\"/g, '"');

const quoteIfNeeded = value => (
    /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value
);

export default {
    emits: ['close', 'saved'],
    data() {
        return {
            smartFolders: [],
            selectedSmartFolderId: null,
            draftConfig: createEmptySmartFolderConfig(),
            smartFolderRecommendations: [],
            smartFolderInsightsLoading: false,
            smartFolderInsightsLoaded: false,
            smartFolderInsightsError: null
        };
    },
    created() {
        setAuthToken(this.$store.auth.token);
        this.fetchSmartFolders();
    },
    computed: {
        generatedSmartFolderQuery() {
            const parts = [];

            if (this.draftConfig.status.unread) parts.push('unread:true');
            if (this.draftConfig.status.read) parts.push('read:true');
            if (this.draftConfig.status.favorite) parts.push('favorite:true');
            if (this.draftConfig.status.clicked) parts.push('clicked:true');
            if (this.draftConfig.status.hot) parts.push('hot:true');

            if (this.draftConfig.date.useRelative && this.draftConfig.date.relativeAmount) {
                parts.push(`firstSeen:${this.draftConfig.date.relativeAmount}${this.draftConfig.date.relativeUnit}`);
            } else if (this.draftConfig.date.preset === '@last7days') {
                parts.push('firstSeen:7d');
            } else if (this.draftConfig.date.preset === '@last30days') {
                parts.push('firstSeen:30d');
            } else if (this.draftConfig.date.preset) {
                parts.push(this.draftConfig.date.preset);
            }

            if (this.draftConfig.content.tags.trim()) {
                parts.push(`tag:${this.normalizeTagValue(this.draftConfig.content.tags)}`);
            }

            if (this.draftConfig.content.title) parts.push(`title:${quoteIfNeeded(this.draftConfig.content.title)}`);
            if (this.draftConfig.content.author) parts.push(`author:${quoteIfNeeded(this.draftConfig.content.author)}`);
            if (this.draftConfig.content.language) parts.push(`language:${this.draftConfig.content.language}`);
            if (this.draftConfig.content.text) parts.push(quoteIfNeeded(this.draftConfig.content.text));

            if (this.draftConfig.scores.quality > 0) parts.push(`quality:>=${Number(this.draftConfig.scores.quality).toFixed(2)}`);
            if (this.draftConfig.scores.freshness > 0) parts.push(`freshness:>=${Number(this.draftConfig.scores.freshness).toFixed(2)}`);

            if (this.draftConfig.events.isEvent) parts.push('event:true');
            if (this.draftConfig.events.isNotEvent) parts.push('event:false');
            if (this.draftConfig.events.useMinimumCount) parts.push(`eventCount:>=${this.draftConfig.events.minimumCount}`);
            if (this.draftConfig.sort.field === 'published-desc') {
                parts.push('sort:desc');
            } else if (this.draftConfig.sort.field === 'published-asc') {
                parts.push('sort:asc');
            } else if (this.draftConfig.sort.field) {
                parts.push(`sort:${this.draftConfig.sort.field}`);
            }

            parts.push(`limit:${this.draftConfig.limitCount}`);

            return parts.join(' ');
        },
        generatedQueryValidation() {
            return validateSmartFolderQuery(this.generatedSmartFolderQuery);
        },
        generatedQueryInvalid() {
            return !this.generatedQueryValidation.valid;
        },
        generatedQueryError() {
            return this.generatedQueryValidation.error;
        },
        hasInvalidSmartFolders() {
            if (this.selectedSmartFolderId !== null && this.generatedQueryInvalid) return true;

            return this.smartFolders.some(sf => {
                if (!sf.name || sf.name.trim() === '') return false;
                const { valid } = validateSmartFolderQuery(sf.query || '');
                return !valid;
            });
        }
    },
    methods: {
        async fetchSmartFolders() {
            this.smartFolders = this.$store.data.smartFolders.map((sf, index) => ({
                localId: sf.id || `local-${index}-${Date.now()}`,
                id: sf.id,
                name: sf.name,
                query: sf.query,
                limitCount: sf.limitCount || 50
            }));
        },
        async fetchSmartFolderInsights() {
            try {
                this.smartFolderInsightsLoading = true;
                this.smartFolderInsightsError = null;
                const resp = await fetchSmartFolderInsights();

                console.log('Smart Folder Insights response:', resp.data);

                this.smartFolderRecommendations =
                    resp.data?.recommendations?.smartFolders || [];
            } catch (err) {
                console.error('Failed to fetch smart folder insights:', err);
                this.smartFolderInsightsError = 'Failed to load smart folder insights. Please try again.';
            }
            this.smartFolderInsightsLoading = false;
            this.smartFolderInsightsLoaded = true;
        },
        applySmartFolderRecommendation(rec) {
            if (!rec || !rec.name || !rec.query) return;

            // Avoid duplicates by query
            const exists = this.smartFolders.some(
                sf => sf.query.trim() === rec.query.trim()
            );

            if (exists) {
                alert('This Smart Folder already exists.');
                return;
            }

            this.smartFolders.push({
                localId: `local-${Date.now()}`,
                name: rec.name,
                query: rec.query,
                limitCount: 50
            });
        },
        addSmartFolder() {
            const smartFolder = {
                localId: `local-${Date.now()}`,
                name: 'New Smart Folder',
                query: 'sort:recommended limit:50',
                limitCount: 50
            };

            this.smartFolders.push(smartFolder);
            this.toggleSmartFolder(smartFolder);
        },
        removeSmartFolder(index) {
            if (this.selectedSmartFolderId === this.smartFolders[index]?.localId) {
                this.cancelSmartFolderConfig();
            }

            this.smartFolders.splice(index, 1);
        },
        querySummary(smartFolder) {
            return smartFolder.query || 'No filters configured yet';
        },
        resetDraftConfig() {
            this.draftConfig = createEmptySmartFolderConfig();
        },
        toggleSmartFolder(smartFolder) {
            if (this.selectedSmartFolderId === smartFolder.localId) {
                this.cancelSmartFolderConfig();
                return;
            }

            this.selectedSmartFolderId = smartFolder.localId;
            this.loadSmartFolderIntoDraft(smartFolder);
        },
        loadSmartFolderIntoDraft(smartFolder) {
            this.resetDraftConfig();

            this.draftConfig.name = smartFolder.name || '';
            this.draftConfig.limitCount = Number(smartFolder.limitCount) || 50;

            // Keep parsing intentionally small; unknown tokens remain visible as free text.
            this.parseExistingQueryIntoDraft(smartFolder.query || '');
        },
        parseExistingQueryIntoDraft(query) {
            const freeText = [];

            tokenizeQuery(query).forEach(token => {
                const cleaned = token.replace(/[.,;]+$/, '');
                const lower = cleaned.toLowerCase();

                if (lower === 'unread:true') {
                    this.draftConfig.status.unread = true;
                    this.draftConfig.status.read = false;
                } else if (lower === 'read:true') {
                    this.draftConfig.status.read = true;
                    this.draftConfig.status.unread = false;
                } else if (lower === 'favorite:true' || lower === 'star:true') this.draftConfig.status.favorite = true;
                else if (lower === 'clicked:true') this.draftConfig.status.clicked = true;
                else if (lower === 'hot:true') this.draftConfig.status.hot = true;
                else if (['@today', '@yesterday', '@lastweek'].includes(lower)) this.draftConfig.date.preset = lower;
                else if (/^firstseen:\d+[hd]$/i.test(cleaned)) this.applyFirstSeenToken(cleaned);
                else if (/^tag:/i.test(cleaned)) this.appendDraftTag(stripQuotes(cleaned.slice(cleaned.indexOf(':') + 1)));
                else if (/^title:/i.test(cleaned)) this.draftConfig.content.title = stripQuotes(cleaned.slice(cleaned.indexOf(':') + 1));
                else if (/^author:/i.test(cleaned)) this.draftConfig.content.author = stripQuotes(cleaned.slice(cleaned.indexOf(':') + 1));
                else if (/^language:/i.test(cleaned)) this.draftConfig.content.language = cleaned.slice(cleaned.indexOf(':') + 1);
                else if (/^quality:/i.test(cleaned)) this.draftConfig.scores.quality = this.parseScoreToken(cleaned);
                else if (/^freshness:/i.test(cleaned)) this.draftConfig.scores.freshness = this.parseScoreToken(cleaned);
                else if (lower === 'event:true') this.draftConfig.events.isEvent = true;
                else if (lower === 'event:false') this.draftConfig.events.isNotEvent = true;
                else if (/^eventcount:/i.test(cleaned)) this.applyEventCountToken(cleaned);
                else if (/^sort:/i.test(cleaned)) this.applySortToken(cleaned);
                else if (/^limit:/i.test(cleaned)) this.draftConfig.limitCount = Number(cleaned.split(':')[1]) || 50;
                else freeText.push(stripQuotes(cleaned));
            });

            this.draftConfig.content.text = freeText.join(' ');
        },
        applyFirstSeenToken(token) {
            const match = token.match(/^firstSeen:(\d+)([hd])$/i);
            if (!match) return;

            this.draftConfig.date.useRelative = true;
            this.draftConfig.date.relativeAmount = Number(match[1]);
            this.draftConfig.date.relativeUnit = match[2].toLowerCase();
        },
        appendDraftTag(tag) {
            if (this.draftConfig.content.tags) return;

            this.draftConfig.content.tags = this.normalizeTagValue(tag);
        },
        normalizeTagValue(value) {
            return String(value || '')
                .split(/[,\s]+/)
                .filter(Boolean)[0] || '';
        },
        normalizeDraftTag() {
            this.draftConfig.content.tags = this.normalizeTagValue(this.draftConfig.content.tags);
        },
        preventTagSeparator(event) {
            if (event.key === ',' || event.key === ' ') {
                event.preventDefault();
            }
        },
        parseScoreToken(token) {
            const match = token.match(/(\d+\.?\d*|\.\d+)$/);
            return match ? Number(match[1]) : 0;
        },
        applyEventCountToken(token) {
            const match = token.match(/(\d+)$/);
            this.draftConfig.events.useMinimumCount = true;
            this.draftConfig.events.minimumCount = match ? Number(match[1]) : 2;
        },
        applySortToken(token) {
            const sortValue = token.split(':')[1];

            if (['recommended', 'quality', 'attention'].includes(sortValue)) {
                this.draftConfig.sort.field = sortValue;
                return;
            }

            if (sortValue === 'desc') this.draftConfig.sort.field = 'published-desc';
            if (sortValue === 'asc') this.draftConfig.sort.field = 'published-asc';
        },
        onStatusFilterChange(changedKey) {
            if (changedKey === 'unread' && this.draftConfig.status.unread) {
                this.draftConfig.status.read = false;
            }

            if (changedKey === 'read' && this.draftConfig.status.read) {
                this.draftConfig.status.unread = false;
            }
        },
        onEventFilterChange(changedKey) {
            if (changedKey === 'isEvent' && this.draftConfig.events.isEvent) {
                this.draftConfig.events.isNotEvent = false;
                this.draftConfig.events.useMinimumCount = false;
            }

            if (changedKey === 'isNotEvent' && this.draftConfig.events.isNotEvent) {
                this.draftConfig.events.isEvent = false;
                this.draftConfig.events.useMinimumCount = false;
            }

            if (changedKey === 'useMinimumCount' && this.draftConfig.events.useMinimumCount) {
                this.draftConfig.events.isEvent = false;
                this.draftConfig.events.isNotEvent = false;
            }
        },
        saveSmartFolderConfig(index) {
            this.smartFolders.splice(index, 1, {
                ...this.smartFolders[index],
                name: this.draftConfig.name,
                query: this.generatedSmartFolderQuery,
                limitCount: this.draftConfig.limitCount
            });

            this.cancelSmartFolderConfig();
        },
        saveSmartFolderAsCopy() {
            this.smartFolders.push({
                localId: `local-${Date.now()}`,
                name: `${this.draftConfig.name || 'Smart Folder'} copy`,
                query: this.generatedSmartFolderQuery,
                limitCount: this.draftConfig.limitCount
            });

            this.cancelSmartFolderConfig();
        },
        cancelSmartFolderConfig() {
            this.selectedSmartFolderId = null;
            this.resetDraftConfig();
        },
        async copyGeneratedQuery() {
            await navigator.clipboard?.writeText(this.generatedSmartFolderQuery);
        },
        async save() {
            try {
                if (this.generatedQueryInvalid) return;

                if (this.selectedSmartFolderId !== null) {
                    const index = this.smartFolders.findIndex(sf => sf.localId === this.selectedSmartFolderId);
                    if (index >= 0) this.saveSmartFolderConfig(index);
                }

                // Persist smart folders to the server
                const filteredSmartFolders = this.smartFolders.filter(sf => sf && sf.name && sf.name.trim() !== '');
                const resp = await saveSmartFolders(filteredSmartFolders);
                console.log('Smart folders saved:', resp.data);

                // Refresh smart folders from the server
                await this.$store.data.fetchSmartFolders();

                this.$emit('saved');
                this.$emit('close');
            } catch (err) {
                console.error('Error saving smart folders:', err);
                alert('Failed to save smart folders. Please try again.');
            }
        }
    }
};
</script>
