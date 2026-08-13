<template>
    <BaseDialog
        size="lg"
        icon="rss-fill"
        show-close
        close-label="Close feed dialog"
        :close-disabled="isBusy"
        @close="closeDialog"
    >
        <template #title>
            Add new feed
        </template>

        <template #description>
            Enter the feed or website URL you want to follow.
        </template>

            <!-- This piece of code is for adding new feeds -->
            <form id="new-feed-form" class="feed-form" @submit.prevent="checkWebsite">
                <fieldset class="feed-form-fieldset" :disabled="isBusy">
                <!-- Instead of manipulating the store, we operate on a cloned object -->
                <div v-if="overviewStore.categories.length > 0">
                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="link-45deg" />
                        </span>

                        <div class="feed-form-content">
                            <label class="app-form-label" for="feed-url">Feed or website URL</label>
                            <input
                                id="feed-url"
                                v-model="url"
                                type="text"
                                inputmode="url"
                                placeholder="Enter feed or website URL..."
                                autocomplete="url"
                                class="app-form-control"
                            >
                            <p class="feed-form-help">Examples: https://example.com/feed, https://example.com</p>
                        </div>
                    </section>

                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="folder-fill" />
                        </span>

                        <div class="feed-form-content">
                            <label class="app-form-label" for="feed-category">Category</label>
                            <p class="feed-form-description">Choose a category for this feed.</p>
                            <select id="feed-category" v-model="selectedCategory" class="app-form-select" aria-label="Select Category">
                                <option v-for="category in overviewStore.categories" :value="category.id" :key="category.id" v-bind:id="category.id">{{ category.name }}</option>
                            </select>
                        </div>
                    </section>

                    <!--Dropdown for selecting the date -->
                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="clock-fill" />
                        </span>

                        <div class="feed-form-content">
                            <label class="app-form-label" for="feed-crawl-since">Crawl since</label>
                            <p class="feed-form-description">Only fetch articles published within this period.</p>
                            <select id="feed-crawl-since" v-model="crawlSince" class="app-form-select" aria-label="Select how far back to crawl">
                                <option value="7d">Last 7 days (default)</option>
                                <option value="1m">Last 1 month</option>
                                <option value="3m">Last 3 months</option>
                                <option value="1y">Last 1 year</option>
                                <option value="all">Everything</option>
                            </select>
                        </div>
                    </section>

                    <aside class="feed-modal-tip">
                        <span class="feed-modal-tip-icon" aria-hidden="true">
                            <BootstrapIcon icon="info-lg" />
                        </span>
                        <div>
                            <strong>Tip</strong>
                            <p>You can change these settings later in feed settings.</p>
                        </div>
                    </aside>
                </div>

                <div v-else class="feed-modal-empty">
                    <p>No categories exist at this moment.</p>
                    <p>First create a new category before adding a new feed.</p>
                </div>

                <div class="feed-modal-status" aria-live="polite">
                    <span v-if="ajaxRequest">Please wait…</span>
                    <span class="feed-modal-error" v-if="error_msg">{{ error_msg }}</span>
                </div>

                <div v-if="isCloudflare" class="feed-cloudflare-warning">
                    <p>You can still add this feed manually. The feed will be crawled, but may experience intermittent fetch failures due to bot protection.</p>
                    <button type="button" class="app-button app-button--warning app-button--compact" :disabled="isBusy" :aria-busy="forceAdding ? 'true' : 'false'" @click="forceAdd">
                        <BootstrapIcon icon="shield-exclamation" aria-hidden="true" />
                        {{ forceAdding ? 'Adding…' : 'Add feed anyway' }}
                    </button>
                </div>

                <div v-if="feed.feedName" class="feed-preview-fields">
                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="rss-fill" />
                        </span>

                        <div class="feed-form-content">
                            <label class="app-form-label" for="inputFeedName">Feed name</label>
                            <input id="inputFeedName" type="text" v-model="feed.feedName" class="app-form-control" placeholder="Feed name">
                        </div>
                    </section>

                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="card-text" />
                        </span>

                        <div class="feed-form-content">
                            <label class="app-form-label" for="inputFeedDescription">Feed description</label>
                            <input id="inputFeedDescription" type="text" v-model="feed.feedDesc" class="app-form-control" placeholder="Feed description">
                        </div>
                    </section>
                </div>

                </fieldset>
            </form>

        <template #footer>
            <button type="button" class="app-button app-button--secondary base-dialog__button base-dialog__button--secondary feed-modal-action" :disabled="isBusy" @click="closeDialog">
                Cancel
            </button>

            <button v-if="feed.feedName" type="button" class="app-button app-button--primary base-dialog__button base-dialog__button--primary feed-modal-action" :disabled="isBusy" :aria-busy="saving ? 'true' : 'false'" @click="newFeed">
                <BootstrapIcon icon="check2" aria-hidden="true" />
                {{ saving ? 'Saving…' : 'Save changes' }}
            </button>

            <button
                v-else-if="overviewStore.categories.length > 0"
                type="submit"
                form="new-feed-form"
                class="app-button app-button--primary base-dialog__button base-dialog__button--primary feed-modal-action"
                :disabled="isBusy || !hasValidUrl"
                :aria-busy="ajaxRequest ? 'true' : 'false'"
            >
                {{ ajaxRequest ? 'Validating…' : 'Validate feed' }}
            </button>
        </template>
    </BaseDialog>
