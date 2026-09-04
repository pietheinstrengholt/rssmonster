<template>
    <div class="settings-section settings-smart-folders settings-page">
        <!-- Info text -->
        <div class="settings-insight-card smart-folders-hero">
            <span class="settings-insight-icon" aria-hidden="true">
                <BootstrapIcon icon="folder-fill" />
            </span>

            <div class="smart-folders-hero__content">
                <p class="settings-page-eyebrow">Settings — Smart Folders</p>
                <h3>Smart Folders</h3>
                <p>
                    Create dynamic saved searches that automatically organize your articles.
                    They update in real-time as new articles arrive.
                </p>
            </div>
        </div>

        <div v-if="loading" class="smart-folders-load-state" role="status" aria-live="polite">
            <span class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span>
            <span>Loading Smart Folders…</span>
        </div>

        <div v-else-if="loadError" class="smart-folders-load-state smart-folders-load-state--error" role="alert">
            <span>{{ loadError }}</span>
            <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="fetchSmartFolders">Retry</button>
        </div>

        <fieldset v-else-if="loaded" class="smart-folders-editor smart-folders-surface" :disabled="saving" :aria-busy="saving ? 'true' : 'false'">
            <div
                v-if="overviewStore.smartFolderCountsStatus === 'error'"
                class="smart-folders-load-state smart-folders-load-state--error smart-folders-surface__notice"
                role="status"
            >
                <span>Smart Folder counts may be outdated. Your folders are still available.</span>
                <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="overviewStore.fetchSmartFolderCounts()">Retry counts</button>
            </div>

            <section v-if="aiEnabled" class="smart-folders-surface__section smart-folders-surface__insights">
                <SmartFolderInsights @add="applySmartFolderRecommendation" />
            </section>

            <!-- Smart Folders -->
            <section class="smart-folders-surface__section smart-folders-surface__folders">
                <div class="smart-folders-list-header">
                    <div class="smart-folders-list-header__title">
                        <span class="smart-folders-list-header__icon" aria-hidden="true">
                            <BootstrapIcon icon="folder-fill" />
                        </span>
                        <div>
                            <h4>Your Smart Folders</h4>
                            <p>Click a smart folder to configure its filters and settings.</p>
                        </div>
                    </div>

                    <button type="button" class="app-button settings-add-button" @click="addSmartFolder">
                        <BootstrapIcon icon="plus-circle-fill" aria-hidden="true" />
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
                                class="app-button app-button--icon-only settings-control settings-control--icon-only smart-folder-row__more"
                                title="Remove smart folder"
                                aria-label="Remove smart folder"
                                @click.stop="removeSmartFolder(index)"
                            >
                                <BootstrapIcon icon="trash3-fill" />
                            </button>
                        </div>

                        <SmartFolderEditor
                            v-if="selectedSmartFolderId === smartFolder.localId"
                            :ref="setSmartFolderEditorRef"
                            :smart-folder="smartFolder"
                            :ai-enabled="aiEnabled"
                            @validation-change="editorQueryInvalid = $event"
                            @save="saveSmartFolderConfig(index, $event)"
                            @save-copy="saveSmartFolderAsCopy"
                            @cancel="cancelSmartFolderConfig"
                            @delete="removeSmartFolder(index)"
                        />
                    </article>
                </div>
            </section>

        </fieldset>

        <div v-if="loaded" class="settings-action-footer">
            <button class="app-button app-button--primary smart-folders-save" type="button" @click="save" :disabled="hasInvalidSmartFolders || saving" :aria-busy="saving ? 'true' : 'false'">{{ saving ? 'Saving…' : 'Save Changes' }}</button>
        </div>
    </div>
</template>

<style scoped>
.settings-section {
  width: 100%;
}

.settings-smart-folders {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.smart-folders-editor {
  min-width: 0;
  margin: 0;
  padding: 0;
}

.smart-folders-surface {
  overflow: hidden;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  box-shadow: 0 1px 3px var(--shadow-card-subtle-color);
}

.smart-folders-load-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 180px;
  color: var(--text-secondary);
}

