import { importOpml, pollOpmlPreview, previewOpml } from '../api/opml';

// Shared by Settings and the direct onboarding import dialog.
export default {
  data() {
    return {
        opmlMessage: null,
        opmlError: null,
        opmlPreviewOpen: false,
        opmlPreviewLoading: false,
        opmlPreviewCheckedFeeds: 0,
        opmlPreviewTotalFeeds: null,
        opmlPreview: null,
        opmlImporting: false,
        opmlDialogError: null,
    };
  },
  methods: {
    async handleFileSelect(event) {
        this.opmlMessage = null;
        this.opmlError = null;

        const file = event?.target?.files?.[0];
        if (!file) return;

        this.opmlPreviewOpen = true;
        this.opmlPreviewLoading = true;
        this.opmlPreviewCheckedFeeds = 0;
        this.opmlPreviewTotalFeeds = null;
        this.opmlPreview = null;
        this.opmlDialogError = null;
        try {
            const response = await previewOpml(file);
            this.opmlPreview = await pollOpmlPreview(response.data, {
                onProgress: status => {
                    this.opmlPreviewCheckedFeeds = Number(status?.checkedFeeds || 0);
                    this.opmlPreviewTotalFeeds = Number(status?.totalFeeds || 0);
                }
            });
        } catch (err) {
            console.error('Error previewing feeds from OPML:', err);
            this.opmlDialogError = 'Could not preview this OPML file. Check the file and try again.';
        } finally {
            this.opmlPreviewLoading = false;
            if (event?.target) {
                event.target.value = '';
            }
        }
    },
    discardOpmlPreview() {
        if (this.opmlPreviewLoading || this.opmlImporting) return;
        this.opmlPreviewOpen = false;
        this.opmlPreviewLoading = false;
        this.opmlPreviewCheckedFeeds = 0;
        this.opmlPreviewTotalFeeds = null;
        this.opmlPreview = null;
        this.opmlDialogError = null;
    },
    async confirmOpmlImport(selectedPreview = this.opmlPreview) {
        if (!this.opmlPreview || this.opmlPreviewLoading || this.opmlImporting) return;

        this.opmlImporting = true;
        this.opmlDialogError = null;
        try {
            const response = await importOpml(selectedPreview);
            const categoriesCreated = Number(response?.data?.categoriesCreated || 0);
            const feedsCreated = Number(response?.data?.feedsCreated || 0);
            const feedsFailed = Number(response?.data?.feedsFailed || 0);
            const categoryLabel = categoriesCreated === 1 ? 'category' : 'categories';
            const feedLabel = feedsCreated === 1 ? 'feed' : 'feeds';
            const failedFeedLabel = feedsFailed === 1 ? 'feed' : 'feeds';
            this.opmlMessage = `Import completed: ${categoriesCreated} ${categoryLabel} and ${feedsCreated} ${feedLabel} added.` +
                (feedsFailed > 0
                    ? ` ${feedsFailed} ${failedFeedLabel} could not be added.`
                    : '');
            this.opmlPreviewOpen = false;
            this.opmlPreview = null;
            await this.fetchFeeds({ forceRefresh: true });
            this.$emit('saved');
        } catch (err) {
            console.error('Error importing feeds from OPML:', err);
            this.opmlDialogError = 'Could not import these subscriptions. Please try again.';
        } finally {
            this.opmlImporting = false;
        }
    },
  }
};
