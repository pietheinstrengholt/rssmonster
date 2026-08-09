import db from '../models/index.js';
const { Feed, Category, Article, User, Hotlink } = db;
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';
import { Builder } from 'xml2js';
import { canonicalArticleWhere } from '../services/duplicates/articleDuplicates.js';
import {
  createFeverApiKey,
  createFeverCredentialHash
} from '../utils/apiCredentials.js';

//use Fever API
//specs: https://github.com/dasmurphy/tinytinyrss-fever-plugin/blob/master/fever-api.md

export const getFever = async (req, res, _next) => {
  try {
    if (requestFeverParameter(req, 'action') === 'login') {
      return postFever(req, res, _next);
    }

    const arr = responseBase();

    //return 200 with arr
    return sendFeverResponse(req, res, 200, arr);

  } catch (err) {
    console.error('Error in getFever:', err);
    return res.status(500).json({ error: err.message });
  }
};

export const postFever = async (req, res, _next) => {
  try {
    const arr = responseBase();
    const apiKey = await resolveFeverApiKey(req, res);

    //check if api_key is provided, clients implement the api_key in different ways
    if (apiKey) {
      console.log("api_key found");
      const credentialHash = createFeverCredentialHash(apiKey);
      const loggedInUser = await User.findOne({
          where: {
            feverCredentialHash: credentialHash
          }
        });
      if (!loggedInUser?.id) {
        //api_key is invalid
        return sendFeverResponse(req, res, 200, arr);
      } else {
        //api_key is valid
        arr['auth'] = 1;
        arr['last_refreshed_on_time'] = await getLastRefreshedOnTime(
          loggedInUser.id
        );

        //when argument is groups, retrieve list with categories names and id's
        if ("groups" in req.query) {
          const groups = [];
          const categories = await Category.findAll({
            where: {
              userId: loggedInUser.id
            },
            order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
          });
          if (categories) {
            categories.forEach(category => {
              const categoryObject = {
                id: category.id,
                title: category.name
              };
              groups.push(categoryObject);
            });
          }
          //append groups to arr
          arr['groups'] = groups;
        }

        //when argument is feeds, retrieve list with feed details
        if ("feeds" in req.query) {
          const feeds = [];
          const results = await Feed.findAll({
            where: {
              userId: loggedInUser.id
            },
            order: [['feedName', 'ASC']]
          });
          if (results) {
            results.forEach(feed => {
              const feedObject = {
                id: feed.id,
                favicon_id: feed.id, // Using feed id as favicon_id
                title: feed.feedName,
                url: feed.url, // RSS feed URL
                site_url: feed.url,
                is_spark: 0,
                last_updated_on_time: toFeverUnixTimestamp(feed.lastFetched)
              };
              feeds.push(feedObject);
            });
          }
          //append feeds to arr
          arr['feeds'] = feeds;
        }

        if ("groups" in req.query || "feeds" in req.query) {
          //create empty feeds_groups array
          const feeds_groups = [];

          //get all categories including feeds
          const categories = await Category.findAll({
            where: {
              userId: loggedInUser.id
            },
            include: [{
              model: Feed,
              required: true
            }],
            order: [['categoryOrder', 'ASC'], ['name', 'ASC']]
          });

          //if categories is defined
          if (categories) {
            categories.forEach((category) => {

              //create empty feedIds array
              const feedIds = [];

              //push all feed ids to the array
              category.feeds.forEach((feed) => {
                feedIds.push(feed.id);
              });

              //create a feedgroup object holding the category id and feeds (comma separated)
              const feedGroupObject = {
                group_id: category.id,
                feed_ids: feedIds.join(",")
              };

              //push the object to the feeds_groups array
              feeds_groups.push(feedGroupObject);
            });
          }
          //append feeds_groups to arr
          arr['feeds_groups'] = feeds_groups;
        }

        //return list with all unread article id's
        if ("unread_item_ids" in req.query) {
          const unread_item_ids = [];
          const articles = await Article.findAll({
            attributes: ["id"],
            where: {
              status: 'unread',
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
            },
            order: [['id', 'ASC']]
          });
          if (articles) {
            articles.forEach(article => {
              unread_item_ids.push(article.id);
            });
          }
          //string/comma-separated list of positive integers instead of array
          arr['unread_item_ids'] = unread_item_ids.join(",");
        }

        //return string/comma-separated list with id's from starred articles
        if ("saved_item_ids" in req.query) {
          const saved_item_ids = [];
          const articles = await Article.findAll({
            attributes: ["id"],
            where: {
              favoriteInd: 1,
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
            },
            order: [['id', 'ASC']]
          });
          if (articles) {
            articles.forEach(article => {
              saved_item_ids.push(article.id);
            });
          }
          //string/comma-separated list of positive integers instead of array
          arr['saved_item_ids'] = saved_item_ids.join(",");
        }

        //return articles with optional filtering
        if ("items" in req.query) {
          //add total number of articles to arr
          const total_articles = await Article.count({
            where: {
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
            }
          });
          arr['total_items'] = total_articles;

          //create empty items array where all articles will be pushed to
          const items = [];

          let articles;
          //request specific items, a maximum of 50 specific items requested by comma-separated argument
          if (hasQueryParameter(req.query, 'with_ids')) {
            //list with id's is comma-separated, so transform to array
            const arrayIds = parseFeverItemIds(req.query.with_ids);

            articles = arrayIds.length === 0
              ? []
              : await Article.findAll({
                  where: {
                    id: { [Op.in]: arrayIds },
                    userId: loggedInUser.id,
                    ...canonicalArticleWhere()
                  },
                  order: [['id', 'ASC']],
                  limit: 50
                });
            //request 50 additional items using the highest id of locally cached items
          } else if (hasQueryParameter(req.query, 'since_id')) {

            articles = await Article.findAll({
              where: {
                id: {
                  [Op.gt]: req.query.since_id
                },
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              },
              order: [['id', 'ASC']],
              limit: 50
            });
            //request 50 previous items using the lowest id of locally cached items
          } else if (hasQueryParameter(req.query, 'max_id')) {
            const maxId = Number(req.query.max_id);
            const where = {
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
            };

            if (Number.isSafeInteger(maxId) && maxId > 0) {
              where.id = { [Op.lt]: maxId };
            }

            articles = Number.isSafeInteger(maxId) && maxId >= 0
              ? await Article.findAll({
                  where,
                  order: [['id', 'DESC']],
                  limit: 50
                })
              : [];
            //if no argument is given provide total_items and up to 50 items
          } else {
            articles = await Article.findAll({
              where: {
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              },
              order: [['id', 'ASC']],
              limit: 50
            });
          }

          articles.forEach((article) => {
            const articleObject = {
              id: article.id,
              feed_id: parseInt(article.feedId),
              title: article.title,
              author: article.author || '',
              html: article.contentHtml || article.description || '',
              url: article.url || '',
              is_saved: parseInt(article.favoriteInd),
              is_read: (article.status === 'read' ? 1 : 0),
              created_on_time: Math.floor(article.publishedAt / 1000)
            };
            items.push(articleObject);
          });

          //add items to arr
          arr['items'] = items;

        }

        //when argument is links, return hot links
        if ("links" in req.query) {
          arr['links'] = await getFeverLinks(
            loggedInUser.id,
            req.query
          );
        }

        //favicons
        if ("favicons" in req.query) {
          const favicons = [];
          const feeds = await Feed.findAll({
            where: {
              userId: loggedInUser.id
            },
            order: [['feedName', 'ASC']]
          });
          if (feeds) {
            feeds.forEach(feed => {
              const faviconData = toFeverFaviconData(feed.favicon);
              if (!faviconData) return;

              const faviconObject = {
                id: feed.id,
                data: faviconData
              };
              favicons.push(faviconObject);
            });
          }
          //append favicons to arr
          arr['favicons'] = favicons;
        }

        const mark = req.body?.mark || req.query.mark;
        const markAs = req.body?.as || req.query.as;
        const markId = req.body?.id ?? req.query.id;
        const before = req.body?.before ?? req.query.before;
        const timestamp = feverUnixTimestampToDate(before);
        const unreadRecentlyRead = req.body?.unread_recently_read || req.query.unread_recently_read;

        //unread recently read items
        if (unreadRecentlyRead === '1') {
          // Mark recently read items as unread (within last 24 hours)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          await Article.update(
            { status: 'unread', readAt: null },
            {
              where: {
                status: 'read',
                readAt: { [Op.gte]: oneDayAgo },
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              }
            }
          );
          await appendFeverSyncIds(arr, loggedInUser.id, 'unread');
        }

        //check if mark argument is provided, which means that articles need to be updated
        if (mark && !isValidFeverMutation(mark, markAs, markId)) {
          return sendFeverResponse(req, res, 200, arr);
        }

        if (mark) {
          const update = genUpdate(markAs);
          let mutationHandled = false;

          //update per article item
          if (mark === "item" && markId !== undefined) {
            const itemIds = parseFeverItemIds(markId);

            if (itemIds.length > 0) {
              await Article.update(update, {
                where: {
                  id: { [Op.in]: itemIds },
                  userId: loggedInUser.id,
                  ...canonicalArticleWhere()
                }
              });
              mutationHandled = true;
            }
          }

          //update per feed
          if (mark === "feed" && markId !== undefined) {
            await Article.update(update, {
              where: {
                feedId: markId,
                publishedAt: {
                  [Op.lte]: timestamp
                },
                userId: loggedInUser.id,
                ...canonicalArticleWhere()
              }
            });
            mutationHandled = true;
          }

          //per group, a group should be specified with an id not equal to zero
          if (mark === "group" && markId !== undefined) {
            const where = {
              publishedAt: {
                [Op.lte]: timestamp
              },
              userId: loggedInUser.id,
              ...canonicalArticleWhere()
            };

            // id === '0' means all items (Kindling super group)
            // id === '-1' means Sparks super group (feeds with is_spark = 1)
            if (String(markId) === '-1') {
              mutationHandled = true;
            } else {
              if (String(markId) !== '0') {
                const categoryFeeds = await Feed.findAll({
                  attributes: ['id'],
                  where: {
                    categoryId: markId,
                    userId: loggedInUser.id
                  }
                });
                const feedIds = categoryFeeds.map(feed => feed.id);

                if (feedIds.length === 0) {
                  mutationHandled = true;
                } else {
                  where['feedId'] = {
                    [Op.in]: feedIds
                  };
                }
              }

              // Note: is_spark filtering would need to be added when that feature is implemented
              if (!mutationHandled) {
                await Article.update(update, {
                  where
                });
                mutationHandled = true;
              }
            }
          }

          if (mutationHandled) {
            await appendFeverSyncIds(arr, loggedInUser.id, markAs);
          }
        }
      }
    }


    //return 200 with arr
    return sendFeverResponse(req, res, 200, arr);
  } catch (err) {
    console.error('Error in postFever:', err);
    return res.status(500).json({ error: err.message });
  }
};

