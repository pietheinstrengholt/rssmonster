import { describe, expect, it } from 'vitest';
import { access } from 'node:fs/promises';

import db from '../../models/index.js';
import { resolveSemanticVectorFixturePath } from '../../utils/semanticVectorFixtures.js';
import { writeSemanticRegressionMarkdownReport } from '../helpers/semanticRegressionMarkdownReport.js';

const { User } = db;
const FIXTURE_USERNAME = 'semantic-regression-user';
const DUPLICATE_FIXTURE_USERNAME = 'semantic-regression-ad-event-user';
const VECTOR_FIXTURE_PATH = await resolveSemanticVectorFixturePath('semantic-regression');

// The database-backed semantic scenarios are skipped when their generated vector fixture is absent.
async function hasVectorFixture() {
  try {
    await access(VECTOR_FIXTURE_PATH);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

const semanticRegressionDescribe = (await hasVectorFixture()) ? describe : describe.skip;

semanticRegressionDescribe('semantic regression Markdown report', () => {
  it('writes the final model report after all semantic scenarios finish', async () => {
    const [user, duplicateEvaluationUser] = await Promise.all([
      User.findOne({ where: { username: FIXTURE_USERNAME }, attributes: ['id'], raw: true }),
      User.findOne({ where: { username: DUPLICATE_FIXTURE_USERNAME }, attributes: ['id'], raw: true })
    ]);

    expect(user, 'semantic regression user should exist before report generation').toBeTruthy();

    const reportPath = await writeSemanticRegressionMarkdownReport({
      userId: user.id,
      duplicateEvaluationUserIds: duplicateEvaluationUser ? [duplicateEvaluationUser.id] : []
    });

    await expect(access(reportPath)).resolves.toBeUndefined();
  });
});
