<template>
  <OpmlImportPreview
    v-if="opmlPreviewOpen"
    :preview="opmlPreview"
    :loading="opmlPreviewLoading"
    :checked-feeds="opmlPreviewCheckedFeeds"
    :total-feeds="opmlPreviewTotalFeeds"
    :busy="opmlImporting"
    :error="opmlDialogError"
    @confirm="confirmOpmlImport"
    @discard="discardOpmlPreview"
  />
  <BaseDialog v-else icon="upload" show-close @close="uiStore.setShowModal('')">
    <template #title>Import subscriptions</template>
    <template #description>Bring your subscriptions from another reader. Review your feeds before importing.</template>
    <input ref="opmlFileInput" type="file" accept=".opml,.xml" hidden @change="handleFileSelect" />
    <button type="button" class="app-button app-button--secondary" @click="$refs.opmlFileInput.click()">
      <BootstrapIcon icon="upload" aria-hidden="true" />
      Choose OPML file
    </button>
    <p v-if="opmlMessage" role="status">{{ opmlMessage }}</p>
    <template #footer>
      <button type="button" class="app-button app-button--secondary" @click="uiStore.setShowModal('')">Cancel</button>
      <button v-if="opmlMessage" type="button" class="app-button app-button--primary" @click="uiStore.setShowModal('')">Start reading</button>
    </template>
  </BaseDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useOverviewStore } from '../../../store/overview.js';
import { useUiStore } from '../../../store/ui.js';
import opmlImportFlow from '../../../mixins/opmlImportFlow.js';
import BaseDialog from '../BaseDialog.vue';
import OpmlImportPreview from './OpmlImportPreview.vue';

export default {
  name: 'ImportSubscriptions',
  components: { BaseDialog, OpmlImportPreview },
  mixins: [opmlImportFlow],
  emits: ['saved'],
  computed: { ...mapStores(useOverviewStore, useUiStore) },
  methods: {
    async fetchFeeds() {
      await this.overviewStore.fetchOverviewSplit({ initial: true });
    }
  }
};
</script>
