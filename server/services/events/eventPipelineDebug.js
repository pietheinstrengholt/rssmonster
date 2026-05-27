import db from '../../models/index.js';
import { Op } from 'sequelize';

const { Event } = db;
const ACTIVE_EVENT_STATUSES = ['emerging', 'active', 'cooling'];
const EVENT_SUMMARY_LABEL_WIDTH = 31;

// This function formats one aligned line in the event processing summary.
export function eventSummaryLine(label, value) {
  const dots = '.'.repeat(Math.max(1, EVENT_SUMMARY_LABEL_WIDTH - label.length));
  return `[EVENT] ${label}${dots} ${value}`;
}

// This function summarizes currently active events for the user after clustering work.
export async function summarizeActiveEvents(userId) {
  const events = await Event.findAll({
    where: {
      userId,
      status: { [Op.in]: ACTIVE_EVENT_STATUSES }
    },
    attributes: ['articleCount'],
    raw: true
  });

  const activeEventCount = events.length;
  const totalEventArticles = events.reduce((sum, event) => sum + Number(event.articleCount || 0), 0);
  const largestEventSize = events.reduce((max, event) => Math.max(max, Number(event.articleCount || 0)), 0);
  const singleArticleEvents = events.filter(event => Number(event.articleCount || 0) === 1).length;
  const twoArticleEvents = events.filter(event => Number(event.articleCount || 0) === 2).length;
  const fivePlusArticleEvents = events.filter(event => Number(event.articleCount || 0) >= 5).length;
  const averageArticlesPerEvent = activeEventCount
    ? (totalEventArticles / activeEventCount).toFixed(1)
    : '0.0';

  return {
    activeEventCount,
    averageArticlesPerEvent,
    largestEventSize,
    singleArticleEvents,
    twoArticleEvents,
    fivePlusArticleEvents
  };
}

// This function logs a compact run summary for incremental event assignment.
export async function logEventProcessingSummary(userId, articles, runContext) {
  const totalArticles = articles.length;
  const linkedToExisting = Number(runContext.stats.linkedToExistingEventCount || 0);
  const newEventsCreated = Number(runContext.stats.newEventsCreatedCount || 0);
  const unassigned = Number(runContext.stats.topicOnlyNoVectorCount || 0) +
    Number(runContext.stats.topicOnlyInsufficientCandidatesCount || 0) +
    Number(runContext.stats.eventVectorSkippedCount || 0);
  const reuseRatio = totalArticles ? ((linkedToExisting / totalArticles) * 100).toFixed(1) : '0.0';
  const newEventRatio = totalArticles ? ((newEventsCreated / totalArticles) * 100).toFixed(1) : '0.0';
  const activeEventSummary = await summarizeActiveEvents(userId);

  console.log('');
  console.log(eventSummaryLine('Unclustered articles', totalArticles));
  console.log(eventSummaryLine('Active events', activeEventSummary.activeEventCount));
  console.log('');
  console.log(eventSummaryLine('Articles linked to events', linkedToExisting));
  console.log(eventSummaryLine('New events created', newEventsCreated));
  console.log(eventSummaryLine('Unassigned', unassigned));
  console.log('');
  console.log(eventSummaryLine('Event reuse ratio', `${reuseRatio}%`));
  console.log(eventSummaryLine('New event ratio', `${newEventRatio}%`));
  console.log('');
  console.log(eventSummaryLine('Average articles per event', activeEventSummary.averageArticlesPerEvent));
  console.log(eventSummaryLine('Largest event size', `${activeEventSummary.largestEventSize} articles`));
  console.log('');
  console.log(`[EVENT] events 1 Article=${activeEventSummary.singleArticleEvents}`);
  console.log(`[EVENT] events 2 Articles=${activeEventSummary.twoArticleEvents}`);
  console.log(`[EVENT] events with 5+ Articles=${activeEventSummary.fivePlusArticleEvents}`);
}
