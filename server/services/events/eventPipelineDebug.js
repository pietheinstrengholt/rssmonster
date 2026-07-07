import db from '../../models/index.js';
import { Op } from 'sequelize';

const { Event } = db;
const ACTIVE_EVENT_STATUSES = ['emerging', 'active', 'cooling'];
const EVENT_SUMMARY_LABEL_WIDTH = 35;

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

// This function counts articles assigned to events created during the current run.
async function countArticlesInRunCreatedEvents(userId, runContext) {
  const newEventIds = [...(runContext.newEventIds || [])]
    .map(Number)
    .filter(Number.isFinite);

  if (!newEventIds.length) return 0;

  const events = await Event.findAll({
    where: {
      id: { [Op.in]: newEventIds },
      userId
    },
    attributes: ['articleCount'],
    raw: true
  });

  return events.reduce((sum, event) => sum + Number(event.articleCount || 0), 0);
}

// This function logs a compact run summary for incremental event assignment.
export async function logEventProcessingSummary(userId, articles, runContext) {
  const totalArticles = articles.length;
  // Existing-event assignments count only articles attached to an event that already existed.
  // New-event assignments count all articles contained in events created during this run.
  const joinedExistingEvents = Number(runContext.stats.linkedToExistingEventCount || 0);
  const assignedToNewEvents = await countArticlesInRunCreatedEvents(userId, runContext);
  const totalAssignedToEvents = joinedExistingEvents + assignedToNewEvents;
  const newEventsCreated = Number(runContext.stats.newEventsCreatedCount || 0);
  const skippedEventVector = Number(runContext.stats.topicOnlyNoVectorCount || 0) +
    Number(runContext.stats.eventVectorSkippedCount || 0);
  const leftStandalone = Math.max(totalArticles - totalAssignedToEvents - skippedEventVector, 0);
  const reuseRatio = totalArticles ? ((joinedExistingEvents / totalArticles) * 100).toFixed(1) : '0.0';
  const newEventRatio = totalArticles ? ((newEventsCreated / totalArticles) * 100).toFixed(1) : '0.0';
  const totalAssignmentRatio = totalArticles ? ((totalAssignedToEvents / totalArticles) * 100).toFixed(1) : '0.0';
  const activeEventSummary = await summarizeActiveEvents(userId);

  console.log('');
  console.log(eventSummaryLine('Input articles', totalArticles));
  console.log(eventSummaryLine('Active events', activeEventSummary.activeEventCount));
  console.log('');
  console.log(eventSummaryLine('Articles joined existing events', joinedExistingEvents));
  console.log(eventSummaryLine('Articles assigned to new events', assignedToNewEvents));
  console.log(eventSummaryLine('Total articles assigned to events', totalAssignedToEvents));
  if (skippedEventVector) {
    console.log(eventSummaryLine('Articles skipped event-vector', skippedEventVector));
  }
  console.log(eventSummaryLine('Articles left standalone', leftStandalone));
  console.log('');
  console.log(eventSummaryLine('New events created', newEventsCreated));
  console.log('');
  console.log(eventSummaryLine('Existing-event assignment ratio', `${reuseRatio}%`));
  console.log(eventSummaryLine('New-event creation ratio', `${newEventRatio}%`));
  console.log(eventSummaryLine('Total event assignment ratio', `${totalAssignmentRatio}%`));
  console.log('');
  console.log(eventSummaryLine('Average articles per event', activeEventSummary.averageArticlesPerEvent));
  console.log(eventSummaryLine('Largest event size', `${activeEventSummary.largestEventSize} articles`));
  console.log('');
  console.log(`[EVENT] events 1 Article=${activeEventSummary.singleArticleEvents}`);
  console.log(`[EVENT] events 2 Articles=${activeEventSummary.twoArticleEvents}`);
  console.log(`[EVENT] events with 5+ Articles=${activeEventSummary.fivePlusArticleEvents}`);
}
