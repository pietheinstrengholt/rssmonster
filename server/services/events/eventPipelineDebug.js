import db from '../../models/index.js';
import { Op } from 'sequelize';

// Provides the shared dependencies used by this service.
const { Event } = db;
// Defines the active event statuses enforced by this service.
const ACTIVE_EVENT_STATUSES = ['emerging', 'active', 'cooling'];
// Defines the event summary label width enforced by this service.
const EVENT_SUMMARY_LABEL_WIDTH = 35;

// This function formats one aligned line in the event processing summary.
export function eventSummaryLine(label, value) {
  // Derives the dots through repeat while performing event summary line.
  const dots = '.'.repeat(Math.max(1, EVENT_SUMMARY_LABEL_WIDTH - label.length));
  return `[EVENT] ${label}${dots} ${value}`;
}

// This function summarizes currently active events for the user after clustering work.
export async function summarizeActiveEvents(userId) {
  // Loads the events needed while performing summarize active events.
  const events = await Event.findAll({
    where: {
      userId,
      status: { [Op.in]: ACTIVE_EVENT_STATUSES }
    },
    attributes: ['articleCount'],
    raw: true
  });

  const activeEventCount = events.length;
  // Aggregates source values into the total event articles used while performing summarize active events.
  const totalEventArticles = events.reduce((sum, event) => sum + Number(event.articleCount || 0), 0);
  // Aggregates source values into the largest event size used while performing summarize active events.
  const largestEventSize = events.reduce((max, event) => Math.max(max, Number(event.articleCount || 0)), 0);
  // Filters source values to the entries eligible while performing summarize active events.
  const singleArticleEvents = events.filter(event => Number(event.articleCount || 0) === 1).length;
  // Filters source values to the entries eligible while performing summarize active events.
  const twoArticleEvents = events.filter(event => Number(event.articleCount || 0) === 2).length;
  // Filters source values to the entries eligible while performing summarize active events.
  const fivePlusArticleEvents = events.filter(event => Number(event.articleCount || 0) >= 5).length;
  // Selects the average articles per event based on whether active event count is available.
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
  // Keeps the new event id entries eligible while performing count articles in run created events.
  const newEventIds = [...(runContext.newEventIds || [])]
    .map(Number)
    .filter(Number.isFinite);

  // Returns early when new event id is empty.
  if (!newEventIds.length) return 0;

  // Loads the events needed while performing count articles in run created events.
  const events = await Event.findAll({
    where: {
      id: { [Op.in]: newEventIds },
      userId
    },
    attributes: ['articleCount'],
    raw: true
  });

  // Aggregates source values into the result produced while performing count articles in run created events.
  return events.reduce((sum, event) => sum + Number(event.articleCount || 0), 0);
}

// This function logs a compact run summary for incremental event assignment.
export async function logEventProcessingSummary(userId, articles, runContext) {
  const totalArticles = articles.length;
  // Existing-event assignments count only articles attached to an event that already existed.
  // New-event assignments count all articles contained in events created during this run.
  const joinedExistingEvents = Number(runContext.stats.linkedToExistingEventCount || 0);
  // Derives the assigned to new events through count articles in run created events while performing log event processing summary.
  const assignedToNewEvents = await countArticlesInRunCreatedEvents(userId, runContext);
  // Derives the total assigned to events required while performing log event processing summary.
  const totalAssignedToEvents = joinedExistingEvents + assignedToNewEvents;
  // Coerces the new events created into the representation required while performing log event processing summary.
  const newEventsCreated = Number(runContext.stats.newEventsCreatedCount || 0);
  // Derives the skipped event vector required while performing log event processing summary.
  const skippedEventVector = Number(runContext.stats.topicOnlyNoVectorCount || 0) +
    Number(runContext.stats.eventVectorSkippedCount || 0);
  // Derives the left standalone through max while performing log event processing summary.
  const leftStandalone = Math.max(totalArticles - totalAssignedToEvents - skippedEventVector, 0);
  // Selects the reuse ratio based on whether total articles is available.
  const reuseRatio = totalArticles ? ((joinedExistingEvents / totalArticles) * 100).toFixed(1) : '0.0';
  // Selects the new event ratio based on whether total articles is available.
  const newEventRatio = totalArticles ? ((newEventsCreated / totalArticles) * 100).toFixed(1) : '0.0';
  // Selects the total assignment ratio based on whether total articles is available.
  const totalAssignmentRatio = totalArticles ? ((totalAssignedToEvents / totalArticles) * 100).toFixed(1) : '0.0';
  // Derives the active event summary through summarize active events while performing log event processing summary.
  const activeEventSummary = await summarizeActiveEvents(userId);

  console.log('');
  console.log(eventSummaryLine('Input articles', totalArticles));
  console.log(eventSummaryLine('Active events', activeEventSummary.activeEventCount));
  console.log('');
  console.log(eventSummaryLine('Articles joined existing events', joinedExistingEvents));
  console.log(eventSummaryLine('Articles assigned to new events', assignedToNewEvents));
  console.log(eventSummaryLine('Total articles assigned to events', totalAssignedToEvents));
  // Handles the case where skipped event vector is available.
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
