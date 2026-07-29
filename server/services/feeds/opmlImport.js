import { parseStringPromise } from 'xml2js';
import db from '../../models/index.js';
import {
  addFeedSubscription,
  isFeedManagementError
} from './feedManagement.js';

const { Category } = db;

export const OPML_IMPORT_MAX_BYTES = 1024 * 1024;

// This class identifies invalid OPML import requests without exposing internals.
export class OpmlImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OpmlImportError';
  }
}

// This function returns every outline as an array.
const outlineArray = value => value
  ? Array.isArray(value) ? value : [value]
  : [];

// This function reads one non-empty OPML outline attribute.
const outlineAttribute = (outline, name) => {
  const value = outline?.$?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

// This function collects feed imports while preserving OPML category nesting.
const collectFeedImports = (outlines, inheritedCategory = '') =>
  outlineArray(outlines).flatMap(outline => {
    const xmlUrl = outlineAttribute(outline, 'xmlUrl');
    const title = outlineAttribute(outline, 'text') ||
      outlineAttribute(outline, 'title');
    if (xmlUrl) {
      return [{
        inputUrl: xmlUrl,
        title: title || undefined,
        description: outlineAttribute(outline, 'description') || undefined,
        categoryName: inheritedCategory || undefined
      }];
    }

    const categoryName = title || inheritedCategory;
    return collectFeedImports(outline?.outline, categoryName);
  });

// This function imports OPML through the same guarded subscription service as the API.
export const importOpmlSubscriptions = async ({ userId, content }) => {
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(String(content || ''), 'utf8');
  if (!buffer.length) throw new OpmlImportError('No OPML file provided');
  if (buffer.length > OPML_IMPORT_MAX_BYTES) {
    throw new OpmlImportError('OPML file is too large');
  }

  let parsed;
  try {
    parsed = await parseStringPromise(buffer.toString('utf8'), {
      trim: true,
      explicitArray: false
    });
  } catch {
    throw new OpmlImportError('Invalid OPML format');
  }
  const imports = collectFeedImports(parsed?.opml?.body?.outline);
  if (imports.length === 0) {
    throw new OpmlImportError('Invalid OPML format');
  }

  const categoriesBefore = await Category.count({ where: { userId } });
  let feedsCreated = 0;
  let feedsExisting = 0;
  let feedsFailed = 0;

  // Discovery is intentionally sequential to avoid an unbounded outbound burst.
  for (const subscription of imports) {
    try {
      const result = await addFeedSubscription({
        userId,
        ...subscription,
        useDefaultCategory: !subscription.categoryName,
        allowExisting: true
      });
      if (result.created) feedsCreated += 1;
      else feedsExisting += 1;
    } catch (error) {
      if (!isFeedManagementError(error)) {
        console.error('Error importing OPML subscription:', error);
      }
      feedsFailed += 1;
    }
  }

  const categoriesAfter = await Category.count({ where: { userId } });
  return {
    categoriesCreated: Math.max(0, categoriesAfter - categoriesBefore),
    feedsCreated,
    feedsExisting,
    feedsFailed
  };
};