function responseBase() {
  // Start with the unauthenticated Fever response envelope.
  const auth = 0;

  //latest api version is 3
  const api_version = 3;

  return {
    api_version,
    auth
  };
}

// This function converts Fever collection arrays to their XML child element names.
function feverXmlEnvelope(response) {
  const collectionNames = {
    groups: 'group',
    feeds: 'feed',
    feeds_groups: 'feeds_group',
    favicons: 'favicon',
    items: 'item',
    links: 'link'
  };
  const envelope = {};

  for (const [key, value] of Object.entries(response)) {
    envelope[key] = Array.isArray(value)
      ? { [collectionNames[key] || 'item']: value }
      : value;
  }

  return { response: envelope };
}

// This function sends a Fever response in the requested JSON or XML representation.
function sendFeverResponse(req, res, status, response) {
  const wantsXml = typeof req.query.api === 'string' &&
    req.query.api.toLowerCase() === 'xml';

  if (!wantsXml) {
    return res.status(status).json(response);
  }

  const builder = new Builder({
    cdata: true,
    renderOpts: {
      pretty: false
    }
  });
  const xml = builder.buildObject(feverXmlEnvelope(response));

  res.set('Content-Type', 'text/xml; charset=utf-8');
  return res.status(status).send(xml);
}

// This function validates and normalizes a Fever MD5 wire-protocol key.
function normalizeFeverApiKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/i.test(value)) {
    return null;
  }

  return value.toLowerCase();
}