</template>

<style scoped>
.feed-form-icon,
.feed-modal-tip-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.feed-form,
.feed-form-fieldset {
    min-width: 0;
}

.feed-form-fieldset {
    margin: 0;
    padding: 0;
    border: 0;
}

.feed-form-section {
    display: grid;
    grid-template-columns: 2rem 1fr;
    gap: 0.75rem;
    padding: 0.625rem 0;
    border-bottom: 1px solid var(--border-subtle);
}

.feed-form-section:first-child {
    padding-top: 0;
}

.feed-form-icon {
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    background: var(--color-primary-soft);
    color: var(--color-primary);
    font-size: 0.9rem;
}

.feed-form-content label {
    display: block;
    margin-bottom: 0.375rem;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-weight: 600;
}

.feed-form-description,
.feed-form-help {
    margin: 0 0 0.5rem;
    color: var(--text-secondary);
    font-size: 0.75rem;
    line-height: 1.4;
}

.feed-form-help {
    margin: 0.375rem 0 0;
}

.feed-form-content .app-form-control,
.feed-form-content .app-form-select {
    height: 2.5rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
}

.feed-modal-tip {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    margin: 0.75rem 0 1rem;
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--settings-info-border);
    border-radius: 0.375rem;
    background: var(--settings-info-bg);
    color: var(--settings-info-text);
}

.feed-modal-tip-icon {
    width: 2rem;
    height: 2rem;
    flex: 0 0 2rem;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--text-inverted);
}

.feed-modal-tip strong {
    display: block;
    margin-bottom: 0.125rem;
    color: var(--text-primary);
    font-size: 0.8125rem;
}

.feed-modal-tip p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.75rem;
}

.feed-modal-empty {
    padding: 0.75rem 0 1rem;
    color: var(--text-secondary);
}

.feed-modal-empty p {
    margin: 0 0 0.375rem;
}

.feed-modal-status {
    display: grid;
    gap: 0.375rem;
    min-height: 1.5rem;
    margin-bottom: 0.75rem;
    color: var(--text-secondary);
    font-size: 14px;
}

.feed-modal-error {
    color: var(--text-error);
}

.feed-cloudflare-warning {
    display: grid;
    gap: 0.5rem;
    margin: 0 0 1rem;
    padding: 0.75rem;
    border: 1px solid var(--border-warning);
    border-radius: 0.375rem;
    background: var(--surface-warning);
    color: var(--color-warning);
}

.feed-cloudflare-warning p {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
}

.feed-preview-fields {
    margin-top: 0.375rem;
}

.feed-modal-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.feed-form-icon :deep(svg),
.feed-modal-tip-icon :deep(svg) {
    width: 1em;
    height: 1em;
}

:global(:root[data-theme='dark']) .feed-form-section {
    border-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .feed-form-icon) {
    background: var(--color-primary-surface-dark);
}

:global(:root[data-theme='dark']) .feed-modal-tip {
    background: var(--settings-info-bg);
    border-color: var(--settings-info-border);
    color: var(--settings-info-text);
}

:global(:root[data-theme='dark']) .feed-cloudflare-warning {
    background: var(--surface-warning);
    border-color: var(--border-warning);
    color: var(--color-warning);
}

@media (max-width: 879px) {
    .feed-form-section {
        gap: 0.625rem;
    }

    .feed-modal-action {
        width: 100%;
    }
}
</style>

<script>
import { mapStores } from 'pinia';
import { useOverviewStore } from '../../../store/overview.js';
import { useUiStore } from '../../../store/ui.js';
import { validateFeed, createFeed } from '../../../api/feeds';
import { notifyActionError } from '../../../services/actionNotifications.js';
import BaseDialog from '../BaseDialog.vue';

