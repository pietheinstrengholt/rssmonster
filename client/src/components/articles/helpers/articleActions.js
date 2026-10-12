import {
  markAsSaved as markArticleAsSavedAPI,
  markOpenedOriginal,
  markMoreLikeThis,
  markNotInterested,
  updateOpenedOriginalStatus
} from '../../../api/articles.js';
import { muteFeed } from '../../../api/feeds.js';
import { notifyActionError, notifyActionSuccess } from '../../../services/actionNotifications.js';

// Groups API-backed actions initiated from an article card.
export const articleActionMethods = {
  // Marks the article as opened original and updates its parent.
  async articleOpenedOriginal() {
    if (this.openedOriginalMutationPending) return;

    this.openedOriginalMutationPending = true;
    try {
      const response = await markOpenedOriginal(this.id);
      const responseOpenedOriginalCount = Number(response?.data?.openedOriginalCount);
      const currentOpenedOriginalCount = Number(this.openedOriginalCount) || 0;
      this.$emit('update-opened-original', {
        id: this.id,
        openedOriginalCount: Number.isFinite(responseOpenedOriginalCount)
          ? responseOpenedOriginalCount
          : currentOpenedOriginalCount + 1
      });
    } catch (error) {
      console.error(`Error recording click for article ${this.id}:`, error);
      notifyActionError('Could not record this article click. Please try again.', error);
    } finally {
      this.openedOriginalMutationPending = false;
    }
  },

  // Toggles whether the article is marked as opened original without recording another outbound click.
  async toggleOpenedOriginal() {
    if (this.openedOriginalMutationPending) return;

    this.openedOriginalMutationPending = true;
    const update = Number(this.openedOriginalCount) > 0 ? 'unmark' : 'mark';
    const requestedOpenedOriginalCount = update === 'mark' ? 1 : 0;

    try {
      const response = await updateOpenedOriginalStatus(this.id, update);
      const responseOpenedOriginalCount = Number(response?.data?.openedOriginalCount);
      this.$emit('update-opened-original', {
        id: this.id,
        openedOriginalCount: Number.isFinite(responseOpenedOriginalCount)
          ? responseOpenedOriginalCount
          : requestedOpenedOriginalCount
      });
    } catch (error) {
      console.error(`Error updating openedOriginal state for article ${this.id}:`, error);
      notifyActionError('Could not update opened-original status. Please try again.', error);
    } finally {
      this.openedOriginalMutationPending = false;
    }
  },

  // Toggles the article's saved status.
  async markAsSaved() {
    if (this.savedMutationPending) return;

    this.savedMutationPending = true;
    const updateType = this.savedInd ? 'unmark' : 'mark';
    const previousSavedInd = this.savedInd === 1 ? 1 : 0;
    const requestedSavedInd = previousSavedInd === 1 ? 0 : 1;

    try {
      const response = await markArticleAsSavedAPI(this.id, updateType, { id: this.id, savedInd: this.savedInd, status: this.status, feedId: this.feedId, feed: this.feed, duplicateOfArticleId: this.duplicateOfArticleId });
      const persistedSavedInd = response.data.savedInd === 1
        ? 1
        : response.data.savedInd === 0
          ? 0
          : requestedSavedInd;
      const delta = persistedSavedInd - previousSavedInd;

      if (delta !== 0) {
        this.overviewStore.applySavedDelta({
          categoryId: response.data.feed?.categoryId,
          feedId: response.data.feedId,
          delta
        });
      }

      this.$emit('update-saved', {
        id: this.id,
        savedInd: persistedSavedInd
      });
    } catch (error) {
      console.error(`Error updating saved state for article ${this.id}:`, error);
      notifyActionError('Could not update saved status. Please try again.', error);
    } finally {
      this.savedMutationPending = false;
    }
  },

  // Marks the article as not interesting.
  markNotInterested() {
    // Mark article with negativeInd flag
    return markNotInterested(this.id)
    .then(() => {
      notifyActionSuccess('Preference saved: less like this.');
    })
    .catch(error => {
      console.error(`Error marking article ${this.id} as not interested:`, error);
      notifyActionError('Could not save your preference. Try again.', error, () => this.markNotInterested());
    });
  },

  // Marks the article as similar to the user's interests.
  moreLikeThis() {
    return markMoreLikeThis(this.id)
    .then(() => {
      notifyActionSuccess('Preference saved: more like this.');
    })
    .catch(error => {
      console.error(`Error marking article ${this.id} as more like this:`, error);
      notifyActionError('Could not save your preference. Try again.', error, () => this.moreLikeThis());
    });
  },

  // Mutes the article feed for seven days after confirmation.
  muteFeedSevenDays() {
    if (confirm(`Mute "${this.feed.feedName}" for 7 days?`)) {
      const mutedUntil = new Date();
      mutedUntil.setDate(mutedUntil.getDate() + 7);

      return muteFeed(this.feedId, mutedUntil.toISOString())
      .then(({ data }) => {
        const until = new Date(data.mutedUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        notifyActionSuccess(`Source muted until ${until}.`);
      })
      .catch(error => {
        console.error(`Error muting feed ${this.feedId}:`, error);
        notifyActionError('Could not mute this feed. Try again.', error, () => this.muteFeedSevenDays());
      });
    }
    return false;
  }
};
