import { parseStringPromise } from 'xml2js';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  addFeedSubscription,
  isFeedManagementError,
  normalizeFeedUrl
} from './feedManagement.js';
import { buildFeedUrlIdentity } from './feedUrlIdentity.js';
import {
  OPML_CONNECTION_STATUSES,
  testOpmlConnection
} from './opmlConnection.js';

// Provides the shared dependencies used by this service.
const { Category, Feed, FeedUrlAlias } = db;

// Defines the opml import max bytes enforced by this service.
export const OPML_IMPORT_MAX_BYTES = 1024 * 1024;
export const OPML_PREVIEW_JSON_MAX_BYTES = OPML_IMPORT_MAX_BYTES * 8;
export const OPML_PREVIEW_TIMEOUT_MS = 4 * 60 * 1000 + 45 * 1000;
const OPML_CONNECTION_CONCURRENCY = 4;

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

// This function marks subscriptions already owned or repeated within the OPML file.
const markSubscriptionState = async ({ userId, subscriptions }) => {
  const candidates = subscriptions.map(subscription => {
    try {
      return {
        identity: buildFeedUrlIdentity(subscription.inputUrl),
        exactUrl: normalizeFeedUrl(subscription.inputUrl)
      };
    } catch {
      return null;
    }
  });
  const duplicateIndexes = new Set();
  const seenIdentities = new Set();
  for (const [index, candidate] of candidates.entries()) {
    if (!candidate) continue;
    const identityKey =
      `${candidate.identity.normalizedUrlHash}:${candidate.identity.normalizedUrl}`;
    if (seenIdentities.has(identityKey)) duplicateIndexes.add(index);
    else seenIdentities.add(identityKey);
  }
  if (!userId) {
    return subscriptions.map((subscription, index) => ({
      ...subscription,
      alreadySubscribed: false,
      duplicateInFile: duplicateIndexes.has(index)
    }));
  }

  const validCandidates = candidates.filter(Boolean);
  if (validCandidates.length === 0) {
    return subscriptions.map(subscription => ({
      ...subscription,
      alreadySubscribed: false,
      duplicateInFile: false
    }));
  }

  const [aliases, feeds] = await Promise.all([
    FeedUrlAlias.findAll({
      where: {
        userId,
        normalizedUrlHash: {
          [Op.in]: [...new Set(validCandidates.map(
            candidate => candidate.identity.normalizedUrlHash
          ))]
        }
      },
      attributes: ['normalizedUrl', 'normalizedUrlHash']
    }),
    Feed.findAll({
      where: {
        userId,
        url: {
          [Op.in]: [...new Set(validCandidates.map(candidate => candidate.exactUrl))]
        }
      },
      attributes: ['url']
    })
  ]);
  const aliasIdentities = new Set(aliases.map(alias =>
    `${alias.normalizedUrlHash}:${alias.normalizedUrl}`
  ));
  const exactUrls = new Set(feeds.map(feed => feed.url));

  return subscriptions.map((subscription, index) => {
    const candidate = candidates[index];
    const alreadySubscribed = Boolean(candidate) && (
      aliasIdentities.has(
        `${candidate.identity.normalizedUrlHash}:${candidate.identity.normalizedUrl}`
      ) || exactUrls.has(candidate.exactUrl)
    );
    return {
      ...subscription,
      alreadySubscribed,
      duplicateInFile: duplicateIndexes.has(index)
    };
  });
};

// This function performs bounded header-only checks for importable subscriptions.
export const markOpmlConnectionStatus = async (
  { userId, subscriptions, deadlineAt },
  {
    connectionTest = testOpmlConnection,
    clock = Date.now,
    onProgress = () => {}
  } = {}
) => {
  const results = subscriptions.map(subscription => ({
    ...subscription,
    connectionStatus: OPML_CONNECTION_STATUSES.NOT_CHECKED
  }));
  if (!userId) return results;

  const pendingIndexes = results
    .map((subscription, index) => ({ subscription, index }))
    .filter(({ subscription }) =>
      !subscription.alreadySubscribed && !subscription.duplicateInFile
    )
    .map(({ index }) => index);
  let cursor = 0;
  const worker = async () => {
    while (cursor < pendingIndexes.length) {
      if (clock() >= deadlineAt) return;
      const index = pendingIndexes[cursor];
      cursor += 1;
      const connectionStatus = await connectionTest(
        results[index].inputUrl,
        { deadlineAt }
      );
      results[index].connectionStatus = connectionStatus;
      if (connectionStatus !== OPML_CONNECTION_STATUSES.NOT_CHECKED) onProgress();
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(OPML_CONNECTION_CONCURRENCY, pendingIndexes.length) },
      () => worker()
    )
  );
  return results;
};

// This function parses one bounded OPML upload and marks deterministic duplicates.
export const prepareOpmlSubscriptions = async ({ userId, content }) => {
  // Rejects non-buffer input so request parameter types cannot alter validation.
  if (!Buffer.isBuffer(content)) {
    throw new OpmlImportError('Invalid OPML content');
  }
  const buffer = content;
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
  const parsedSubscriptions = collectFeedImports(parsed?.opml?.body?.outline);
  // Rejects processing when imports count is value.
  if (parsedSubscriptions.length === 0) {
    throw new OpmlImportError('Invalid OPML format');
  }
  const [identifiedSubscriptions, existingCategories] = await Promise.all([
    markSubscriptionState({
      userId,
      subscriptions: parsedSubscriptions
    }),
    userId
      ? Category.findAll({
          where: { userId },
          attributes: ['name'],
          order: [['name', 'ASC']]
        })
      : []
  ]);
  return {
    subscriptions: identifiedSubscriptions,
    existingCategoryNames: existingCategories.map(category => category.name)
  };
};

