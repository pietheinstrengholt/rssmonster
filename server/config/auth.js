// This function returns the configured JWT signing secret.
export const getJwtSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing required env var: JWT_SECRET');
  }

  return process.env.JWT_SECRET;
};

// This function returns the configured Fever credential protection secret.
export const getFeverCredentialSecret = () => {
  if (!process.env.FEVER_CREDENTIAL_SECRET) {
    throw new Error('Missing required env var: FEVER_CREDENTIAL_SECRET');
  }

  return process.env.FEVER_CREDENTIAL_SECRET;
};
