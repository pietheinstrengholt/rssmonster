export class FeedAuthenticationError extends Error {
  constructor(field, message) {
    super(message);
    this.name = 'FeedAuthenticationError';
    this.field = field;
  }
}

// Empty edit passwords retain the locked record's secret without decrypting it.
export const normalizeFeedAuthentication = (input = {}, existing = null) => {
  const fields = ['authenticationType', 'authenticationUsername', 'authenticationPassword'];
  if (existing && !fields.some(field => input[field] !== undefined)) return {};
  const type = input.authenticationType === undefined ? existing?.authenticationType ?? null : input.authenticationType;
  if (type === null) return { authenticationType: null, authenticationUsername: null, authenticationPassword: null };
  if (type !== 'basic') throw new FeedAuthenticationError('authenticationType', 'Choose None or HTTP Basic.');
  const submittedUsername = input.authenticationUsername === undefined ? existing?.authenticationUsername : input.authenticationUsername;
  const username = typeof submittedUsername === 'string' ? submittedUsername.trimEnd() : submittedUsername;
  if (typeof username !== 'string' || !username.trim() || username.length > 255) {
    throw new FeedAuthenticationError('authenticationUsername', 'Enter a username of at most 255 characters.');
  }
  // Strip trailing paste whitespace consistently for validation and persistence.
  const password = typeof input.authenticationPassword === 'string' ? input.authenticationPassword.trimEnd() : input.authenticationPassword;
  const keepPassword = (password === '' || password === undefined) && existing?.authenticationType === 'basic' && existing.authenticationPassword;
  if (!keepPassword && (typeof password !== 'string' || !password)) {
    throw new FeedAuthenticationError('authenticationPassword', 'Enter a password.');
  }
  return {
    authenticationType: type,
    authenticationUsername: username,
    ...(!keepPassword ? { authenticationPassword: password } : {})
  };
};
