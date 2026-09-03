import { describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import {
  EmailConfigurationError,
  getEmailConfiguration,
  getEmailConfigurationStatus,
  isEmailEnabled,
  normalizeEmailAddress
} from '../../config/email.js';

const enabledEnvironment = overrides => ({
  EMAIL_ENABLED: 'true',
  PUBLIC_APP_URL: 'https://rss.example.com/',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_REQUIRE_TLS: 'true',
  EMAIL_FROM: 'RSSMonster <RSS@Example.com>',
  ...overrides
});

describe('email configuration', () => {
  it('defaults to disabled without requiring any email configuration', () => {
    expect(isEmailEnabled({})).toBe(false);
    expect(getEmailConfiguration({})).toEqual({ enabled: false });
  });

  it('remains disabled when SMTP values exist without the explicit feature flag', () => {
    const readFile = vi.fn();
    expect(getEmailConfiguration({
      PUBLIC_APP_URL: 'not validated while disabled',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PASSWORD: 'unused-secret',
      SMTP_PASSWORD_FILE: '/unused/secret'
    }, { readFile })).toEqual({ enabled: false });
    expect(readFile).not.toHaveBeenCalled();
  });

  it('reports enabled and configured independently without exposing configuration values', () => {
    expect(getEmailConfigurationStatus(enabledEnvironment())).toEqual({
      configured: true,
      enabled: true
    });
    expect(getEmailConfigurationStatus(enabledEnvironment({ EMAIL_ENABLED: 'false' })))
      .toEqual({ configured: true, enabled: false });
    expect(getEmailConfigurationStatus({ EMAIL_ENABLED: 'true' }))
      .toEqual({ configured: false, enabled: true });
    expect(Object.keys(getEmailConfigurationStatus(enabledEnvironment())))
      .toEqual(['enabled', 'configured']);
  });

  it('resolves an authenticated STARTTLS configuration', () => {
    const config = getEmailConfiguration(enabledEnvironment({
      SMTP_USER: 'mailer-user',
      SMTP_PASSWORD: 'mailer-password',
      EMAIL_REPLY_TO: ' Support@Example.com '
    }));

    expect(config).toMatchObject({
      enabled: true,
      publicAppUrl: 'https://rss.example.com',
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        requireTls: true,
        pool: false,
        auth: { user: 'mailer-user' }
      },
      from: { name: 'RSSMonster', address: 'rss@example.com' },
      replyTo: 'support@example.com'
    });
    expect(config.smtp.auth.pass).toBe('mailer-password');
    expect(Object.keys(config.smtp.auth)).not.toContain('pass');
    expect(JSON.stringify(config)).not.toContain('mailer-password');
    expect(inspect(config)).not.toContain('mailer-password');
  });

  it('supports an unauthenticated local SMTP relay', () => {
    const config = getEmailConfiguration(enabledEnvironment({
      SMTP_PORT: '25',
      SMTP_REQUIRE_TLS: 'false'
    }));

    expect(config.smtp).toMatchObject({
      port: 25,
      secure: false,
      requireTls: false,
      auth: null
    });
  });

  it('uses immediate TLS defaults on port 465', () => {
    const config = getEmailConfiguration(enabledEnvironment({
      SMTP_PORT: '465',
      SMTP_SECURE: undefined,
      SMTP_REQUIRE_TLS: undefined
    }));

    expect(config.smtp).toMatchObject({ port: 465, secure: true, requireTls: false });
  });

  it('optionally enables SMTP connection pooling', () => {
    const config = getEmailConfiguration(enabledEnvironment({ SMTP_POOL: 'true' }));
    expect(config.smtp.pool).toBe(true);
  });

  it('loads an SMTP password from a mounted secret file', () => {
    const readFile = vi.fn().mockReturnValue('file-password\n');
    const config = getEmailConfiguration(enabledEnvironment({
      SMTP_USER: 'mailer-user',
      SMTP_PASSWORD_FILE: '/run/secrets/rssmonster_smtp_password'
    }), { readFile });

    expect(readFile).toHaveBeenCalledWith(
      '/run/secrets/rssmonster_smtp_password',
      'utf8'
    );
    expect(config.smtp.auth.pass).toBe('file-password');
  });

  it.each([
    ['PUBLIC_APP_URL'],
    ['SMTP_HOST'],
    ['EMAIL_FROM']
  ])('requires %s only when email is enabled', missingName => {
    const environment = enabledEnvironment();
    delete environment[missingName];

    expect(() => getEmailConfiguration(environment)).toThrow(
      `${missingName} is required when email is enabled`
    );
  });

  it('rejects simultaneous inline and file-based passwords', () => {
    expect(() => getEmailConfiguration(enabledEnvironment({
      SMTP_USER: 'mailer-user',
      SMTP_PASSWORD: 'inline-password',
      SMTP_PASSWORD_FILE: '/run/secrets/smtp-password'
    }))).toThrow('SMTP_PASSWORD and SMTP_PASSWORD_FILE are mutually exclusive');
  });

  it.each([
    [{ SMTP_USER: 'mailer-user' }],
    [{ SMTP_PASSWORD: 'password-without-user' }],
    [{ SMTP_PASSWORD_FILE: '/password-without-user' }]
  ])('rejects incomplete SMTP authentication %#', overrides => {
    expect(() => getEmailConfiguration(enabledEnvironment(overrides), {
      readFile: () => 'file-password'
    })).toThrow(
      'SMTP_USER and an SMTP password must either both be configured or both be omitted'
    );
  });

  it.each([
    [{ EMAIL_ENABLED: 'yes' }, 'EMAIL_ENABLED must be either true or false'],
    [{ SMTP_POOL: 'yes' }, 'SMTP_POOL must be either true or false'],
    [{ SMTP_PORT: '0' }, 'SMTP_PORT must be an integer between 1 and 65535'],
    [{ SMTP_PORT: '65536' }, 'SMTP_PORT must be an integer between 1 and 65535'],
    [{ SMTP_PORT: '587', SMTP_SECURE: 'true' }, 'SMTP_SECURE must be false'],
    [{ SMTP_PORT: '465', SMTP_SECURE: 'false' }, 'SMTP_SECURE must be true'],
    [{ SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_REQUIRE_TLS: 'true' },
      'SMTP_REQUIRE_TLS applies to STARTTLS']
  ])('rejects contradictory transport configuration %#', (overrides, message) => {
    expect(() => getEmailConfiguration(enabledEnvironment(overrides))).toThrow(message);
  });

  it.each([
    ['relative/path', 'PUBLIC_APP_URL must be a valid absolute URL'],
    ['ftp://rss.example.com', 'PUBLIC_APP_URL must use HTTP or HTTPS'],
    ['https://user:pass@rss.example.com', 'must not contain credentials'],
    ['https://rss.example.com?token=value', 'must not contain a query or fragment']
  ])('rejects an unsafe public application URL: %s', (publicAppUrl, message) => {
    expect(() => getEmailConfiguration(enabledEnvironment({
      PUBLIC_APP_URL: publicAppUrl
    }))).toThrow(message);
  });

  it('rejects unreadable and empty password files without exposing contents', () => {
    expect(() => getEmailConfiguration(enabledEnvironment({
      SMTP_USER: 'mailer-user',
      SMTP_PASSWORD_FILE: '/missing/secret'
    }), {
      readFile: () => { throw new Error('secret contents'); }
    })).toThrow('SMTP_PASSWORD_FILE could not be read');

    expect(() => getEmailConfiguration(enabledEnvironment({
      SMTP_USER: 'mailer-user',
      SMTP_PASSWORD_FILE: '/empty/secret'
    }), {
      readFile: () => ''
    })).toThrow('SMTP_PASSWORD_FILE must not be empty');
  });

  it('normalizes email addresses and rejects invalid values', () => {
    expect(normalizeEmailAddress(' Person+Digest@Example.COM '))
      .toBe('person+digest@example.com');
    expect(() => normalizeEmailAddress('not-an-address')).toThrow(EmailConfigurationError);
    expect(() => getEmailConfiguration(enabledEnvironment({
      EMAIL_FROM: 'RSSMonster <invalid>'
    }))).toThrow('Email address is invalid');
  });
});
