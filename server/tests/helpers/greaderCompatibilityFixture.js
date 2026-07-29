import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import {
  createFeverApiKey,
  createFeverCredentialHash,
  createGreaderActionToken,
  createGreaderAuthToken
} from '../../utils/apiCredentials.js';
import {
  serializeGreaderItemId
} from '../../services/greader/itemIds.js';

const { Article, Category, Feed, User } = db;

let fixtureSequence = 0;

export const TEST_PASSWORD = 'password';
export const READING_LIST_STREAM = 'user/-/state/com.google/reading-list';
export const READ_STREAM = 'user/-/state/com.google/read';
export const STARRED_STREAM = 'user/-/state/com.google/starred';
export const LABEL_PREFIX = 'user/-/label/';

// This function creates a unique username for a Google Reader test fixture.
const nextUsername = () => {
  fixtureSequence += 1;
  return `greader-compat-${Date.now()}-${fixtureSequence}@example.test`;
};

// This function creates a real account with the credential formats used by the API.
export const createGreaderUser = async (username = nextUsername()) =>
  User.create({
    username,
    password: await bcrypt.hash(TEST_PASSWORD, 4),
    feverCredentialHash: createFeverCredentialHash(
      createFeverApiKey(username, TEST_PASSWORD)
    )
  });

// This function creates the Authorization value accepted by Google Reader routes.
export const greaderAuthHeaderFor = user =>
  `GoogleLogin auth=${user.username}/${createGreaderAuthToken(user)}`;

// This function creates the action token required by Google Reader mutations.
export const greaderActionTokenFor = user => {
  const authToken = createGreaderAuthToken(user);
  return createGreaderActionToken(user, authToken);
};

// This function converts a database article ID to a Google Reader item ID.
export const toGreaderItemId = id =>
  serializeGreaderItemId(id);

// This function converts a date to the microsecond timestamp accepted by mutations.
export const toUsec = date => String(new Date(date).getTime() * 1000);

// This function creates an article while keeping fixture timestamps explicit.
const createArticle = (fixture, values) =>
  Article.create({
    userId: fixture.user.id,
    status: 'unread',
    favoriteInd: 0,
    author: 'Fixture Reporter',
    description: 'Fixture fallback description',
    contentHtml: '<p>Fixture sanitized body</p>',
    firstSeen: new Date('2026-05-01T09:05:00.000Z'),
    createdAt: new Date('2026-05-01T09:06:00.000Z'),
    updatedAt: new Date('2026-05-01T09:06:00.000Z'),
    ...values
  });

// This function creates realistic feeds and articles for compatibility tests.
export const createGreaderCompatibilityFixture = async (options = {}) => {
  const user = await createGreaderUser(options.username);
  const primaryCategory = await Category.create({
    userId: user.id,
    name: 'Tech / News',
    categoryOrder: 1
  });
  const secondaryCategory = await Category.create({
    userId: user.id,
    name: 'Research',
    categoryOrder: 2
  });
  const primaryFeed = await Feed.create({
    userId: user.id,
    categoryId: primaryCategory.id,
    feedName: 'Alpha Feed',
    feedDesc: 'Alpha feed description',
    url: 'https://alpha.example.test/rss.xml',
    favicon: 'https://alpha.example.test/favicon.ico'
  });
  const secondaryFeed = await Feed.create({
    userId: user.id,
    categoryId: secondaryCategory.id,
    feedName: 'Beta Feed',
    feedDesc: 'Beta feed description',
    url: 'https://beta.example.test/feed'
  });

  const fixture = {
    user,
    primaryCategory,
    secondaryCategory,
    primaryFeed,
    secondaryFeed
  };

  fixture.oldUnread = await createArticle(fixture, {
    feedId: primaryFeed.id,
    url: 'https://alpha.example.test/articles/old',
    title: 'Old unread article',
    contentOriginal: '<script>window.publisherPayload = true</script><p>Raw old body</p>',
    contentHtml: '<p>Sanitized old body</p>',
    publishedAt: new Date('2026-05-01T09:00:00.000Z')
  });
  fixture.sameTimestampRead = await createArticle(fixture, {
    feedId: primaryFeed.id,
    status: 'read',
    readAt: new Date('2026-05-01T10:10:00.000Z'),
    url: 'https://alpha.example.test/articles/read',
    title: 'Read article',
    publishedAt: new Date('2026-05-01T10:00:00.000Z'),
    firstSeen: new Date('2026-05-01T10:05:00.000Z'),
    createdAt: new Date('2026-05-01T10:06:00.000Z'),
    updatedAt: new Date('2026-05-01T10:06:00.000Z')
  });
  fixture.sameTimestampStarred = await createArticle(fixture, {
    feedId: secondaryFeed.id,
    favoriteInd: 1,
    url: 'https://beta.example.test/articles/starred',
    title: 'Starred article',
    publishedAt: new Date('2026-05-01T10:00:00.000Z'),
    firstSeen: new Date('2026-05-01T10:07:00.000Z'),
    createdAt: new Date('2026-05-01T10:08:00.000Z'),
    updatedAt: new Date('2026-05-01T10:08:00.000Z')
  });
  fixture.newUnread = await createArticle(fixture, {
    feedId: secondaryFeed.id,
    url: 'https://beta.example.test/articles/new',
    title: 'New unread article',
    author: null,
    description: 'Description used when content HTML is absent',
    contentHtml: null,
    publishedAt: new Date('2026-05-01T11:00:00.000Z'),
    firstSeen: null,
    createdAt: new Date('2026-05-01T11:02:00.000Z'),
    updatedAt: new Date('2026-05-01T11:02:00.000Z')
  });
  fixture.duplicate = await createArticle(fixture, {
    feedId: secondaryFeed.id,
    status: 'duplicate',
    duplicateOfArticleId: fixture.oldUnread.id,
    url: 'https://beta.example.test/articles/duplicate',
    title: 'Duplicate article',
    publishedAt: new Date('2026-05-01T11:30:00.000Z'),
    firstSeen: new Date('2026-05-01T11:31:00.000Z'),
    createdAt: new Date('2026-05-01T11:31:00.000Z'),
    updatedAt: new Date('2026-05-01T11:31:00.000Z')
  });
  fixture.filtered = await createArticle(fixture, {
    feedId: primaryFeed.id,
    filteredInd: true,
    url: 'https://alpha.example.test/articles/filtered',
    title: 'Filtered article',
    publishedAt: new Date('2026-05-01T12:00:00.000Z'),
    firstSeen: new Date('2026-05-01T12:01:00.000Z'),
    createdAt: new Date('2026-05-01T12:01:00.000Z'),
    updatedAt: new Date('2026-05-01T12:01:00.000Z')
  });

  fixture.canonicalArticles = [
    fixture.oldUnread,
    fixture.sameTimestampRead,
    fixture.sameTimestampStarred,
    fixture.newUnread
  ];

  return fixture;
};
