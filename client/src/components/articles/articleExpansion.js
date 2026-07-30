import { fetchDuplicateArticles } from '../../api/articles.js';
import { fetchEventArticles } from '../../api/events.js';
import { fetchTopicArticles } from '../../api/topics.js';
import { notifyActionError } from '../../services/actionNotifications.js';

// Creates expansion state for event and duplicate article groups.
export function createArticleExpansionState() {
  return {
    eventExpanded: false,
    duplicatesExpanded: false
  };
}

// Groups event, topic, and duplicate expansion requests.
export const articleExpansionMethods = {
  // Expands or collapses related articles for the selected event or topic.
  viewEventArticles(eventId) {
    if (this.eventExpanded) {
      this.eventExpanded = false;
      this.$emit('event-articles-collapsed', { articleId: this.id });
      return;
    }

    const grouping = this.$store.data.currentSelection.grouping;
    const fetchRelatedArticles = grouping === 'topic'
      ? fetchTopicArticles
      : fetchEventArticles;

    console.log(`Fetching ${grouping} articles for event:`, eventId);
    fetchRelatedArticles(eventId, this.id)
    .then(response => {
      this.eventExpanded = true;
      this.$emit('event-articles-loaded', {
        articleId: this.id,
        eventId,
        articles: response.data.articles || []
      });
    })
    .catch(error => {
      console.error(`Error fetching ${grouping} articles:`, error);
      notifyActionError('Could not load related articles. Please try again.', error);
    });
  },

  // Expands or collapses duplicates belonging to this canonical article.
  viewDuplicateArticles() {
    if (this.duplicatesExpanded) {
      this.duplicatesExpanded = false;
      this.$emit('duplicate-articles-collapsed', { articleId: this.id });
      return;
    }

    fetchDuplicateArticles(this.id)
    .then(response => {
      this.duplicatesExpanded = true;
      this.$emit('duplicate-articles-loaded', {
        articleId: this.id,
        articles: response.data.articles || []
      });
    })
    .catch(error => {
      console.error('Error fetching duplicate articles:', error);
      notifyActionError('Could not load duplicate articles. Please try again.', error);
    });
  }
};
