export const READER_TEXT_SIZES = ['small', 'medium', 'large'];
const STORAGE_KEY = 'rssmonster.readerTextSize';

export function readReaderTextSize() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return READER_TEXT_SIZES.includes(saved) ? saved : 'medium';
  } catch {
    return 'medium';
  }
}

export function saveReaderTextSize(value) {
  if (!READER_TEXT_SIZES.includes(value)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Reader typography remains usable when browser storage is blocked or full.
  }
}
