process.env.NODE_ENV = 'test';
process.env.DB_USERNAME = 'rssmonster';
process.env.DB_PASSWORD = 'rssmonster';
process.env.DB_DATABASE = 'rssmonstertest';
process.env.DB_HOSTNAME = process.env.DB_HOSTNAME || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-used-for-sign-and-verify';
process.env.FEVER_CREDENTIAL_SECRET =
  process.env.FEVER_CREDENTIAL_SECRET || 'test-fever-credential-secret';