.smart-folders-load-state--error {
  flex-direction: column;
  color: var(--settings-danger-text);
}

.smart-folders-surface__notice {
  min-height: 0;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.smart-folders-hero {
  align-items: flex-start;
  margin: 0;
  background: var(--settings-info-bg);
  border-color: var(--settings-info-border);
}

.smart-folders-surface__section {
  padding: 22px 24px;
}

.smart-folders-surface__insights + .smart-folders-surface__folders {
  border-top: 1px solid var(--border-subtle);
}

.smart-folders-surface__insights :deep(.settings-group) {
  margin-top: 16px;
  margin-bottom: 0;
}

.smart-folders-list-header__icon,
.smart-folder-row__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  color: var(--color-primary);
}

.smart-folders-hero__content {
  flex: 1;
}

.smart-folders-hero__content h3,
.smart-folders-list-header h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
}

.smart-folders-list-header p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.smart-folders-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
}

.smart-folders-list-header__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.smart-folders-list-header__icon {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  background: var(--surface-chrome);
  font-size: 15px;
}

.smart-folders-list-header .settings-add-button {
  white-space: nowrap;
}

.smart-folders-list {
  margin-top: 20px;
  overflow: hidden;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-card);
}

.smart-folder-card + .smart-folder-card {
  border-top: 1px solid var(--border-subtle);
}

.smart-folder-row-wrap {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--control-height-default);
  align-items: stretch;
}

.smart-folder-row {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr) auto auto auto;
  align-items: center;
  width: 100%;
  gap: 16px;
  padding: 14px 16px;
  border: 0;
  background: var(--color-transparent);
  color: var(--text-primary);
  text-align: left;
}

.smart-folder-row:hover,
.smart-folder-row__more:hover {
  background: var(--surface-hover);
}

.smart-folder-card--open .smart-folder-row,
.smart-folder-card--open .smart-folder-row__more {
  background: var(--surface-selected);
}

.smart-folder-row__drag,
.smart-folder-row__chevron {
  color: var(--text-muted);
}

.smart-folder-row__icon {
  width: 40px;
  height: 40px;
  background: var(--surface-chrome);
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
  border: 1px solid var(--border-control);
  border-radius: var(--radius-pill);
  background: var(--surface-chrome);
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
  border-radius: var(--radius-pill);
  background: var(--color-success);
}

.smart-folder-row__more {
  min-height: 100%;
  padding: 0;
  border-radius: 0;
  color: var(--text-secondary);
}

.smart-folders-save {
  min-height: var(--control-height-default);
}

