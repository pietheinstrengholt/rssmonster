/**
 * Official Sources seed CLI runner
 *
 * Usage:
 *   npm run seed:official-sources
 *   npm run seed:official-sources -- --userId=1
 */

import { pathToFileURL } from 'url';
import db from '../models/index.js';

const { QueryTypes } = db.Sequelize;

export const OFFICIAL_SOURCE_RULES = [
  {
    entity: 'Microsoft',
    domains: [
      'microsoft.com',
      'blogs.windows.com',
      'learn.microsoft.com',
      'techcommunity.microsoft.com',
      'devblogs.microsoft.com',
      'azure.microsoft.com',
      'support.microsoft.com'
    ]
  },
  {
    entity: 'Google',
    domains: [
      'google.com',
      'blog.google',
      'developers.google.com',
      'android-developers.googleblog.com',
      'blog.chromium.org',
      'security.googleblog.com',
      'cloud.google.com'
    ]
  },
  {
    entity: 'Apple',
    domains: [
      'apple.com',
      'developer.apple.com',
      'support.apple.com',
      'newsroom.apple.com'
    ]
  },
  {
    entity: 'OpenAI',
    domains: [
      'openai.com'
    ]
  },
  {
    entity: 'Anthropic',
    domains: [
      'anthropic.com'
    ]
  },
  {
    entity: 'Meta',
    domains: [
      'meta.com',
      'about.fb.com',
      'engineering.fb.com',
      'ai.meta.com'
    ]
  },
  {
    entity: 'Amazon',
    domains: [
      'amazon.com',
      'aws.amazon.com',
      'aboutamazon.com'
    ]
  },
  {
    entity: 'NVIDIA',
    domains: [
      'nvidia.com',
      'developer.nvidia.com',
      'blogs.nvidia.com'
    ]
  },
  {
    entity: 'AMD',
    domains: [
      'amd.com',
      'community.amd.com'
    ]
  },
  {
    entity: 'Intel',
    domains: [
      'intel.com',
      'community.intel.com'
    ]
  },
  {
    entity: 'Oracle',
    domains: [
      'oracle.com'
    ]
  },
  {
    entity: 'IBM',
    domains: [
      'ibm.com',
      'research.ibm.com'
    ]
  },
  {
    entity: 'Cisco',
    domains: [
      'cisco.com'
    ]
  },
  {
    entity: 'Cloudflare',
    domains: [
      'cloudflare.com',
      'blog.cloudflare.com'
    ]
  },
  {
    entity: 'GitHub',
    domains: [
      'github.blog',
      'github.com'
    ]
  },
  {
    entity: 'GitLab',
    domains: [
      'gitlab.com',
      'about.gitlab.com'
    ]
  },
  {
    entity: 'Docker',
    domains: [
      'docker.com'
    ]
  },
  {
    entity: 'Canonical',
    domains: [
      'ubuntu.com',
      'canonical.com'
    ]
  },
  {
    entity: 'Red Hat',
    domains: [
      'redhat.com'
    ]
  },
  {
    entity: 'JetBrains',
    domains: [
      'jetbrains.com'
    ]
  },
  {
    entity: 'Mozilla',
    domains: [
      'mozilla.org',
      'blog.mozilla.org'
    ]
  },
  {
    entity: 'Linux Foundation',
    domains: [
      'linuxfoundation.org'
    ]
  },
  {
    entity: 'Kubernetes',
    domains: [
      'kubernetes.io'
    ]
  },
  {
    entity: 'Python',
    domains: [
      'python.org'
    ]
  },
  {
    entity: 'Node.js',
    domains: [
      'nodejs.org'
    ]
  },
  {
    entity: 'Vue.js',
    domains: [
      'vuejs.org'
    ]
  },
  {
    entity: 'React',
    domains: [
      'react.dev'
    ]
  },
  {
    entity: 'Angular',
    domains: [
      'angular.dev'
    ]
  },
  {
    entity: 'Vercel',
    domains: [
      'vercel.com'
    ]
  },
  {
    entity: 'Netlify',
    domains: [
      'netlify.com'
    ]
  },
  {
    entity: 'Databricks',
    domains: [
      'databricks.com'
    ]
  },
  {
    entity: 'Snowflake',
    domains: [
      'snowflake.com'
    ]
  },
  {
    entity: 'MongoDB',
    domains: [
      'mongodb.com'
    ]
  },
  {
    entity: 'Elastic',
    domains: [
      'elastic.co'
    ]
  },
  {
    entity: 'HashiCorp',
    domains: [
      'hashicorp.com'
    ]
  },
  {
    entity: 'Redis',
    domains: [
      'redis.io'
    ]
  },
  {
    entity: 'MySQL',
    domains: [
      'mysql.com'
    ]
  },
  {
    entity: 'PostgreSQL',
    domains: [
      'postgresql.org'
    ]
  },
  {
    entity: 'Figma',
    domains: [
      'figma.com'
    ]
  },
  {
    entity: 'Adobe',
    domains: [
      'adobe.com'
    ]
  },
  {
    entity: 'Unity',
    domains: [
      'unity.com'
    ]
  },
  {
    entity: 'Epic Games',
    domains: [
      'epicgames.com',
      'unrealengine.com'
    ]
  },
  {
    entity: 'Steam',
    domains: [
      'store.steampowered.com',
      'steamcommunity.com'
    ]
  },
  {
    entity: 'Valve',
    domains: [
      'valvesoftware.com'
    ]
  },
  {
    entity: 'Nintendo',
    domains: [
      'nintendo.com'
    ]
  },
  {
    entity: 'Sony',
    domains: [
      'sony.com',
      'playstation.com'
    ]
  },
  {
    entity: 'Xbox',
    domains: [
      'xbox.com'
    ]
  }
];

