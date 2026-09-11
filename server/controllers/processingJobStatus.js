import { getAvailableInferenceCapabilities, getInferenceStatus } from '../services/inference/status.js';
import db from '../models/index.js';
import {
  isInferenceEnabled,
  isAssistantEnabled,
  shouldSkipArticleClassification,
  shouldSkipArticleEmbeddings,
  shouldSkipSemanticLabeling
} from '../config/intelligentFeatures.js';
import { requeueFailedProcessingJobs } from '../services/jobs/processingJobOperator.js';
import { getProcessingJobStatus } from '../services/jobs/getProcessingJobStatus.js';

const { ProcessingJob, Sequelize } = db;
const { Op } = Sequelize;

// Returns the authenticated user's read-only optional-processing status.
export const getProcessingJobsStatus = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const status = await getInferenceStatus().catch(() => null);
    const available = await getAvailableInferenceCapabilities(status);
    return res.status(200).json({
      ...await getProcessingJobStatus({ userId }),
      capabilityModels: Object.fromEntries(Object.entries(status?.capabilities || {})
        .filter(([name]) => available[name])
        .map(([name, capability]) => [name, { provider: capability.provider, model: capability.model }])),
      features: {
        inference: isInferenceEnabled() && Object.values(available).some(Boolean),
        assistant: isAssistantEnabled() && available.assistant,
        classification: !shouldSkipArticleClassification() && available.classification,
        embeddings: !shouldSkipArticleEmbeddings() && available.embeddings,
        semanticLabeling: !shouldSkipSemanticLabeling() && available.generation
      }
    });
  } catch (error) {
    console.error('Error in getProcessingJobsStatus:', error);
    return res.status(500).json({ error: 'Unable to load processing-job status' });
  }
};

// Permanently removes only terminal success and failure history owned by the current user.
export const clearCompletedProcessingJobs = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const deletedCount = await ProcessingJob.destroy({
      where: {
        userId,
        status: { [Op.in]: ['succeeded', 'dead'] }
      }
    });
    return res.status(200).json({ deletedCount: Number(deletedCount) || 0 });
  } catch (error) {
    console.error('Error in clearCompletedProcessingJobs:', error);
    return res.status(500).json({ error: 'Unable to clear completed processing jobs' });
  }
};

export const retryFailedProcessingJobs = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId' });
    return res.status(200).json(await requeueFailedProcessingJobs({ userId }));
  } catch (error) {
    console.error('Error in retryFailedProcessingJobs:', error);
    return res.status(500).json({ error: 'Unable to retry failed processing jobs' });
  }
};

export default { clearCompletedProcessingJobs, getProcessingJobsStatus, retryFailedProcessingJobs };
