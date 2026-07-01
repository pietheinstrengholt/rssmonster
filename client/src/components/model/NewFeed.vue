<template>
    <div class="feed-modal-overlay">
        <section class="feed-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="add-feed-title">
            <header class="feed-modal-header">
                <span class="feed-modal-header-icon" aria-hidden="true">
                    <BootstrapIcon icon="rss-fill" />
                </span>

                <div class="feed-modal-title-block">
                    <h2 id="add-feed-title">Add new feed</h2>
                    <p>Enter the feed or website URL you want to follow.</p>
                </div>

                <button type="button" class="feed-modal-close" aria-label="Close" @click="closeDialog">
                    <BootstrapIcon icon="x-lg" />
                </button>
            </header>

            <!-- This piece of code is for adding new feeds -->
            <form class="feed-modal-body" @submit.prevent="checkWebsite">
                <!-- Instead of manipulating the store, we operate on a cloned object -->
                <div v-if="$store.data.categories.length > 0">
                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="link-45deg" />
                        </span>

                        <div class="feed-form-content">
                            <label for="feed-url">Feed or website URL</label>
                            <input
                                id="feed-url"
                                v-model="url"
                                type="text"
                                inputmode="url"
                                placeholder="Enter feed or website URL..."
                                autocomplete="url"
                            >
                            <p class="feed-form-help">Examples: https://example.com/feed, https://example.com</p>
                        </div>
                    </section>

                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="folder-fill" />
                        </span>

                        <div class="feed-form-content">
                            <label for="feed-category">Category</label>
                            <p class="feed-form-description">Choose a category for this feed.</p>
                            <select id="feed-category" v-model="selectedCategory" aria-label="Select Category">
                                <option v-for="category in $store.data.categories" :value="category.id" :key="category.id" v-bind:id="category.id">{{ category.name }}</option>
                            </select>
                        </div>
                    </section>

                    <!--Dropdown for selecting the date -->
                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="clock-fill" />
                        </span>

                        <div class="feed-form-content">
                            <label for="feed-crawl-since">Crawl since</label>
                            <p class="feed-form-description">Only fetch articles published within this period.</p>
                            <select id="feed-crawl-since" v-model="crawlSince" aria-label="Select how far back to crawl">
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
                    <span v-if="ajaxRequest">Please Wait ...</span>
                    <span class="text-danger" v-if="error_msg">{{ error_msg }}</span>
                </div>

                <div v-if="isCloudflare" class="feed-cloudflare-warning">
                    <p>You can still add this feed manually. The feed will be crawled, but may experience intermittent fetch failures due to bot protection.</p>
                    <button type="button" class="feed-modal-button feed-modal-button--warning" @click="forceAdd">
                        <BootstrapIcon icon="shield-exclamation" aria-hidden="true" />
                        Add feed anyway
                    </button>
                </div>

                <div v-if="feed.feedName" class="feed-preview-fields">
                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="rss-fill" />
                        </span>

                        <div class="feed-form-content">
                            <label for="inputFeedName">Feed name</label>
                            <input id="inputFeedName" type="text" v-model="feed.feedName" placeholder="Feed name">
                        </div>
                    </section>

                    <section class="feed-form-section">
                        <span class="feed-form-icon" aria-hidden="true">
                            <BootstrapIcon icon="card-text" />
                        </span>

                        <div class="feed-form-content">
                            <label for="inputFeedDescription">Feed description</label>
                            <input id="inputFeedDescription" type="text" v-model="feed.feedDesc" placeholder="Feed description">
                        </div>
                    </section>
                </div>

                <footer class="feed-modal-footer">
                    <button type="button" class="feed-modal-button feed-modal-button--secondary" data-dismiss="modal" @click="closeDialog">
                        Cancel
                    </button>

                    <button v-if="feed.feedName" type="button" class="feed-modal-button feed-modal-button--primary" @click="newFeed">
                        <BootstrapIcon icon="check2" aria-hidden="true" />
                        Save changes
                    </button>

                    <button v-else-if="$store.data.categories.length > 0" type="submit" class="feed-modal-button feed-modal-button--primary">
                        Validate feed
                    </button>
                </footer>
            </form>
        </section>
    </div>
</template>

<style scoped>
.feed-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 2200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--overlay-backdrop-strong);
}

.feed-modal-dialog {
    width: min(860px, calc(100vw - 48px));
    max-height: min(860px, calc(100vh - 48px));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--bg-card);
    border: 1px solid var(--border-subtle);
    border-radius: 18px;
    box-shadow: 0 24px 80px var(--shadow-settings-dialog-color);
}

.feed-modal-header {
    display: grid;
    grid-template-columns: 74px 1fr 44px;
    gap: 22px;
    align-items: center;
    padding: 36px 40px 30px;
    border-bottom: 1px solid var(--border-subtle);
}

