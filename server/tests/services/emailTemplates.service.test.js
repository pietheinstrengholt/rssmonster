import { describe, expect, it } from 'vitest';
import {
  EmailTemplateError,
  renderEmailTemplate
} from '../../services/email/emailTemplates.js';

describe('email templates', () => {
  it.each([
    ['email_verification', { actionUrl: 'https://rss.example.com/verify?token=abc' }],
    ['password_reset', { actionUrl: 'https://rss.example.com/reset?token=abc' }],
    ['daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      preferencesUrl: 'https://rss.example.com/settings',
      subjectDate: 'September 2',
      timezone: 'Europe/Amsterdam',
      recommended: [{
        articleId: 1,
        headline: 'A useful development',
        excerpt: 'A concise summary.',
        source: 'Example Feed',
        publishedAt: '2026-09-02T08:00:00.000Z',
        url: 'https://example.com/article'
      }],
      topStories: []
    }],
    ['test_email', { publicAppUrl: 'https://rss.example.com' }]
  ])('renders reusable HTML and plain text for %s', (templateType, payload) => {
    const message = renderEmailTemplate(templateType, payload);

    expect(message.subject).toBeTruthy();
    expect(message.text).toContain('https://');
    expect(message.html).toContain('<!doctype html>');
    expect(message.html).not.toContain('<script');
  });

  it('escapes publisher-controlled briefing text', () => {
    const message = renderEmailTemplate('daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      preferencesUrl: 'https://rss.example.com/settings',
      timezone: 'UTC',
      recommended: [{
        articleId: 1,
        headline: '<script>alert("headline")</script>',
        excerpt: '<img src=x onerror=alert(1)>',
        source: 'Feed & source',
        publishedAt: '2026-09-02T08:00:00.000Z',
        url: 'https://example.com/article?one=1&two=2'
      }],
      topStories: []
    });

    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('<img');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('Feed &amp; source');
    expect(message.html).toContain('one=1&amp;two=2');
  });

  it('renders RSSMonster-styled sections, metadata, actions, and matching plain text', () => {
    const message = renderEmailTemplate('daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      preferencesUrl: 'https://rss.example.com/settings/account',
      timezone: 'Europe/Amsterdam',
      recommended: [{
        articleId: 1,
        headline: 'Recommended headline',
        excerpt: 'Recommended excerpt.',
        source: 'Recommended Source',
        publishedAt: '2026-09-02T08:00:00.000Z',
        url: 'https://example.com/recommended'
      }],
      topStories: [{
        articleId: 2,
        headline: 'Top story headline',
        excerpt: 'Top story excerpt.',
        source: 'Top Story Source',
        publishedAt: '2026-09-03T08:00:00.000Z',
        url: 'https://example.com/top-story'
      }]
    });

    expect(message.html).toContain('<span style="color:#f97316">RSS</span>Monster');
    expect(message.html).toContain('Recommended');
    expect(message.html).toContain('Top Stories');
    expect(message.html).toContain('Recommended Source · Sep 2, 2026');
    expect(message.html).toContain('Open full briefing');
    expect(message.html).toContain('Manage account and email preferences');
    expect(message.html).toContain('@media only screen and (max-width:600px)');
    expect(message.text).toContain('RECOMMENDED');
    expect(message.text).toContain('TOP STORIES');
    expect(message.text).toContain('Recommended excerpt.');
    expect(message.text).toContain('Open full briefing: https://rss.example.com/briefing');
  });

  it('rejects duplicate article IDs across digest sections', () => {
    const sharedArticle = {
      articleId: 1,
      headline: 'Shared headline',
      source: 'Shared Source',
      publishedAt: '2026-09-02T08:00:00.000Z',
      url: 'https://example.com/shared'
    };

    expect(() => renderEmailTemplate('daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      preferencesUrl: 'https://rss.example.com/settings',
      timezone: 'UTC',
      recommended: [sharedArticle],
      topStories: [sharedArticle]
    })).toThrow('articleId must be unique');
  });

  it('renders an empty briefing without failing delivery', () => {
    const message = renderEmailTemplate('daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      preferencesUrl: 'https://rss.example.com/settings',
      timezone: 'UTC',
      recommended: [],
      topStories: []
    });

    expect(message.text).toContain('No new articles were received for your daily digest.');
    expect(message.html).toContain('No new articles were received for your daily digest.');
  });

  it('keeps dynamic subject text on one header line', () => {
    const message = renderEmailTemplate('daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      preferencesUrl: 'https://rss.example.com/settings',
      timezone: 'UTC',
      subjectDate: 'September 2\r\nBcc: attacker@example.com',
      recommended: [],
      topStories: []
    });

    expect(message.subject).not.toContain('\r');
    expect(message.subject).not.toContain('\n');
  });

  it.each([
    ['unknown', {}],
    ['email_verification', { actionUrl: 'javascript:alert(1)' }],
    ['password_reset', {}],
    ['daily_digest', {
      briefingUrl: 'https://rss.example.com',
      preferencesUrl: 'https://rss.example.com/settings',
      recommended: 'not-an-array',
      topStories: []
    }],
    ['test_email', { publicAppUrl: 'ftp://rss.example.com' }]
  ])('rejects invalid template input for %s', (templateType, payload) => {
    expect(() => renderEmailTemplate(templateType, payload)).toThrow(EmailTemplateError);
  });
});