export default {
    name: 'NewFeed',
    components: {
        BaseDialog
    },
    // Initializes the feed discovery workflow state.
    data() {
        return {
          ajaxRequest: false,
          forceAdding: false,
          saving: false,
          error_msg: "",
          isCloudflare: false,
          cloudflareUrl: null,
          url: null,
          category: {},
          feed: {},
          selectedCategory: null,
          crawlSince: '7d'
        };
    },
    computed: {
      ...mapStores(useOverviewStore, useUiStore),
        // Locks incompatible actions while any feed request is pending.
        isBusy() {
            return this.ajaxRequest || this.forceAdding || this.saving;
        },
        // Produces an absolute HTTP(S) URL for a qualified domain, including inputs without a protocol.
        normalizedUrl() {
            const value = String(this.url || '').trim();
            if (!value) {
                return null;
            }

            try {
                const hasProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value);
                const absoluteUrl = hasProtocol ? value : `https://${value}`;
                const parsedUrl = new URL(absoluteUrl);
                const labels = parsedUrl.hostname.split('.');
                const hasValidLabels = labels.every(label =>
                    /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)
                );
                const isValid = ['http:', 'https:'].includes(parsedUrl.protocol)
                    && labels.length >= 2
                    && labels.at(-1).length >= 2
                    && hasValidLabels;

                return isValid ? absoluteUrl : null;
            } catch {
                return null;
            }
        },
        // Reports whether the entered value can be submitted as a supported feed URL.
        hasValidUrl() {
            return Boolean(this.normalizedUrl);
        }
    },
    methods: {
        // Closes the dialog only when no feed request is pending.
        closeDialog() {
            if (this.isBusy) {
                return;
            }

            this.uiStore.setShowModal('');
        },
        // Discovers feed metadata for the submitted URL.
        async checkWebsite() {
            if (this.isBusy || !this.hasValidUrl) {
                return;
            }

            //set ajaxRequest to true so the please wait shows up the screen
            this.ajaxRequest = true;

            try {
                const result = await validateFeed(this.normalizedUrl, this.selectedCategory);
                this.error_msg = "";
                this.isCloudflare = false;
                this.cloudflareUrl = null;
                this.feed = result.data;
            } catch (error) {
                const data = error.response?.data;
                if (data?.cloudflare) {
                    this.isCloudflare = true;
                    this.cloudflareUrl = data.feedUrl || this.normalizedUrl;
                    this.error_msg = 'This site could not be validated automatically.';
                } else {
                    this.isCloudflare = false;
                    this.cloudflareUrl = null;
                    this.error_msg = 'Could not validate this feed. Check the URL and try again.';
                }
                console.error(`Error validating feed URL ${this.url}:`, error);
            } finally {
                this.ajaxRequest = false;
            }
        },
        // Creates a feed directly when automated discovery is blocked.
        async forceAdd() {
            if (this.ajaxRequest || this.forceAdding || this.saving) {
                return;
            }

            this.forceAdding = true;
            try {
                const feedUrl = this.cloudflareUrl || this.url;
                // Extract hostname as feed name
                let feedName;
                try {
                    feedName = new URL(feedUrl).hostname;
                } catch {
                    feedName = feedUrl;
                }

                const result = await createFeed({
                    categoryId: this.selectedCategory,
                    feedName,
                    feedDesc: null,
                    feedType: 'rss',
                    url: feedUrl,
                    status: 'active',
                    crawlSince: this.crawlSince
                });

                this.feed = result.data.feed;
                this.overviewStore.addFeed(this.selectedCategory, this.feed);
                this.uiStore.setShowModal('');
            } catch (error) {
                this.error_msg = 'Could not add this feed. Please try again.';
                console.error(`Error force-adding feed URL ${this.cloudflareUrl || this.url}:`, error);
            } finally {
                this.forceAdding = false;
            }
        },
        // Persists a validated feed and reconciles it through the store.
        async newFeed() {
            if (this.ajaxRequest || this.forceAdding || this.saving) {
                return;
            }

            this.saving = true;
            try {
                const result = await createFeed({
                    categoryId: this.selectedCategory,
                    feedName: this.feed.feedName,
                    feedDesc: this.feed.feedDesc,
                    feedType: this.feed.feedType,
                    url: this.feed.url,
                    status: 'active',
                    crawlSince: this.crawlSince
                });

                //overwrite results with results from the database
                this.feed = result.data.feed;

                // Reconcile the API response through the store's normalization contract.
                this.overviewStore.addFeed(this.selectedCategory, this.feed);

                //close modal
                this.uiStore.setShowModal('');
            } catch (error) {
                console.error(`Error adding feed URL ${this.feed.url}:`, error);
                notifyActionError('Could not add this feed. Please try again.', error);
            } finally {
                this.saving = false;
            }
        }
    }
}
</script>
