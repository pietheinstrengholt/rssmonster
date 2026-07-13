import { createHash } from 'node:crypto';

// This function returns a SHA-256 hash for a normalized content value.
const hashValue = value => createHash('sha256').update(value, 'utf8').digest('hex');

// This function normalizes original feed source while preserving its markup structure.
export const normalizeOriginalContent = value => String(value || '')
  .replace(/\r\n?/g, '\n')
  .trim();

// This function normalizes visible article text for stable duplicate identity.
export const normalizeVisibleText = value => String(value || '')
  .replace(/\s+/g, ' ')
  .trim();

// This function hashes normalized original feed source content.
export const hashOriginalContent = value => hashValue(normalizeOriginalContent(value));

// This function hashes normalized visible article text.
export const hashVisibleText = value => hashValue(normalizeVisibleText(value));
