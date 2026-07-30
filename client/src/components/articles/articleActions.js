import {
  markAsFavorite as markArticleAsFavoriteAPI,
  markClicked,
  markMoreLikeThis,
  markNotInterested
} from '../../api/articles.js';
import { muteFeed } from '../../api/feeds.js';
import { notifyActionError } from '../../services/actionNotifications.js';

// Groups API-backed actions initiated from an article card.
export const articleActionMethods = {
  // Marks the article as clicked and updates its parent.
  articleClicked() {
    markClicked(this.id)
    .finally(() =>
      this.$emit('update-clicked', { id: this.id, clickedAmount: 1 })
    );
  },

  // Toggles the article's favorite status.
  markAsFavorite() {
    // Toggle favorite status.
    const updateType = this.favoriteInd ? 'unmark' : 'mark';
    const newFavoriteInd = this.favoriteInd ? 0 : 1;

    markArticleAsFavoriteAPI(this.id, updateType)
    .then(response => {
      const category = this.$store.data.categories.find(
        c => c.id === response.data.feed.categoryId
      );
      if (category) {
        const delta = newFavoriteInd ? 1 : -1;
        category.favoriteCount += delta;
        const feed = category.feeds.find(f => f.id === response.data.feedId);
        if (feed) feed.favoriteCount += delta;
      }
      newFavoriteInd
        ? this.$store.data.increaseFavoriteCount()
        : this.$store.data.decreaseFavoriteCount();

      this.$emit('update-favorite', { id: this.id, favoriteInd: newFavoriteInd });
    })
    .catch(error => {
      console.error(`Error updating favorite state for article ${this.id}:`, error);
      notifyActionError('Could not update the favorite. Please try again.', error);
    });
  },

  // Marks the article as not interesting.
  markNotInterested() {
    // Mark article with negativeInd flag
    markNotInterested(this.id)
    .then(() => {
      console.log('Marked as not interested:', this.id);
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
    .then(() => {
      console.log('Marked as more like this:', this.id);
    })
    .catch(error => {
      console.error(`Error marking article ${this.id} as more like this:`, error);
      notifyActionError('Could not update this article. Please try again.', error);
    });
  },

  // Marks the article as less similar to the user's interests.
  lessLikeThis() {
    this.markNotInterested();
  },

  // Ignores the topic by marking the article as not interesting.
  ignoreTopic() {
    this.markNotInterested();
  },

  // Mutes the article feed for seven days after confirmation.
  muteFeedSevenDays() {
    if (confirm(`Mute "${this.feed.feedName}" for 7 days?`)) {
      const mutedUntil = new Date();
      mutedUntil.setDate(mutedUntil.getDate() + 7);

      muteFeed(this.feedId, mutedUntil.toISOString())
      .then(() => {
        console.log('Feed muted until:', mutedUntil);
      })
      .catch(error => {
        console.error(`Error muting feed ${this.feedId}:`, error);
        notifyActionError('Could not mute this feed. Please try again.', error);
      });
    }
  }
};