.feed-modal-header-icon,
.feed-form-icon,
.feed-modal-tip-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.feed-modal-header-icon {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    background: var(--color-primary-soft);
    color: var(--color-primary);
    font-size: 34px;
}

.feed-modal-title-block h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 34px;
    line-height: 1.1;
    font-weight: 750;
    letter-spacing: 0;
}

.feed-modal-title-block p {
    margin: 8px 0 0;
    color: var(--text-secondary);
    font-size: 16px;
    line-height: 1.5;
}

.feed-modal-close {
    width: 44px;
    height: 44px;
    border: 1px solid var(--border-subtle);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-card);
    color: var(--text-secondary);
    cursor: pointer;
}

.feed-modal-close:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.feed-modal-body {
    overflow-y: auto;
    padding: 28px 40px 0;
}

.feed-form-section {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 24px;
    padding: 16px 0;
    border-bottom: 1px solid var(--border-subtle);
}

.feed-form-section:first-child {
    padding-top: 0;
}

.feed-form-icon {
    width: 54px;
    height: 54px;
    border-radius: 12px;
    background: var(--color-primary-soft);
    color: var(--color-primary);
    font-size: 26px;
}

.feed-form-content label {
    display: block;
    margin-bottom: 10px;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 700;
}

.feed-form-description,
.feed-form-help {
    margin: 0 0 12px;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.45;
}

.feed-form-help {
    margin: 10px 0 0;
}

.feed-form-content input,
.feed-form-content select {
    width: 100%;
    height: 48px;
    padding: 0 14px;
    border: 1px solid var(--border-input);
    border-radius: 10px;
    background: var(--bg-input);
    color: var(--text-primary);
    font-size: 15px;
}

.feed-form-content input::placeholder {
    color: var(--text-placeholder);
}

.feed-form-content input:focus,
.feed-form-content select:focus,
.feed-modal-close:focus-visible,
.feed-modal-button:focus-visible {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.14);
}

.feed-modal-tip {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    margin: 28px 0 30px;
    padding: 14px 16px;
    border: 1px solid var(--settings-info-border);
    border-radius: 12px;
    background: var(--settings-info-bg);
    color: var(--settings-info-text);
}

.feed-modal-tip-icon {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    border-radius: 999px;
    background: var(--color-primary);
    color: var(--text-inverted);
}

.feed-modal-tip strong {
    display: block;
    margin-bottom: 4px;
    color: var(--text-primary);
    font-size: 15px;
}

.feed-modal-tip p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
}

.feed-modal-empty {
    padding: 24px 0 34px;
    color: var(--text-secondary);
}

.feed-modal-empty p {
    margin: 0 0 8px;
}

.feed-modal-status {
    display: grid;
    gap: 8px;
    min-height: 24px;
    margin-bottom: 18px;
    color: var(--text-secondary);
    font-size: 14px;
}

.text-danger {
    color: var(--text-error);
}

.feed-cloudflare-warning {
    display: grid;
    gap: 12px;
    margin: 0 0 24px;
    padding: 16px 18px;
    border: 1px solid var(--settings-orange-border);
    border-radius: 12px;
    background: var(--settings-orange-bg);
    color: var(--settings-orange-text);
}

.feed-cloudflare-warning p {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
}

.feed-preview-fields {
    margin-top: 8px;
}

.feed-modal-footer {
    margin: 0 -40px;
    padding: 22px 40px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    background: var(--bg-surface-muted);
    border-top: 1px solid var(--border-subtle);
}

.feed-modal-button {
    height: 46px;
    padding: 0 22px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
}

.feed-modal-button--secondary {
    border: 1px solid var(--border-color);
    background: var(--bg-card);
    color: var(--text-primary);
}

.feed-modal-button--secondary:hover {
    background: var(--bg-hover);
}

.feed-modal-button--primary,
.feed-modal-button--warning {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}

.feed-modal-button--primary {
    border: 0;
    background: var(--color-primary);
    color: var(--text-inverted);
}

.feed-modal-button--primary:hover {
    background: var(--color-primary-hover);
}

.feed-modal-button--warning {
    justify-self: start;
    height: 38px;
    padding: 0 14px;
    border: 1px solid var(--settings-orange-border);
    background: var(--bg-card);
    color: var(--settings-orange-text);
    font-size: 14px;
}

.feed-modal-header-icon :deep(svg),
.feed-form-icon :deep(svg),
.feed-modal-tip-icon :deep(svg) {
    width: 1em;
    height: 1em;
}

:global(:root[data-theme='dark']) .feed-modal-dialog {
    background: var(--bg-card);
    border-color: var(--border-subtle);
    box-shadow: 0 24px 80px var(--shadow-settings-dialog-dark-color);
}

:global(:root[data-theme='dark']) .feed-modal-header,
:global(:root[data-theme='dark']) .feed-form-section,
:global(:root[data-theme='dark']) .feed-modal-footer {
    border-color: var(--border-subtle);
}

