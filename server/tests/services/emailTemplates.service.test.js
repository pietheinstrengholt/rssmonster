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
      subjectDate: 'September 2',
      items: [{
        headline: 'A useful development',
        text: 'A concise summary.',
        source: 'Example Feed',
        url: 'https://example.com/article'
      }]
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
      items: [{
        headline: '<script>alert("headline")</script>',
        text: '<img src=x onerror=alert(1)>',
        source: 'Feed & source',
        url: 'https://example.com/article?one=1&two=2'
      }]
    });

    expect(message.html).not.toContain('<script>');
    expect(message.html).not.toContain('<img');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).toContain('Feed &amp; source');
    expect(message.html).toContain('one=1&amp;two=2');
  });

  it('renders an empty briefing without failing delivery', () => {
    const message = renderEmailTemplate('daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      items: []
    });

    expect(message.text).toContain('No stories matched');
    expect(message.html).toContain('Your briefing is quiet today');
  });

  it('keeps dynamic subject text on one header line', () => {
    const message = renderEmailTemplate('daily_digest', {
      briefingUrl: 'https://rss.example.com/briefing',
      subjectDate: 'September 2\r\nBcc: attacker@example.com',
      items: []
    });

    expect(message.subject).not.toContain('\r');
    expect(message.subject).not.toContain('\n');
  });

  it.each([
    ['unknown', {}],
    ['email_verification', { actionUrl: 'javascript:alert(1)' }],
    ['password_reset', {}],
    ['daily_digest', { briefingUrl: 'https://rss.example.com', items: 'not-an-array' }],
    ['test_email', { publicAppUrl: 'ftp://rss.example.com' }]
  ])('rejects invalid template input for %s', (templateType, payload) => {
    expect(() => renderEmailTemplate(templateType, payload)).toThrow(EmailTemplateError);
  });
});