:global(:root[data-theme='dark'] .smart-folders-hero),
:global(:root[data-theme='dark'] .smart-folders-surface),
:global(:root[data-theme='dark'] .smart-folders-list) {
  background: var(--bg-modal);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark'] .smart-folders-surface__notice),
:global(:root[data-theme='dark'] .smart-folders-surface__insights + .smart-folders-surface__folders),
:global(:root[data-theme='dark'] .smart-folder-card + .smart-folder-card) {
  border-color: var(--border-default);
}

:global(:root[data-theme='dark'] .smart-folders-list-header__icon),
:global(:root[data-theme='dark'] .smart-folder-row__icon),
:global(:root[data-theme='dark'] .smart-folder-row__limit) {
  background: var(--surface-control);
}

:global(:root[data-theme='dark'] .smart-folders-list-header__icon) {
  color: var(--settings-info-text);
}

@media (max-width: 760px) {
  .smart-folders-surface__section {
    padding: 18px;
  }

  .smart-folders-list-header {
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

  .smart-folders-list-header .settings-add-button {
    width: 100%;
  }

  .smart-folders-surface__notice {
    padding: 16px 18px;
  }

  .smart-folders-save {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .smart-folders-hero {
    gap: 12px;
  }

  .smart-folders-list {
    margin-top: 16px;
  }

  .smart-folder-row-wrap {
    grid-template-columns: minmax(0, 1fr) var(--control-height-default);
  }

  .smart-folder-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 10px;
    padding: 12px;
  }

  .smart-folder-row__drag {
    display: none;
  }

  .smart-folder-row__icon {
    width: 36px;
    height: 36px;
  }

}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { saveSmartFolders } from '../../api/smartfolders';
import { validateSmartFolderQuery } from '../../services/queryValidation';
import { notifyActionError } from '../../services/actionNotifications.js';
import SmartFolderEditor from './smartFolders/SmartFolderEditor.vue';
import SmartFolderInsights from './smartFolders/SmartFolderInsights.vue';
import { smartFolderQueryRequiresUnread } from './smartFolders/smartFolderQuery.js';

const effectiveSmartFolderMarkAsReadOnScroll = smartFolder =>
    smartFolderQueryRequiresUnread(smartFolder?.query) &&
    Boolean(smartFolder?.markAsReadOnScroll);

export default {
    components: {
        SmartFolderEditor,
        SmartFolderInsights
    },
    emits: ['close', 'saved'],
    // This function creates server-backed collection state and editor coordination state.
    data() {
        return {
            smartFolders: [],
            selectedSmartFolderId: null,
            smartFolderEditorRef: null,
            editorQueryInvalid: false,
            loading: false,
            loadError: '',
            loaded: false,
            saving: false
        };
    },
    // This function loads authoritative Smart Folders before enabling the editor.
    async created() {
        await this.fetchSmartFolders();
    },
    computed: {
      ...mapStores(useSelectionStore, useOverviewStore),
        // This function reports whether AI-powered Smart Folder controls are available.
        aiEnabled() {
            return Boolean(this.selectionStore.currentSelection.AIEnabled);
        },
        // This function blocks persistence for either the open draft or a stored invalid query.
        hasInvalidSmartFolders() {
            if (this.selectedSmartFolderId !== null && this.editorQueryInvalid) return true;

            return this.smartFolders.some(smartFolder => {
                if (!smartFolder.name || smartFolder.name.trim() === '') return false;
                const { valid } = validateSmartFolderQuery(smartFolder.query || '');
                return !valid;
            });
        }
    },
    methods: {
        // This function refreshes the store from the server before taking an editable snapshot.
        async fetchSmartFolders() {
            if (this.loading || this.saving) return;

            this.loading = true;
            this.loaded = false;
            this.loadError = '';

            try {
                await this.overviewStore.fetchSmartFolders();
                if (!Array.isArray(this.overviewStore.smartFolders)) {
                    throw new Error('Invalid Smart Folders response');
                }

                this.smartFolders = this.overviewStore.smartFolders.map((smartFolder, index) => ({
                    localId: smartFolder.id || `local-${index}-${Date.now()}`,
                    id: smartFolder.id,
                    name: smartFolder.name,
                    query: smartFolder.query,
                    limitCount: smartFolder.limitCount || 50,
                    markAsReadOnScroll: effectiveSmartFolderMarkAsReadOnScroll(smartFolder)
                }));
                this.loaded = true;
            } catch (err) {
                console.error('Error loading Smart Folders:', err);
                this.loadError = 'Could not load Smart Folders. Your existing folders have not been changed.';
                notifyActionError('Could not load Smart Folders. Please try again.', err);
            } finally {
                this.loading = false;
            }
        },
        // This function adds a valid, nonduplicate insight recommendation to the local collection.
        applySmartFolderRecommendation(recommendation) {
            if (!recommendation || !recommendation.name || !recommendation.query) return;

            const exists = this.smartFolders.some(
                smartFolder => smartFolder.query.trim() === recommendation.query.trim()
            );

            if (exists) {
                notifyActionError('That Smart Folder is already in your list.');
                return;
            }

            this.smartFolders.push({
                localId: `local-${Date.now()}`,
                name: recommendation.name,
                query: recommendation.query,
                limitCount: 50,
                markAsReadOnScroll: effectiveSmartFolderMarkAsReadOnScroll(recommendation)
            });
        },
        // This function creates and opens a new Smart Folder using the available sort capabilities.
        addSmartFolder() {
            const smartFolder = {
                localId: `local-${Date.now()}`,
                name: 'New Smart Folder',
                query: this.aiEnabled ? 'sort:recommended limit:50' : 'limit:50',
                limitCount: 50,
                markAsReadOnScroll: false
            };

            this.smartFolders.push(smartFolder);
            this.toggleSmartFolder(smartFolder);
        },
        // This function removes a local Smart Folder and closes its editor when necessary.
        removeSmartFolder(index) {
            if (this.selectedSmartFolderId === this.smartFolders[index]?.localId) {
                this.cancelSmartFolderConfig();
            }

            this.smartFolders.splice(index, 1);
        },
        // This function returns the stored query summary shown in each collapsed row.
        querySummary(smartFolder) {
            return smartFolder.query || 'No filters configured yet';
        },
        // This function records the currently mounted editor without making it the collection owner.
        setSmartFolderEditorRef(editor) {
            this.smartFolderEditorRef = editor;
        },
        // This function opens the selected editor or closes it when the row is selected again.
        toggleSmartFolder(smartFolder) {
            if (this.selectedSmartFolderId === smartFolder.localId) {
                this.cancelSmartFolderConfig();
                return;
            }

            this.selectedSmartFolderId = smartFolder.localId;
            this.editorQueryInvalid = false;
        },
        // This function applies an editor result to the selected collection entry.
        saveSmartFolderConfig(index, update) {
            if (!update) return;

            this.smartFolders.splice(index, 1, {
                ...this.smartFolders[index],
                ...update
            });

            this.cancelSmartFolderConfig();
        },
        // This function appends an editor result as a new Smart Folder copy.
        saveSmartFolderAsCopy(update) {
            if (!update) return;

            this.smartFolders.push({
                localId: `local-${Date.now()}`,
                name: `${update.name || 'Smart Folder'} copy`,
                query: update.query,
                limitCount: update.limitCount,
                markAsReadOnScroll: effectiveSmartFolderMarkAsReadOnScroll(update)
            });

            this.cancelSmartFolderConfig();
        },
        // This function closes the active editor and clears its validation guard.
        cancelSmartFolderConfig() {
            this.selectedSmartFolderId = null;
            this.smartFolderEditorRef = null;
            this.editorQueryInvalid = false;
        },
        // This function commits an open editor before the complete collection is persisted.
        commitOpenEditor() {
            if (this.selectedSmartFolderId === null) return;

            const index = this.smartFolders.findIndex(
                smartFolder => smartFolder.localId === this.selectedSmartFolderId
            );
            const update = this.smartFolderEditorRef?.getFolderUpdate();
            if (index >= 0 && update) {
                this.saveSmartFolderConfig(index, update);
            }
        },
        // This function persists the valid local collection and refreshes authoritative store state.
        async save() {
            if (!this.loaded || this.loading || this.loadError || this.saving) return;
            if (this.editorQueryInvalid) return;

            this.saving = true;
            try {
                this.commitOpenEditor();

                const filteredSmartFolders = this.smartFolders
                    .filter(
                        smartFolder => smartFolder && smartFolder.name &&
                            smartFolder.name.trim() !== ''
                    )
                    .map(smartFolder => ({
                        ...smartFolder,
                        markAsReadOnScroll:
                            effectiveSmartFolderMarkAsReadOnScroll(smartFolder)
                    }));
                await saveSmartFolders(filteredSmartFolders);

                await this.overviewStore.fetchSmartFolders();

                this.$emit('saved');
                this.$emit('close');
            } catch (err) {
                console.error('Error saving smart folders:', err);
                notifyActionError('Could not save Smart Folders. Please try again.', err);
            } finally {
                this.saving = false;
            }
        }
    }
};
</script>