:global(:root[data-theme='dark']) .feed-modal-header-icon,
:global(:root[data-theme='dark']) .feed-form-icon {
    background: var(--badge-similar-bg);
    color: var(--badge-similar-text);
}

:global(:root[data-theme='dark']) .feed-modal-close,
:global(:root[data-theme='dark']) .feed-form-content input,
:global(:root[data-theme='dark']) .feed-form-content select,
:global(:root[data-theme='dark']) .feed-modal-button--secondary,
:global(:root[data-theme='dark']) .feed-modal-button--warning {
    background: var(--bg-control);
    border-color: var(--border-input);
    color: var(--text-primary);
}

:global(:root[data-theme='dark']) .feed-modal-close:hover,
:global(:root[data-theme='dark']) .feed-modal-button--secondary:hover {
    background: var(--bg-hover);
}

:global(:root[data-theme='dark']) .feed-modal-footer {
    background: var(--bg-secondary);
}

:global(:root[data-theme='dark']) .feed-modal-tip {
    background: var(--settings-info-bg);
    border-color: var(--settings-info-border);
    color: var(--settings-info-text);
}

:global(:root[data-theme='dark']) .feed-cloudflare-warning {
    background: var(--settings-orange-bg);
    border-color: var(--settings-orange-border);
    color: var(--settings-orange-text);
}

@media (max-width: 766px) {
    .feed-modal-overlay {
        padding: 0;
        align-items: stretch;
    }

    .feed-modal-dialog {
        width: 100vw;
        max-height: none;
        height: 100vh;
        border-radius: 0;
    }

    .feed-modal-header {
        grid-template-columns: 52px 1fr 40px;
        gap: 14px;
        padding: 22px 18px 18px;
    }

    .feed-modal-header-icon {
        width: 48px;
        height: 48px;
        font-size: 26px;
    }

    .feed-modal-title-block h2 {
        font-size: 26px;
    }

    .feed-modal-title-block p {
        font-size: 14px;
    }

    .feed-modal-close {
        width: 40px;
        height: 40px;
    }

    .feed-modal-body {
        padding: 20px 18px 0;
    }

    .feed-form-section {
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 20px 0;
    }

    .feed-form-icon {
        width: 46px;
        height: 46px;
        font-size: 22px;
    }

    .feed-modal-footer {
        margin: 0 -18px;
        padding: 16px 18px;
        flex-direction: column-reverse;
    }

    .feed-modal-button {
        width: 100%;
    }
}
</style>

<script>
import { validateFeed, createFeed } from '../../api/feeds';
import { setAuthToken } from '../../api/client';
import helper from '../../services/helper.js';
export default {
    name: 'NewFeed',
    created: function() {
        setAuthToken(this.$store.auth.token);
    },
    data() {
        return {
          ajaxRequest: false,
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
    methods: {
        // This function closes the add feed dialog.
        closeDialog() {
            this.$store.data.setShowModal('');
        },
        async checkWebsite() {
            //set ajaxRequest to true so the please wait shows up the screen
            this.ajaxRequest = true;

            try {
                const result = await validateFeed(this.url, this.selectedCategory);
                this.error_msg = "";
                this.isCloudflare = false;
                this.cloudflareUrl = null;
                this.feed = result.data;
            } catch (error) {
                const data = error.response?.data;
                if (data?.cloudflare) {
                    this.isCloudflare = true;
                    this.cloudflareUrl = data.feedUrl || this.url;
                    this.error_msg = data.error_msg;
                } else {
                    this.isCloudflare = false;
                    this.cloudflareUrl = null;
                    this.error_msg = data?.error_msg || "Error validating feed";
                }
                console.log(error);
            } finally {
                this.ajaxRequest = false;
            }
        },
        async forceAdd() {
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
                this.feed.unreadCount = 0;
                this.feed.readCount = 0;
                this.feed.favoriteCount = 0;

                var index = helper.findIndexById(this.$store.data.categories, this.selectedCategory);
                this.$store.data.categories[index].feeds.push(this.feed);
                this.$store.data.increaseRefreshCategories();
                this.$store.data.setShowModal('');
            } catch (error) {
                this.error_msg = error.response?.data?.error || "Error adding feed";
                console.log(error);
            }
        },
        async newFeed() {
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

                console.log(result.status);

                //overwrite results with results from the database
                this.feed = result.data.feed;

                //add missing count properties, since these are populated dynamically on an initial load
                this.feed.unreadCount = 0;
                this.feed.readCount = 0;
                this.feed.favoriteCount = 0;

                //find the index of the category
                var index = helper.findIndexById(this.$store.data.categories, this.selectedCategory);

                //push the new feed to the store
                this.$store.data.categories[index].feeds.push(this.feed);

                //send event to refresh the categories. This triggers a re-fetch of the categories and updates the counts
                this.$store.data.increaseRefreshCategories();

                //close modal
                this.$store.data.setShowModal('');
            } catch (error) {
                console.log("oops something went wrong", error);
            }
        }
    }
}
</script>
