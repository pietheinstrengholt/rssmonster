import { describe, expect, it } from 'vitest';

import {
  evaluateTopicCreationGate,
  TOPIC_IDENTITY_THRESHOLD
} from '../../services/topics/shared/topicHelpers.js';

describe('evaluateTopicCreationGate', () => {
  it('preserves seed-evidence topic creation for durable multi-article events', () => {
    const gate = evaluateTopicCreationGate({
      currentEvent: {
        articleCount: 5,
        sourceCount: 3,
        eventStrength: 0.7,
        status: 'active',
        name: 'George Russell Mercedes qualifying setback'
      },
      topicSeedEvents: [{ event: { articleCount: 5 } }],
      seedArticleCount: 5,
      topSeedSimilarity: 1,
      topicName: 'George Russell / Mercedes'
    });

    expect(gate).toEqual({ passed: true, reason: 'seed-evidence' });
  });

  it('allows strong two-article multi-source events', () => {
    const gate = evaluateTopicCreationGate({
      currentEvent: {
        articleCount: 2,
        sourceCount: 2,
        eventStrength: 0.5,
        status: 'active',
        name: 'Starlink Wi-Fi launches on regional flights'
      },
      topicSeedEvents: [{ event: { articleCount: 2 } }],
      seedArticleCount: 2,
      topSeedSimilarity: 1,
      topicName: 'Starlink Wi-Fi'
    });

    expect(gate).toEqual({ passed: true, reason: 'strong-event' });
  });

  it('allows repeated entity evidence for identity-matched two-article events', () => {
    const gate = evaluateTopicCreationGate({
      currentEvent: {
        articleCount: 2,
        sourceCount: 1,
        eventStrength: 0.2,
        status: 'emerging',
        name: 'Starlink Wi-Fi expands to more aircraft'
      },
      topicSeedEvents: [{ event: { articleCount: 2 } }],
      seedArticleCount: 2,
      topSeedSimilarity: TOPIC_IDENTITY_THRESHOLD,
      topicName: 'Starlink Wi-Fi',
      currentEventArticleTitles: [
        'Starlink Wi-Fi arrives on United aircraft',
        'Regional airline adds Starlink Wi-Fi service'
      ]
    });

    expect(gate).toEqual({ passed: true, reason: 'repeat-entity' });
  });

  it('does not count the same event title twice as repeated entity evidence', () => {
    const gate = evaluateTopicCreationGate({
      semanticUnit: {
        title: 'Starlink Wi-Fi expands to more aircraft'
      },
      currentEvent: {
        articleCount: 2,
        sourceCount: 1,
        eventStrength: 0.2,
        status: 'emerging',
        name: 'Starlink Wi-Fi expands to more aircraft'
      },
      topicSeedEvents: [{ event: { articleCount: 2 } }],
      seedArticleCount: 2,
      topSeedSimilarity: TOPIC_IDENTITY_THRESHOLD,
      topicName: 'Starlink Wi-Fi'
    });

    expect(gate).toEqual({ passed: false, reason: null });
  });

  it('blocks single-article events even with seed-like evidence', () => {
    const gate = evaluateTopicCreationGate({
      currentEvent: {
        articleCount: 1,
        sourceCount: 2,
        eventStrength: 0.8,
        status: 'active',
        name: 'Starlink Wi-Fi launch'
      },
      topicSeedEvents: [{ event: { articleCount: 3 } }],
      seedArticleCount: 3,
      topSeedSimilarity: 1,
      topicName: 'Starlink Wi-Fi',
      currentEventArticleTitles: ['Starlink Wi-Fi launch']
    });

    expect(gate).toEqual({ passed: false, reason: null });
  });
});
