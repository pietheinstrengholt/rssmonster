import db from '../../../models/index.js';
import { extractOccurrenceFeatures } from '../../events/occurrenceFeatures.js';

// These are grammatical/news terms, not durable named subjects. Never use generated labels here.
const GENERIC = new Set(('the a an new existing current local officials official research programme program project plans public services transport news report reports update updates release releases launch launches announced announcing security train collision crash passengers january february march april may june july august september october november december os first later').split(' '));
const normalize = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function topicSubject(title) {
  const features = extractOccurrenceFeatures({ title });
  // Preserve mixed-case provider/product names (for example OpenAI or macOS) without changing Event extraction.
  const namedTokens = String(title || '').match(/\b[A-Z][A-Za-z0-9]*[a-z][A-Za-z0-9]*\b/g) || [];
  const entities = [...new Set([...features.entities, ...namedTokens.map(word => word.toLowerCase()),
    ...features.versions.map(version => version.product).filter(Boolean)])].filter(word => !GENERIC.has(word));
  return { entities, locations: features.locations, incident: /\b(?:collision|crash|derailment|shooting|earthquake)\b/i.test(title || ''), normalized: normalize(title) };
}
export function compareTopicSubjects(leftTitle, rightTitle) {
  const left = topicSubject(leftTitle);
  const right = topicSubject(rightTitle);
  const entityOverlap = left.entities.filter(entity => right.entities.includes(entity));
  const incidentLocationConflict = left.incident && right.incident && left.locations.length && right.locations.length
    && !left.locations.some(place => right.locations.includes(place));
  const sameSourceTitle = Boolean(left.normalized && left.normalized === right.normalized);
  return { entityOverlap, durableMatch: !incidentLocationConflict && entityOverlap.length > 0,
    incidentLocationConflict: Boolean(incidentLocationConflict), sameSourceTitle };
}

// Stable earliest member Event names anchor identity; Topic/Island labels are presentation only.
export async function loadTopicSubjectEvidence(topics, userId) {
  if (!topics.length) return new Map();
  const links = await db.EventTopic.findAll({ where: { topicId: topics.map(t => t.id) },
    attributes: ['topicId', [db.sequelize.fn('MIN', db.sequelize.col('eventId')), 'anchorEventId'],
      [db.sequelize.fn('COUNT', db.sequelize.col('eventId')), 'memberEventCount']], group: ['topicId'], raw: true });
  const events = links.length ? await db.Event.findAll({ where: { userId, id: links.map(l => l.anchorEventId) }, attributes: ['id', 'name'], raw: true }) : [];
  const byId = new Map(events.map(e => [Number(e.id), e.name]));
  return new Map(topics.map(topic => {
    const link = links.find(l => Number(l.topicId) === Number(topic.id));
    return [Number(topic.id), { anchorEventId: Number(link?.anchorEventId || topic.sourceEventId || 0), title: byId.get(Number(link?.anchorEventId)) || topic.sourceEventTitle || '', memberEventCount: Number(link?.memberEventCount || 0) }];
  }));
}
