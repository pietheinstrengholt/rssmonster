const TEMPLATE_TYPES = new Set([
  'email_verification',
  'password_reset',
  'daily_digest',
  'test_email'
]);
const MAX_DAILY_BRIEFING_ITEMS = 50;

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

const normalizeBriefingItems = items => {
  if (!Array.isArray(items) || items.length > MAX_DAILY_BRIEFING_ITEMS) {
    throw new EmailTemplateError(
      `items must be an array with at most ${MAX_DAILY_BRIEFING_ITEMS} entries`
    );
  }
  return items.map((item, index) => ({
    headline: requiredText(item?.headline, `items[${index}].headline`, 500),
    text: optionalText(item?.text),
    source: optionalText(item?.source, 320),
    url: requiredHttpUrl(item?.url, `items[${index}].url`)
  }));
};

const renderDailyBriefing = payload => {
  const briefingUrl = requiredHttpUrl(payload.briefingUrl, 'briefingUrl');
  const items = normalizeBriefingItems(payload.items);
  const subjectDate = optionalHeaderText(payload.subjectDate, 100);
  const subject = subjectDate
    ? `Your RSSMonster briefing for ${subjectDate}`
    : 'Your RSSMonster daily briefing';
  const textItems = items.length
    ? items.map((item, index) => [
      `${index + 1}. ${item.headline}`,
      item.source,
      item.text,
      item.url
    ].filter(Boolean).join('\n')).join('\n\n')
    : 'No stories matched your briefing preferences.';
  const htmlItems = items.length
    ? '<ol style="padding-left:22px">' + items.map(item =>
      '<li style="margin-bottom:22px">' +
      `<a href="${escapeHtml(item.url)}" style="color:#1d4ed8;font-weight:700">` +
      `${escapeHtml(item.headline)}</a>` +
      (item.source ? `<div style="color:#667085;font-size:13px">${escapeHtml(item.source)}</div>` : '') +
      (item.text ? `<p style="line-height:1.5;margin:8px 0">${escapeHtml(item.text)}</p>` : '') +
      '</li>'
    ).join('') + '</ol>'
    : '<p>No stories matched your briefing preferences.</p>';

  return {
    subject,
    text: `${textItems}\n\nOpen your briefing:\n${briefingUrl}`,
    html: renderLayout({
      title: 'Your daily briefing',
      introduction: items.length
        ? 'Here are the stories selected from your feeds.'
        : 'Your briefing is quiet today.',
      content: htmlItems,
      action: { label: 'Open RSSMonster', url: briefingUrl },
      footer: 'You can change daily briefing email preferences in RSSMonster.'
    })
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
