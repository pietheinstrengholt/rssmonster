import { randomBytes } from 'node:crypto';

export const GENERATED_FEED_TOKEN_BYTES = 32;
const GENERATED_FEED_TOKEN_RETRY_LIMIT = 3;

// Identifies exhausted token-collision retries without exposing candidate tokens.
export class GeneratedFeedTokenGenerationError extends Error {
  constructor() {
    super('Unable to allocate a unique Generated Feed token.');
    this.name = 'GeneratedFeedTokenGenerationError';
  }
}

// Creates a cryptographically strong token suitable for an externally consumed URL.
export const createGeneratedFeedToken = () =>
  randomBytes(GENERATED_FEED_TOKEN_BYTES).toString('base64url');

// Runs one persistence operation with bounded retries for unique-token collisions.
export const persistWithGeneratedFeedToken = async (
  operation,
  {
    tokenFactory = createGeneratedFeedToken,
    maxAttempts = GENERATED_FEED_TOKEN_RETRY_LIMIT
  } = {}
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation(tokenFactory());
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
    }
  }

  throw new GeneratedFeedTokenGenerationError();
};