// This function builds the editable preview contract from prepared subscriptions.
export const buildOpmlPreview = ({ subscriptions, existingCategoryNames = [] }) => {
  const categoryIdentity = name => String(name || '').trim().toLowerCase();
  const existingNames = new Map(existingCategoryNames.map(name => [
    categoryIdentity(name),
    name
  ]));
  const categoryCounts = new Map();
  for (const subscription of subscriptions) {
    if (!subscription.categoryName) continue;
    const identity = categoryIdentity(subscription.categoryName);
    const existing = categoryCounts.get(identity);
    categoryCounts.set(identity, {
      name: existingNames.get(identity) || existing?.name || subscription.categoryName,
      subscriptionCount: (existing?.subscriptionCount || 0) + 1
    });
  }

  const categoryOptions = new Map(existingCategoryNames.map(name => [
    categoryIdentity(name),
    {
      name,
      alreadyExists: true,
      fromOpml: false
    }
  ]));
  for (const [identity, category] of categoryCounts) {
    const existing = categoryOptions.get(identity);
    categoryOptions.set(identity, {
      name: existing?.name || category.name,
      alreadyExists: existing?.alreadyExists === true,
      fromOpml: true
    });
  }

  return {
    subscriptionCount: subscriptions.length,
    categories: [...categoryCounts.values()],
    categoryOptions: [...categoryOptions.values()],
    subscriptions: subscriptions.map(subscription => ({
      ...subscription,
      ...(subscription.categoryName
        ? {
            categoryName: categoryCounts.get(
              categoryIdentity(subscription.categoryName)
            )?.name || subscription.categoryName
          }
        : {}),
      selectedForImport: !subscription.alreadySubscribed &&
        !subscription.duplicateInFile
    }))
  };
};

// This function parses and validates one OPML upload synchronously for legacy callers.
export const previewOpmlSubscriptions = async ({ userId, content }) => {
  const deadlineAt = Date.now() + OPML_PREVIEW_TIMEOUT_MS;
  const prepared = await prepareOpmlSubscriptions({ userId, content });
  const subscriptions = await markOpmlConnectionStatus({
    userId,
    subscriptions: prepared.subscriptions,
    deadlineAt
  });
  return buildOpmlPreview({
    subscriptions,
    existingCategoryNames: prepared.existingCategoryNames
  });
};

// This function validates the editable JSON contract before importing it.
const previewSubscriptions = preview => {
  if (!preview || typeof preview !== 'object' || !Array.isArray(preview.subscriptions)) {
    throw new OpmlImportError('Invalid OPML preview');
  }
  if (preview.subscriptions.length === 0) {
    throw new OpmlImportError('Invalid OPML preview');
  }

  return preview.subscriptions.map(subscription => {
    if (
      !subscription ||
      typeof subscription !== 'object' ||
      typeof subscription.inputUrl !== 'string' ||
      !subscription.inputUrl.trim()
    ) {
      throw new OpmlImportError('Invalid OPML preview');
    }

    for (const field of ['title', 'description', 'categoryName']) {
      if (
        subscription[field] !== undefined &&
        typeof subscription[field] !== 'string'
      ) {
        throw new OpmlImportError('Invalid OPML preview');
      }
    }
    if (
      subscription.alreadySubscribed !== undefined &&
      typeof subscription.alreadySubscribed !== 'boolean'
    ) {
      throw new OpmlImportError('Invalid OPML preview');
    }
    if (
      subscription.duplicateInFile !== undefined &&
      typeof subscription.duplicateInFile !== 'boolean'
    ) {
      throw new OpmlImportError('Invalid OPML preview');
    }
    if (typeof subscription.selectedForImport !== 'boolean') {
      throw new OpmlImportError('Invalid OPML preview');
    }
    if (
      subscription.connectionStatus !== undefined &&
      !Object.values(OPML_CONNECTION_STATUSES).includes(
        subscription.connectionStatus
      )
    ) {
      throw new OpmlImportError('Invalid OPML preview');
    }

    return {
      inputUrl: subscription.inputUrl,
      title: subscription.title || undefined,
      description: subscription.description === undefined
        ? undefined
        : subscription.description,
      categoryName: subscription.categoryName || undefined,
      alreadySubscribed: subscription.alreadySubscribed === true,
      duplicateInFile: subscription.duplicateInFile === true,
      selectedForImport: subscription.selectedForImport,
      connectionStatus: subscription.connectionStatus ||
        OPML_CONNECTION_STATUSES.NOT_CHECKED
    };
  });
};

// This function imports a preview through the same guarded subscription service as the API.
export const importOpmlPreview = async ({ userId, preview }) => {
  const subscriptions = previewSubscriptions(preview);
  const selectedSubscriptions = subscriptions.filter(
    subscription => subscription.selectedForImport
  );
  const imports = selectedSubscriptions.filter(subscription =>
    !subscription.alreadySubscribed && !subscription.duplicateInFile
  );

  // Derives the categories before through count while performing import opml subscriptions.
  const categoriesBefore = await Category.count({ where: { userId } });
  let feedsCreated = 0;
  let feedsExisting = selectedSubscriptions.length - imports.length;
  let feedsFailed = 0;

  // Creation is sequential so category and alias updates remain bounded.
  for (const subscription of imports) {
    try {
      // Derives the result through add feed subscription while performing import opml subscriptions.
      const result = await addFeedSubscription({
        userId,
        ...subscription,
        useDefaultCategory: !subscription.categoryName,
        allowExisting: true,
        skipDiscovery: true
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

// This function preserves file-based imports for Google Reader compatibility.
export const importOpmlSubscriptions = async ({ userId, content }) => {
  const preview = await previewOpmlSubscriptions({ content });
  return importOpmlPreview({ userId, preview });
};