// This function normalizes official-source domains before persistence.
function normalizeDomain(domain) {
  const trimmedDomain = String(domain || '').trim().toLowerCase();
  if (!trimmedDomain) return null;

  const withoutWildcard = trimmedDomain.replace(/^\*\./, '');

  try {
    const url = new URL(
      withoutWildcard.includes('://') ? withoutWildcard : `https://${withoutWildcard}`
    );
    return url.hostname.replace(/^www\./, '');
  } catch {
    return withoutWildcard
      .split('/')[0]
      .split(':')[0]
      .replace(/^www\./, '') || null;
  }
}

// This function flattens entity rules into unique domain rows.
function buildOfficialSourceRows(rules = OFFICIAL_SOURCE_RULES) {
  const rowsByDomain = new Map();

  for (const rule of rules) {
    for (const domain of rule.domains) {
      const normalizedDomain = normalizeDomain(domain);
      if (!normalizedDomain) continue;
      if (!rowsByDomain.has(normalizedDomain)) {
        rowsByDomain.set(normalizedDomain, {
          entity: rule.entity,
          domain: normalizedDomain
        });
      }
    }
  }

  return [...rowsByDomain.values()];
}

// This function reads the optional target user id from CLI arguments.
function parseUserIdArg(argv = process.argv.slice(2)) {
  const arg = argv.find((value) => value === '--userId' || value.startsWith('--userId='));
  if (!arg) return null;

  if (arg === '--userId') {
    const index = argv.indexOf(arg);
    return Number.parseInt(argv[index + 1], 10);
  }

  return Number.parseInt(arg.split('=')[1], 10);
}

// This function returns the user ids that should receive official-source rows.
async function loadTargetUserIds(userId) {
  const where = Number.isInteger(userId)
    ? 'WHERE id = :userId'
    : '';

  const users = await db.sequelize.query(
    `SELECT id FROM users ${where} ORDER BY id`,
    {
      replacements: { userId },
      type: QueryTypes.SELECT
    }
  );

  return users.map((user) => user.id);
}

// This function inserts or refreshes one official-source row.
async function seedOfficialSourceRow({ userId, entity, domain, transaction }) {
  const existingRows = await db.sequelize.query(
    `SELECT id, entity, enabled
     FROM official_sources
     WHERE userId = :userId AND domain = :domain
     LIMIT 1`,
    {
      replacements: { userId, domain },
      transaction,
      type: QueryTypes.SELECT
    }
  );

  const existing = existingRows[0];
  if (!existing) {
    await db.sequelize.query(
      `INSERT INTO official_sources (userId, entity, domain, enabled, createdAt, updatedAt)
       VALUES (:userId, :entity, :domain, true, NOW(), NOW())`,
      {
        replacements: { userId, entity, domain },
        transaction
      }
    );
    return 'inserted';
  }

  if (existing.entity !== entity || !existing.enabled) {
    await db.sequelize.query(
      `UPDATE official_sources
       SET entity = :entity, enabled = true, updatedAt = NOW()
       WHERE id = :id`,
      {
        replacements: { id: existing.id, entity },
        transaction
      }
    );
    return 'updated';
  }

  return 'unchanged';
}

// This function seeds all official-source rows for the selected users.
export async function seedOfficialSources({ userId = null } = {}) {
  const sourceRows = buildOfficialSourceRows();
  const userIds = await loadTargetUserIds(userId);
  const results = {
    users: userIds.length,
    rules: OFFICIAL_SOURCE_RULES.length,
    domains: sourceRows.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0
  };

  if (Number.isInteger(userId) && userIds.length === 0) {
    results.skipped = sourceRows.length;
    return results;
  }

  await db.sequelize.transaction(async (transaction) => {
    for (const targetUserId of userIds) {
      for (const sourceRow of sourceRows) {
        const result = await seedOfficialSourceRow({
          userId: targetUserId,
          ...sourceRow,
          transaction
        });

        results[result] += 1;
      }
    }
  });

  return results;
}

// This function prints a concise seed summary for operators.
function printResults(results, userId) {
  const target = Number.isInteger(userId) ? `user ${userId}` : 'all users';

  console.log(`Official sources seeded for ${target}`);
  console.log(`Users: ${results.users}`);
  console.log(`Rules: ${results.rules}`);
  console.log(`Domains per user: ${results.domains}`);
  console.log(`Inserted: ${results.inserted}`);
  console.log(`Updated: ${results.updated}`);
  console.log(`Unchanged: ${results.unchanged}`);
  console.log(`Skipped: ${results.skipped}`);
}

// This function runs the seed command and closes the database connection.
async function main() {
  const userId = parseUserIdArg();
  if (userId !== null && !Number.isInteger(userId)) {
    throw new Error('Invalid --userId value. Use an integer user id.');
  }

  const results = await seedOfficialSources({ userId });
  printResults(results, userId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      console.error('Error in seedOfficialSources:', err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.sequelize.close();
    });
}
