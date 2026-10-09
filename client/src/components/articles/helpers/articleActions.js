import {
  markAsFavorite as markArticleAsFavoriteAPI,
  markClicked,
  markMoreLikeThis,
  markNotInterested,
  updateClickedStatus
} from '../../../api/articles.js';
import { muteFeed } from '../../../api/feeds.js';
import { notifyActionError, notifyActionSuccess } from '../../../services/actionNotifications.js';

// Groups API-backed actions initiated from an article card.
export const articleActionMethods = {
  // Marks the article as clicked and updates its parent.
  async articleClicked() {
    if (this.clickMutationPending) return;

    this.clickMutationPending = true;
    try {
      const response = await markClicked(this.id);
      const responseClickedAmount = Number(response?.data?.clickedAmount);
      const currentClickedAmount = Number(this.clickedAmount) || 0;
      this.$emit('update-clicked', {
        id: this.id,
        clickedAmount: Number.isFinite(responseClickedAmount)
          ? responseClickedAmount
          : currentClickedAmount + 1
      });
    } catch (error) {
      console.error(`Error recording click for article ${this.id}:`, error);
      notifyActionError('Could not record this article click. Please try again.', error);
    } finally {
      this.clickMutationPending = false;
    }
  },

  // Toggles whether the article is marked as clicked without recording another outbound click.
  async toggleClicked() {
    if (this.clickMutationPending) return;

    this.clickMutationPending = true;
    const update = Number(this.clickedAmount) > 0 ? 'unmark' : 'mark';
    const requestedClickedAmount = update === 'mark' ? 1 : 0;

    try {
      const response = await updateClickedStatus(this.id, update);
      const responseClickedAmount = Number(response?.data?.clickedAmount);
      this.$emit('update-clicked', {
        id: this.id,
        clickedAmount: Number.isFinite(responseClickedAmount)
          ? responseClickedAmount
          : requestedClickedAmount
      });
    } catch (error) {
      console.error(`Error updating clicked state for article ${this.id}:`, error);
      notifyActionError('Could not update opened-original status. Please try again.', error);
    } finally {
      this.clickMutationPending = false;
    }
  },

  // Toggles the article's favorite status.
  async markAsFavorite() {
    if (this.favoriteMutationPending) return;

    this.favoriteMutationPending = true;
    const updateType = this.favoriteInd ? 'unmark' : 'mark';
    const previousFavoriteInd = this.favoriteInd === 1 ? 1 : 0;
    const requestedFavoriteInd = previousFavoriteInd === 1 ? 0 : 1;

    try {
      const response = await markArticleAsFavoriteAPI(this.id, updateType, { id: this.id, favoriteInd: this.favoriteInd, status: this.status, feedId: this.feedId, feed: this.feed, duplicateOfArticleId: this.duplicateOfArticleId });
      const persistedFavoriteInd = response.data.favoriteInd === 1
        ? 1
        : response.data.favoriteInd === 0
          ? 0
          : requestedFavoriteInd;
      const delta = persistedFavoriteInd - previousFavoriteInd;

      if (delta !== 0) {
        this.overviewStore.applyFavoriteDelta({
          categoryId: response.data.feed?.categoryId,
          feedId: response.data.feedId,
          delta
        });
      }

      this.$emit('update-favorite', {
        id: this.id,
        favoriteInd: persistedFavoriteInd
      });
    } catch (error) {
      console.error(`Error updating favorite state for article ${this.id}:`, error);
      notifyActionError('Could not update saved status. Please try again.', error);
    } finally {
      this.favoriteMutationPending = false;
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
