const TEMPLATE_TYPES = new Set([
  'email_verification',
  'password_reset',
  'daily_digest',
  'test_email'
]);
const MAX_DAILY_BRIEFING_ITEMS = 10;

export class EmailTemplateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailTemplateError';
    this.code = 'EMAIL_TEMPLATE_INVALID';
    this.retryable = false;
  }
}

const requiredText = (value, field, maxLength = 500) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) {
    throw new EmailTemplateError(`${field} must be a non-empty string`);
  }
  return normalized;
};

const optionalText = (value, maxLength = 2000) => {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, maxLength) : '';
};

const optionalHeaderText = (value, maxLength) =>
  optionalText(value, maxLength).replace(/\s+/g, ' ');

const requiredHttpUrl = (value, field) => {
  let url;
  try {
    url = new URL(requiredText(value, field, 8192));
  } catch {
    throw new EmailTemplateError(`${field} must be a valid HTTP or HTTPS URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new EmailTemplateError(`${field} must be a valid HTTP or HTTPS URL`);
  }
  return url.toString();
};

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const renderLayout = ({ title, introduction, content, action = null, footer }) => {
  const actionHtml = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" ` +
      'style="background:#2563eb;border-radius:6px;color:#fff;display:inline-block;' +
      `padding:12px 18px;text-decoration:none">${escapeHtml(action.label)}</a></p>`
    : '';
  return '<!doctype html><html><body style="background:#f5f7fa;margin:0;padding:24px">' +
    '<main style="background:#fff;border-radius:8px;color:#172033;font-family:Arial,sans-serif;' +
    'margin:0 auto;max-width:640px;padding:32px">' +
    `<h1 style="font-size:24px;margin:0 0 20px">${escapeHtml(title)}</h1>` +
    `<p style="line-height:1.5">${escapeHtml(introduction)}</p>` +
    content + actionHtml +
    `<p style="color:#667085;font-size:13px;line-height:1.5;margin-top:28px">${escapeHtml(footer)}</p>` +
    '</main></body></html>';
};

const renderVerification = payload => {
  const actionUrl = requiredHttpUrl(payload.actionUrl, 'actionUrl');
  return {
    subject: 'Verify your RSSMonster email address',
    text: `Verify your RSSMonster email address:\n\n${actionUrl}\n\n` +
      'If you did not request this, you can ignore this email.',
    html: renderLayout({
      title: 'Verify your email address',
      introduction: 'Confirm this address before RSSMonster uses it for account email.',
      content: '',
      action: { label: 'Verify email address', url: actionUrl },
      footer: 'If you did not request this, you can ignore this email.'
    })
  };
};

const renderPasswordReset = payload => {
  const actionUrl = requiredHttpUrl(payload.actionUrl, 'actionUrl');
  return {
    subject: 'Reset your RSSMonster password',
    text: `Reset your RSSMonster password:\n\n${actionUrl}\n\n` +
      'If you did not request a password reset, you can ignore this email.',
    html: renderLayout({
      title: 'Reset your password',
      introduction: 'Use the button below to choose a new RSSMonster password.',
      content: '',
      action: { label: 'Reset password', url: actionUrl },
      footer: 'If you did not request a password reset, you can ignore this email.'
    })
  };
};

const normalizeBriefingItems = (items, field, seenIds) => {
  if (!Array.isArray(items) || items.length > MAX_DAILY_BRIEFING_ITEMS) {
    throw new EmailTemplateError(
      `${field} must be an array with at most ${MAX_DAILY_BRIEFING_ITEMS} entries`
    );
  }
  return items.map((item, index) => {
    const articleId = Number(item?.articleId);
    if (!Number.isSafeInteger(articleId) || articleId <= 0 || seenIds.has(articleId)) {
      throw new EmailTemplateError(`${field}[${index}].articleId must be unique and positive`);
    }
    const publishedAt = new Date(item?.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) {
      throw new EmailTemplateError(`${field}[${index}].publishedAt must be a valid date`);
    }
    seenIds.add(articleId);
    return {
      articleId,
      headline: requiredText(item?.headline, `${field}[${index}].headline`, 500),
      excerpt: optionalText(item?.excerpt),
      source: requiredText(item?.source, `${field}[${index}].source`, 320),
      publishedAt,
      url: requiredHttpUrl(item?.url, `${field}[${index}].url`)
    };
  });
};

const formatPublicationDate = (date, timezone) => new Intl.DateTimeFormat('en-US', {
  timeZone: timezone,
  dateStyle: 'medium'
}).format(date);

const renderStoryHtml = (item, timezone) => {
  const metadata = `${item.source} · ${formatPublicationDate(item.publishedAt, timezone)}`;
  return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" ' +
    'style="border-collapse:separate;margin:0 0 14px"><tr><td style="background:#ffffff;' +
    'border:1px solid #e5e7eb;border-left:4px solid #f97316;border-radius:8px;padding:18px">' +
    `<div style="color:#6b7280;font-size:12px;line-height:1.5;margin:0 0 7px">${escapeHtml(metadata)}</div>` +
    `<a href="${escapeHtml(item.url)}" style="color:#172033;font-size:18px;font-weight:700;` +
    `line-height:1.35;text-decoration:none">${escapeHtml(item.headline)}</a>` +
    (item.excerpt
      ? `<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:10px 0 0">${escapeHtml(item.excerpt)}</p>`
      : '') +
    `<p style="margin:12px 0 0"><a href="${escapeHtml(item.url)}" style="color:#ea580c;` +
    'font-size:13px;font-weight:700;text-decoration:none">Read article →</a></p>' +
    '</td></tr></table>';
};

const renderBriefingSectionHtml = (title, items, timezone) => items.length
  ? `<h2 style="color:#9a3412;font-size:13px;letter-spacing:0.08em;margin:28px 0 12px;` +
    `text-transform:uppercase">${escapeHtml(title)}</h2>` +
    items.map(item => renderStoryHtml(item, timezone)).join('')
  : '';

const renderBriefingSectionText = (title, items, timezone) => items.length
  ? `${title.toUpperCase()}\n${'-'.repeat(title.length)}\n\n` + items.map((item, index) => [
    `${index + 1}. ${item.headline}`,
    `${item.source} · ${formatPublicationDate(item.publishedAt, timezone)}`,
    item.excerpt,
    item.url
  ].filter(Boolean).join('\n')).join('\n\n')
  : '';

const renderDailyBriefing = payload => {
  const briefingUrl = requiredHttpUrl(payload.briefingUrl, 'briefingUrl');
  const preferencesUrl = requiredHttpUrl(payload.preferencesUrl, 'preferencesUrl');
  const timezone = requiredText(payload.timezone || 'UTC', 'timezone', 64);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new EmailTemplateError('timezone must be a valid IANA timezone');
  }
  const seenIds = new Set();
  const recommended = normalizeBriefingItems(payload.recommended, 'recommended', seenIds);
  const topStories = normalizeBriefingItems(payload.topStories, 'topStories', seenIds);
  const articleCount = recommended.length + topStories.length;
  const subjectDate = optionalHeaderText(payload.subjectDate, 100);
  const subject = payload.testMode
    ? 'RSSMonster daily briefing test — example email'
    : subjectDate
      ? `Your RSSMonster briefing for ${subjectDate}`
      : 'Your RSSMonster daily briefing';
  const emptyMessage = 'No new articles were received for your daily digest.';
  const textSections = [
    renderBriefingSectionText('Recommended', recommended, timezone),
    renderBriefingSectionText('Top Stories', topStories, timezone)
  ].filter(Boolean).join('\n\n');
  const text = articleCount
    ? `RSSMonster Daily Briefing\n\n${textSections}`
    : `RSSMonster Daily Briefing\n\n${emptyMessage}`;
  const htmlSections =
    renderBriefingSectionHtml('Recommended', recommended, timezone) +
    renderBriefingSectionHtml('Top Stories', topStories, timezone);

  return {
    subject,
    text: `${text}\n\nOpen full briefing: ${briefingUrl}\n\nManage email preferences: ${preferencesUrl}`,
    html: '<!doctype html><html><head><meta name="viewport" content="width=device-width,' +
      ' initial-scale=1"><style>@media only screen and (max-width:600px){.rss-shell{' +
      'width:100%!important}.rss-pad{padding:20px 14px!important}}</style></head>' +
      '<body style="background:#f3f4f6;margin:0;padding:0"><table role="presentation" width="100%" ' +
      'cellspacing="0" cellpadding="0" style="border-collapse:collapse"><tr><td align="center" ' +
      'style="padding:24px 10px"><table class="rss-shell" role="presentation" width="640" ' +
      'cellspacing="0" cellpadding="0" style="border-collapse:separate;max-width:640px;width:100%">' +
      '<tr><td style="background:#172033;border-radius:10px 10px 0 0;padding:22px 28px">' +
      '<div style="color:#ffffff;font-family:Arial,sans-serif;font-size:22px;font-weight:800">' +
      '<span style="color:#f97316">RSS</span>Monster</div>' +
      '<div style="color:#d1d5db;font-family:Arial,sans-serif;font-size:13px;margin-top:5px">' +
      'Your daily briefing</div></td></tr><tr><td class="rss-pad" style="background:#fff7ed;' +
      'border-top:5px solid #f97316;padding:28px;font-family:Arial,sans-serif">' +
      (articleCount
        ? '<p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0">' +
          'Fresh stories selected from your feeds.</p>' + htmlSections
        : `<p style="background:#ffffff;border:1px solid #fed7aa;border-radius:8px;color:#7c2d12;` +
          `font-size:15px;line-height:1.6;margin:0;padding:20px">${escapeHtml(emptyMessage)}</p>`) +
      `<p style="margin:28px 0 8px;text-align:center"><a href="${escapeHtml(briefingUrl)}" ` +
      'style="background:#f97316;border-radius:7px;color:#ffffff;display:inline-block;font-size:15px;' +
      'font-weight:700;padding:13px 20px;text-decoration:none">Open full briefing</a></p>' +
      '</td></tr><tr><td style="background:#172033;border-radius:0 0 10px 10px;color:#9ca3af;' +
      'font-family:Arial,sans-serif;font-size:12px;line-height:1.6;padding:20px 28px;text-align:center">' +
      `This email follows your RSSMonster Daily Briefing preferences.<br><a href="${escapeHtml(preferencesUrl)}" ` +
      'style="color:#fdba74;text-decoration:underline">Manage account and email preferences</a>' +
      '</td></tr></table></td></tr></table></body></html>'
  };
};

const renderTestEmail = payload => {
  const publicAppUrl = requiredHttpUrl(payload.publicAppUrl, 'publicAppUrl');
  return {
    subject: 'RSSMonster test email',
    text: `Your RSSMonster email configuration is working.\n\n${publicAppUrl}`,
    html: renderLayout({
      title: 'Email configuration works',
      introduction: 'RSSMonster successfully delivered this test message.',
      content: '',
      action: { label: 'Open RSSMonster', url: publicAppUrl },
      footer: 'This message was requested from your RSSMonster installation.'
    })
  };
};

// Renders one bounded provider-neutral message for durable outbox persistence.
export const renderEmailTemplate = (templateType, payload = {}) => {
  if (!TEMPLATE_TYPES.has(templateType)) {
    throw new EmailTemplateError(`Unsupported email template: ${templateType}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new EmailTemplateError('Email template payload must be an object');
  }
  if (templateType === 'email_verification') return renderVerification(payload);
  if (templateType === 'password_reset') return renderPasswordReset(payload);
  if (templateType === 'daily_digest') return renderDailyBriefing(payload);
  return renderTestEmail(payload);
};
