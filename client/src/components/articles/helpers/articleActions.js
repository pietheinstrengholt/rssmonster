import {
  markAsFavorite as markArticleAsFavoriteAPI,
  markClicked,
  markMoreLikeThis,
  markNotInterested
} from '../../../api/articles.js';
import { muteFeed } from '../../../api/feeds.js';
import { notifyActionError } from '../../../services/actionNotifications.js';

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

  // Toggles the article's favorite status.
  async markAsFavorite() {
    if (this.favoriteMutationPending) return;

    this.favoriteMutationPending = true;
    const updateType = this.favoriteInd ? 'unmark' : 'mark';
    const previousFavoriteInd = this.favoriteInd === 1 ? 1 : 0;
    const requestedFavoriteInd = previousFavoriteInd === 1 ? 0 : 1;

    try {
      const response = await markArticleAsFavoriteAPI(this.id, updateType);
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
      notifyActionError('Could not update the favorite. Please try again.', error);
    } finally {
      this.favoriteMutationPending = false;
    }
  },

  // Marks the article as not interesting.
  markNotInterested() {
    // Mark article with negativeInd flag
    markNotInterested(this.id)
    .then(() => {
      this.$emit('article-not-interested', { id: this.id });
    })
    .catch(error => {
      console.error(`Error marking article ${this.id} as not interested:`, error);
      notifyActionError('Could not update this article. Please try again.', error);
    });
  },

  // Marks the article as similar to the user's interests.
  moreLikeThis() {
    markMoreLikeThis(this.id)
    .catch(error => {
      console.error(`Error marking article ${this.id} as more like this:`, error);
      notifyActionError('Could not update this article. Please try again.', error);
    });
  },

  // Mutes the article feed for seven days after confirmation.
  muteFeedSevenDays() {
    if (confirm(`Mute "${this.feed.feedName}" for 7 days?`)) {
      const mutedUntil = new Date();
      mutedUntil.setDate(mutedUntil.getDate() + 7);

      muteFeed(this.feedId, mutedUntil.toISOString())
      .catch(error => {
        console.error(`Error muting feed ${this.feedId}:`, error);
        notifyActionError('Could not mute this feed. Please try again.', error);
      });
    }
  }
};