// This function reads a Fever parameter from POST data or the query string.
function requestFeverParameter(req, name) {
  return req.body?.[name] ?? req.query?.[name];
}

// This function reads one cookie without requiring global cookie middleware.
function requestCookie(req, name) {
  const cookieHeader = req.get('cookie');
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');
    if (separatorIndex < 0) continue;

    const cookieName = part.slice(0, separatorIndex).trim();
    if (cookieName !== name) continue;

    try {
      return decodeURIComponent(part.slice(separatorIndex + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

// This function authenticates the legacy Fever login and cookie flow.
async function resolveFeverApiKey(req, res) {
  const suppliedApiKey = requestFeverParameter(req, 'api_key');
  if (suppliedApiKey !== undefined && suppliedApiKey !== null) {
    return normalizeFeverApiKey(suppliedApiKey);
  }

  if (requestFeverParameter(req, 'action') === 'login') {
    const username = requestFeverParameter(req, 'username') ??
      requestFeverParameter(req, 'email');
    const password = requestFeverParameter(req, 'password');

    if (
      typeof username !== 'string' ||
      typeof password !== 'string' ||
      !username ||
      !password
    ) {
      return null;
    }

    const user = await User.findOne({ where: { username } });
    const passwordMatches = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!passwordMatches) return null;

    const apiKey = createFeverApiKey(user.username, password);
    res.cookie('fever_auth', apiKey, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      path: '/api/fever',
      sameSite: 'lax',
      secure: req.secure
    });
    return apiKey;
  }

  return normalizeFeverApiKey(requestCookie(req, 'fever_auth'));
}

// This function validates the mutation combinations supported by Fever clients.
function isValidFeverMutation(mark, state, id) {
  if (id === undefined || id === null) return false;

  if (mark === 'item') {
    return ['read', 'unread', 'saved', 'unsaved'].includes(state) &&
      parseFeverItemIds(id).length > 0;
  }

  const numericId = Number(id);
  if (!Number.isSafeInteger(numericId) || state !== 'read') return false;
  if (mark === 'feed') return numericId > 0;
  if (mark === 'group') return numericId >= -1;

  return false;
}

function genUpdate(req_body_as) {
  switch (req_body_as) {
    case "read":
      return {
        status: 'read',
        readAt: new Date()
      };

    case "unread":
      return {
        status: 'unread',
        readAt: null
      };

    case "saved":
      return {
        favoriteInd: 1
      };

    case "unsaved":
      return {
        favoriteInd: 0
      };
  }
}

function feverUnixTimestampToDate(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return new Date();
  }

  const seconds = numericValue > 10_000_000_000
    ? numericValue / 1000
    : numericValue;
  const timestamp = new Date(seconds * 1000);

  return Number.isNaN(timestamp.getTime())
    ? new Date()
    : timestamp;
}

// This function converts a stored date to a Fever Unix timestamp.
function toFeverUnixTimestamp(value) {
  const milliseconds = value ? new Date(value).getTime() : NaN;

  return Number.isFinite(milliseconds)
    ? Math.floor(milliseconds / 1000)
    : 0;
}

// This function checks whether decoded favicon bytes match their declared MIME type.
function hasFaviconSignature(mimeType, bytes) {
  const hex = bytes.subarray(0, 12).toString('hex');
  const ascii = bytes.subarray(0, 12).toString('ascii');

  switch (mimeType) {
    case 'image/png':
      return hex.startsWith('89504e470d0a1a0a');
    case 'image/gif':
      return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
    case 'image/jpeg':
      return hex.startsWith('ffd8ff');
    case 'image/webp':
      return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
    case 'image/x-icon':
    case 'image/vnd.microsoft.icon':
      return hex.startsWith('00000100');
    default:
      return false;
  }
}

// This function converts validated cached image data to Fever's favicon format.
function toFeverFaviconData(value) {
  if (typeof value !== 'string') return null;

  const normalizedValue = value.trim().replace(/^data:/i, '');
  const match = normalizedValue.match(
    /^(image\/(?:png|gif|jpeg|webp|x-icon|vnd\.microsoft\.icon));base64,([a-z0-9+/]+={0,2})$/i
  );

  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const encodedData = match[2];
  const bytes = Buffer.from(encodedData, 'base64');
  const normalizedBase64 = bytes.toString('base64');

  if (
    bytes.length === 0 ||
    normalizedBase64.replace(/=+$/, '') !== encodedData.replace(/=+$/, '') ||
    !hasFaviconSignature(mimeType, bytes)
  ) {
    return null;
  }

  return `${mimeType};base64,${normalizedBase64}`;
}

// This function returns the authenticated user's most recent feed refresh time.
async function getLastRefreshedOnTime(userId) {
  const lastFetched = await Feed.max('lastFetched', {
    where: { userId }
  });

  return String(toFeverUnixTimestamp(lastFetched));
}

// This function checks whether a Fever query argument was explicitly provided.
function hasQueryParameter(query, parameter) {
  return Object.prototype.hasOwnProperty.call(query, parameter);
}

// This function parses at most 50 positive Fever item identifiers.
function parseFeverItemIds(value) {
  const itemIds = String(value ?? '')
    .split(',')
    .map(id => Number(id.trim()))
    .filter(id => Number.isSafeInteger(id) && id > 0);

  return [...new Set(itemIds)].slice(0, 50);
}

// This function appends the current Fever state list required after a mutation.
async function appendFeverSyncIds(response, userId, state) {
  let responseField;
  let stateWhere;

  if (state === 'read' || state === 'unread') {
    responseField = 'unread_item_ids';
    stateWhere = { status: 'unread' };
  } else if (state === 'saved' || state === 'unsaved') {
    responseField = 'saved_item_ids';
    stateWhere = { favoriteInd: 1 };
  } else {
    return;
  }

  const articles = await Article.findAll({
    attributes: ['id'],
    where: {
      ...stateWhere,
      userId,
      ...canonicalArticleWhere()
    },
    order: [['id', 'ASC']]
  });

  response[responseField] = articles.map(article => article.id).join(',');
}

// This function returns a bounded non-negative Fever integer parameter.
function feverIntegerParameter(value, fallback, minimum = 0) {
  const number = Number(value);

  return Number.isSafeInteger(number) && number >= minimum
    ? number
    : fallback;
}

// This function creates a stable positive Fever identifier for an aggregated URL.
function feverLinkId(url) {
  let hash = 2166136261;

  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % 2147483647 || 1;
}

// This function aggregates Hotlink observations into one Fever Links page.
async function getFeverLinks(userId, query, now = new Date()) {
  const range = feverIntegerParameter(query.range, 7, 1);
  const offset = feverIntegerParameter(query.offset, 0);
  const page = feverIntegerParameter(query.page, 1, 1);
  const dayMilliseconds = 24 * 60 * 60 * 1000;
  const windowEnd = new Date(now.getTime() - offset * dayMilliseconds);
  const windowStart = new Date(windowEnd.getTime() - range * dayMilliseconds);
  const observations = await Hotlink.findAll({
    attributes: ['url', 'sourceArticleId', 'createdAt'],
    where: {
      userId,
      sourceArticleId: { [Op.ne]: null },
      createdAt: {
        [Op.gt]: windowStart,
        [Op.lte]: windowEnd
      }
    },
    raw: true
  });
  const sourceArticleIds = [...new Set(
    observations.map(observation => observation.sourceArticleId).filter(Boolean)
  )];

  if (!sourceArticleIds.length) return [];

  const sourceArticles = await Article.findAll({
    attributes: ['id'],
    where: {
      id: { [Op.in]: sourceArticleIds },
      userId,
      ...canonicalArticleWhere()
    },
    raw: true
  });
  const visibleSourceIds = new Set(sourceArticles.map(article => article.id));
  const linksByUrl = new Map();

  for (const observation of observations) {
    if (!observation.url || !visibleSourceIds.has(observation.sourceArticleId)) {
      continue;
    }

    const existing = linksByUrl.get(observation.url) || {
      url: observation.url,
      sourceArticleIds: new Set(),
      latestCreatedAt: 0
    };
    existing.sourceArticleIds.add(observation.sourceArticleId);
    existing.latestCreatedAt = Math.max(
      existing.latestCreatedAt,
      new Date(observation.createdAt).getTime() || 0
    );
    linksByUrl.set(observation.url, existing);
  }

  const pageLinks = [...linksByUrl.values()]
    .sort((left, right) =>
      right.sourceArticleIds.size - left.sourceArticleIds.size ||
      right.latestCreatedAt - left.latestCreatedAt ||
      left.url.localeCompare(right.url)
    )
    .slice((page - 1) * 50, page * 50);

  if (!pageLinks.length) return [];

  const pageUrls = pageLinks.map(link => link.url);
  const localArticles = await Article.findAll({
    attributes: ['id', 'feedId', 'title', 'url', 'normalizedUrl', 'favoriteInd'],
    where: {
      userId,
      ...canonicalArticleWhere(),
      [Op.or]: [
        { normalizedUrl: { [Op.in]: pageUrls } },
        { url: { [Op.in]: pageUrls } }
      ]
    },
    order: [['id', 'ASC']],
    raw: true
  });
  const localArticleByUrl = new Map();

  for (const article of localArticles) {
    if (article.normalizedUrl && !localArticleByUrl.has(article.normalizedUrl)) {
      localArticleByUrl.set(article.normalizedUrl, article);
    }
    if (article.url && !localArticleByUrl.has(article.url)) {
      localArticleByUrl.set(article.url, article);
    }
  }

  return pageLinks.map(link => {
    const localArticle = localArticleByUrl.get(link.url);
    const sourceIds = [...link.sourceArticleIds].sort((left, right) => left - right);

    return {
      id: feverLinkId(link.url),
      feed_id: localArticle ? Number(localArticle.feedId) : 0,
      item_id: localArticle ? Number(localArticle.id) : 0,
      temperature: sourceIds.length,
      is_item: localArticle ? 1 : 0,
      is_local: localArticle ? 1 : 0,
      is_saved: localArticle ? Number(localArticle.favoriteInd) : 0,
      title: localArticle?.title || link.url,
      url: link.url,
      item_ids: sourceIds.join(',')
    };
  });
}

export default {
  getFever,
  postFever
}
