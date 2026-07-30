import { parseStringPromise } from 'xml2js';
import db from '../../models/index.js';
import {
  addFeedSubscription,
  isFeedManagementError
} from './feedManagement.js';

// Provides the shared dependencies used by this service.
const { Category } = db;

// Defines the opml import max bytes enforced by this service.
export const OPML_IMPORT_MAX_BYTES = 1024 * 1024;

// This class identifies invalid OPML import requests without exposing internals.
export class OpmlImportError extends Error {
  // Performs the constructor operation.
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
  // Selects the result based on whether value is string and trim succeeds.
  return typeof value === 'string' && value.trim() ? value.trim() : '';
};

// This function collects feed imports while preserving OPML category nesting.
const collectFeedImports = (outlines, inheritedCategory = '') =>
  outlineArray(outlines).flatMap(outline => {
    // Derives the xml url through outline attribute while collecting feed imports.
    const xmlUrl = outlineAttribute(outline, 'xmlUrl');
    // Derives the title required while collecting feed imports.
    const title = outlineAttribute(outline, 'text') ||
      outlineAttribute(outline, 'title');
    // Returns an empty result when xml url is available.
    if (xmlUrl) {
      return [{
        inputUrl: xmlUrl,
        title: title || undefined,
        description: outlineAttribute(outline, 'description') || undefined,
        categoryName: inheritedCategory || undefined
      }];
    }

    // Derives the category name required while collecting feed imports.
    const categoryName = title || inheritedCategory;
    return collectFeedImports(outline?.outline, categoryName);
  });

// This function imports OPML through the same guarded subscription service as the API.
export const importOpmlSubscriptions = async ({ userId, content }) => {
  // Selects the buffer based on whether content is buffer.
  const buffer = Buffer.isBuffer(content)
    ? content
    : Buffer.from(String(content || ''), 'utf8');
  // Rejects processing when buffer is empty.
  if (!buffer.length) throw new OpmlImportError('No OPML file provided');
  // Rejects processing when buffer count exceeds opml import max bytes.
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
  // Collects the feed imports while performing import opml subscriptions.
  const imports = collectFeedImports(parsed?.opml?.body?.outline);
  // Rejects processing when imports count is value.
  if (imports.length === 0) {
    throw new OpmlImportError('Invalid OPML format');
  }

  // Derives the categories before through count while performing import opml subscriptions.
  const categoriesBefore = await Category.count({ where: { userId } });
  let feedsCreated = 0;
  let feedsExisting = 0;
  let feedsFailed = 0;

  // Discovery is intentionally sequential to avoid an unbounded outbound burst.
  for (const subscription of imports) {
    try {
      // Derives the result through add feed subscription while performing import opml subscriptions.
      const result = await addFeedSubscription({
        userId,
        ...subscription,
        useDefaultCategory: !subscription.categoryName,
        allowExisting: true
      });
      // Handles the case where result created is available.
      if (result.created) feedsCreated += 1;
      else feedsExisting += 1;
    } catch (error) {
      // Handles the case where error is not feed management error.
      if (!isFeedManagementError(error)) {
        console.error('Error importing OPML subscription:', error);
      }
      feedsFailed += 1;
    }
  }

  // Derives the categories after through count while performing import opml subscriptions.
  const categoriesAfter = await Category.count({ where: { userId } });
  return {
    categoriesCreated: Math.max(0, categoriesAfter - categoriesBefore),
    feedsCreated,
    feedsExisting,
    feedsFailed
  };
};
