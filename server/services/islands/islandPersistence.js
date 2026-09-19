import { isActiveIsland } from './islandDeadline.js';
import { buildIslandLifecycleDecision, appendCapacityDecision } from './islandLifecycleAudit.js';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { aggregateEmbeddingModel, embeddingSimilarity, hasEmbeddingModel } from '../vectors/embeddingModel.js';
import { formatLogString } from '../../utils/logging.js';
import { buildPopulationAuditEntry, appendPopulationAudit } from './islandAudit.js';
import { loadIslandBehavioralArticles } from './islandArticleProfiles.js';
import { islandArchiveState, reconstructIslandLifecycles, summarizeIslandLifecycle } from './islandLifecycle.js';
import { rankIslandCapacityCandidates } from './islandCapacity.js';
import { selectIslandSupportArticleIds } from './islandSupport.js';
import {
  buildUniqueIslandName,
  disambiguateDuplicateIslandNamesForUser,
  normalizeIslandName
} from './islandNameDisambiguation.js';
import {
  DEFAULT_ISLAND_MATCH_THRESHOLD,
  DEFAULT_ISLAND_VECTOR_ALPHA,
  ISLAND_DEBUG,
  blendIslandVector,
  debugIsland,
  normalizePositiveSignals,
  resolveTaxonomyDisplayName,
  resolveIslandCapacity,
  sortIslandsByWeight
} from './islandVectorUtils.js';

// Provides the shared dependencies used by this service.
const { Island, IslandTaxonomy } = db;

// Preserve provenance of both sides when blending; replacement uses only the incoming model.
function blendedEmbeddingModel(island, profile) {
  if (!Array.isArray(island.islandVector) || island.islandVector.length !== profile.vector.length || DEFAULT_ISLAND_VECTOR_ALPHA >= 1) {
    return profile.embedding_model ?? null;
  }
  if (DEFAULT_ISLAND_VECTOR_ALPHA <= 0) return island.embedding_model ?? null;
  return aggregateEmbeddingModel([
    { vector: island.islandVector, embedding_model: island.embedding_model },
    profile
  ]);
}

// This function formats island metric values for concise logs.
function formatIslandMetric(value, digits = 3) {
  // Coerces the numeric into the representation required while performing format island metric.
  const numeric = Number(value);
  // Selects the result based on whether numeric is finite.
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function writes verbose island evidence logs only when island debugging is enabled.
function debugIslandLog(message) {
  // Returns early when island debug is unavailable.
  if (!ISLAND_DEBUG) return;
  console.log(`[ISLAND] ${message}`);
}

// This function returns a human-readable article engagement label for island logs.
function strongestArticleEngagement(article = {}) {
  // Derives the signals required while performing strongest article engagement.
  const signals = article.positiveSignals || {};
  // Returns early when number exceeds value.
  if (Number(signals.deepReads || 0) > 0) return 'deep-read';
  // Returns early when number exceeds value.
  if (Number(signals.stars || 0) > 0) return 'star';
  // Returns early when number exceeds value.
  if (Number(signals.positives || 0) > 0) return 'positive';
  // Returns early when number exceeds value.
  if (Number(signals.clicks || 0) > 0) return 'click';
  // Returns early when number exceeds value.
  if (Number(signals.negatives || 0) > 0) return 'negative';
  return 'behavior';
}

// This function creates, updates, archives, and links islands from computed profiles.
export async function persistInterestIslandProfiles(userId, profiles, transaction, options = {}) {
  const maxIslands = resolveIslandCapacity(options.maxIslands);
  const persistableProfiles = profiles
    .filter(profile => hasEmbeddingModel(profile.embedding_model) && Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => (profile.articles || []).length > 0);

  // Derives the existing islands through sort islands by weight while performing persist interest island profiles.
  const existingIslands = sortIslandsByWeight(await Island.findAll({
    where: { userId },
    transaction
  }));
  const behavioralEvidence = profiles.behavioralEvidence ?? await loadIslandBehavioralArticles(userId, { transaction });
  // Capture incumbency before matching can reactivate or create competitors.
  const incumbentIds = new Set(existingIslands.filter(island => isActiveIsland(island)).map(island => island.id));
  const evidenceById = new Map(behavioralEvidence.map(article => [String(article.id), article]));
  // Track every owned name, including history, while excluding only the row being renamed.
  const islandNamesById = new Map(existingIslands.map(island => [island.id, normalizeIslandName(island.label)]));
  const resolveUniqueLabel = (label, islandId = null) => buildUniqueIslandName(label, new Set(
    [...islandNamesById].filter(([id]) => id !== islandId).map(([, name]) => name)
  ));

  // Loads the taxonomy rows needed while performing persist interest island profiles.
  const taxonomyRows = await IslandTaxonomy.findAll({
    where: {
      status: 'active',
      vector: { [Op.ne]: null }
    },
    attributes: ['displayName', 'vector', 'embedding_model'],
    transaction
  });

  // Tracks distinct matched island id while performing persist interest island profiles.
  const matchedIslandIds = new Set();
  const profilesByIslandId = new Map();

  // Collects the created islands while performing persist interest island profiles.
  const createdIslands = [];
  const createdIslandIds = [];
  let createdIslandCount = 0;
  let updatedIslandCount = 0;
  let archivedIslandCount = 0;
  let updatedWithPositiveSignalCount = 0;
  let updatedWithStarSignalCount = 0;
  let updatedWithClickSignalCount = 0;
  let updatedWithNegativeSignalCount = 0;

  // Processes each persistable profiles entry in turn.
  for (const profile of persistableProfiles) {
    // Resolves the taxonomy display name while performing persist interest island profiles.
    const taxonomyLabel = resolveTaxonomyDisplayName(profile.vector, taxonomyRows, profile.embedding_model);
    // Derives the resolved label required while performing persist interest island profiles.
    const resolvedLabel = taxonomyLabel || profile.label || 'Interest Island';

    let bestMatch = null;
    let bestSimilarity = 0;

    // Processes each existing islands entry in turn.
    for (const island of existingIslands) {
      // Skips the current entry when matched island id contains island id.
      if (matchedIslandIds.has(island.id)) continue;

      // Derives the similarity through cosine similarity while performing persist interest island profiles.
      const similarity = embeddingSimilarity(profile.vector, island.islandVector, profile.embedding_model, island.embedding_model);
      // Handles the case where similarity exceeds best similarity.
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = island;
      }
    }

    // Keeps the article id entries eligible while performing persist interest island profiles.
    const articleIds = (profile.articles || [])
      .map(article => Number(article.articleId))
      .filter(Number.isFinite);
    const preserveVector = options.preserveMatchedVectors && bestMatch && bestSimilarity >= DEFAULT_ISLAND_MATCH_THRESHOLD;
    const lifecycle = summarizeIslandLifecycle(articleIds.map(id => evidenceById.get(String(id))).filter(Boolean),
      preserveVector ? bestMatch.islandVector : profile.vector, profile.embedding_model, profile.weight);
    // Builds the population audit entry while performing persist interest island profiles.
    const auditEntry = await buildPopulationAuditEntry({
      userId,
      articleIds,
      transaction
    });

    // Handles the case where best match is available and best similarity reaches default island match threshold.
    if (bestMatch && bestSimilarity >= DEFAULT_ISLAND_MATCH_THRESHOLD) {
      const archiveState = islandArchiveState(bestMatch, lifecycle);
      auditEntry.lifecycle = [buildIslandLifecycleDecision(bestMatch, { ...lifecycle, weight: profile.weight }, archiveState)];
      if (archiveState.archivedInd && !bestMatch.archivedInd) archivedIslandCount++;
      const islandVector = preserveVector ? bestMatch.islandVector : blendIslandVector(bestMatch.islandVector, profile.vector);
      const embeddingModel = preserveVector ? bestMatch.embedding_model : blendedEmbeddingModel(bestMatch, profile);
      // Derives the updated island through update while performing persist interest island profiles.
      const updatedIsland = await bestMatch.update({
        label: resolveUniqueLabel(resolvedLabel, bestMatch.id),
        weight: profile.weight,
        // Elapsed time is not new vector evidence; scheduled repeats must not drift centroids.
        islandVector,
        embedding_model: embeddingModel,
        supportArticleIds: selectIslandSupportArticleIds(articleIds.map(id => evidenceById.get(String(id))).filter(Boolean),
          { userId, islandVector, embedding_model: embeddingModel }),
        // Profiles are complete snapshots, not interaction deltas. Replays must not add evidence.
        positiveSignals: normalizePositiveSignals(profile.positiveSignals),
        populationAudit: appendPopulationAudit(bestMatch.populationAudit, auditEntry),
        ...archiveState
      }, { transaction });
      islandNamesById.set(updatedIsland.id, normalizeIslandName(updatedIsland.label));

      matchedIslandIds.add(updatedIsland.id);
      profilesByIslandId.set(updatedIsland.id, profile);
      updatedIslandCount += 1;

      // Derives the strongest article required while performing persist interest island profiles.
      const strongestArticle = (profile.articles || [])
        .slice()
        .sort((a, b) => Math.abs(Number(b.score || 0)) - Math.abs(Number(a.score || 0)))[0] || null;

      if (strongestArticle) {
        debugIslandLog(
          `island=${updatedIsland.id} ← article=${strongestArticle.articleId} ` +
          `sim=${formatIslandMetric(bestSimilarity)} ` +
          `engagement=${strongestArticleEngagement(strongestArticle)} existing`
        );
      }

      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.stars || 0) > 0) {
        updatedWithStarSignalCount += 1;
      }
      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.positives || 0) > 0) {
        updatedWithPositiveSignalCount += 1;
      }
      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.clicks || 0) > 0) {
        updatedWithClickSignalCount += 1;
      }
      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.negatives || 0) > 0) {
        updatedWithNegativeSignalCount += 1;
      }

      createdIslands.push(updatedIsland);
      continue;
    }

    // Builds the unique island name while performing persist interest island profiles.
    const uniqueLabel = resolveUniqueLabel(resolvedLabel);
    const archiveState = islandArchiveState(null, lifecycle);
    auditEntry.lifecycle = [buildIslandLifecycleDecision(null, { ...lifecycle, weight: profile.weight }, archiveState)];
    // Performs the create operation while performing persist interest island profiles.
    const island = await Island.create({
      label: uniqueLabel,
      weight: profile.weight,
      userId,
      islandVector: profile.vector,
      embedding_model: profile.embedding_model ?? null,
      supportArticleIds: selectIslandSupportArticleIds(articleIds.map(id => evidenceById.get(String(id))).filter(Boolean),
        { userId, islandVector: profile.vector, embedding_model: profile.embedding_model }),
      positiveSignals: normalizePositiveSignals(profile.positiveSignals),
      populationAudit: appendPopulationAudit([], auditEntry),
      ...archiveState
    }, { transaction });
    islandNamesById.set(island.id, normalizeIslandName(uniqueLabel));
    createdIslandCount += 1;
    if (archiveState.archivedInd) archivedIslandCount++;
    createdIslandIds.push(Number(island.id));

    console.log(
      `[ISLAND] new-island=${island.id} ` +
      `name=${formatLogString(uniqueLabel)} ` +
      `seedArticles=${(profile.articles || []).length}`
    );

    createdIslands.push(island);
    profilesByIslandId.set(island.id, profile);
  }

  // Keeps the inactive islands entries eligible while performing persist interest island profiles.
  const inactiveIslands = existingIslands.filter(island => !matchedIslandIds.has(island.id) && !island.archivedInd);
  const activeCandidates = [...new Map([...existingIslands, ...createdIslands]
    .filter(island => !island.archivedInd).map(island => [island.id, island])).values()];
  const existingLifecycles = inactiveIslands.length ? reconstructIslandLifecycles(activeCandidates, behavioralEvidence) : new Map();
  for (const island of inactiveIslands) {
    // Only a matched profile can reactivate; replay must preserve the original archive boundary.
    const lifecycle = existingLifecycles.get(island.id);
    const archiveState = islandArchiveState(island, lifecycle);
    const auditEntry = await buildPopulationAuditEntry({ userId, articleIds: lifecycle.sourceArticleIds || [], transaction });
    auditEntry.lifecycle = [buildIslandLifecycleDecision(island, lifecycle, archiveState)];
    await island.update({ weight: lifecycle.weight, ...archiveState,
      supportArticleIds: selectIslandSupportArticleIds((lifecycle.sourceArticleIds || []).map(id => evidenceById.get(String(id))).filter(Boolean), island),
      populationAudit: appendPopulationAudit(island.populationAudit, auditEntry) }, { transaction });
    if (archiveState.archivedInd) archivedIslandCount++;
  }

  // Derives the name disambiguation summary through disambiguate duplicate island names for user while performing persist interest island profiles.
  const nameDisambiguationSummary = await disambiguateDuplicateIslandNamesForUser(userId, { transaction });
  const duplicateArchives = new Set(nameDisambiguationSummary.archived);
  const finalCandidates = [...new Map([...existingIslands, ...createdIslands].map(island => [island.id, island])).values()]
    .filter(island => isActiveIsland(island) && !duplicateArchives.has(Number(island.id)));
  const capacityArchivedIslandIds = [];
  if (finalCandidates.length > maxIslands) {
    const ranked = rankIslandCapacityCandidates(finalCandidates, behavioralEvidence, profilesByIslandId, incumbentIds);
    const overflowIds = new Set(ranked.slice(maxIslands).map(island => island.id));
    for (const island of finalCandidates.filter(island => overflowIds.has(island.id))) {
      const now = new Date();
      const archiveState = { archivedInd: true, archivedAt: now };
      await island.update({ ...archiveState,
        populationAudit: appendCapacityDecision(island.populationAudit, island, archiveState, ranked, maxIslands, now)
      }, { transaction });
      capacityArchivedIslandIds.push(Number(island.id));
      archivedIslandCount++;
    }
  }

  // Filters source values to the entries eligible while performing persist interest island profiles.
  createdIslands.summary = {
    existingIslandCount: existingIslands.length,
    createdIslandCount,
    createdIslandIds,
    updatedIslandCount,
    archivedIslandCount,
    activeIslandCount: finalCandidates.length - capacityArchivedIslandIds.length,
    capacityArchivedIslandIds,
    renamedDuplicateIslandCount: nameDisambiguationSummary.renamed.length,
    archivedDuplicateIslandCount: nameDisambiguationSummary.archived.length
  };

  // Handles the case where island debug is available.
  if (ISLAND_DEBUG) {
    debugIsland('island-persistence-summary', {
      userId,
      createdIslandCount,
      updatedIslandCount,
      updatedBySignals: {
        positives: updatedWithPositiveSignalCount,
        stars: updatedWithStarSignalCount,
        clicks: updatedWithClickSignalCount,
        negativeInd: updatedWithNegativeSignalCount
      }
    });
  }

  return createdIslands;
}
