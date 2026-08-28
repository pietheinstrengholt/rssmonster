import { getProcessingJobStatus } from '../services/jobs/getProcessingJobStatus.js';

// Returns the authenticated user's read-only optional-processing status.
export const getProcessingJobsStatus = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    return res.status(200).json(await getProcessingJobStatus({ userId }));
  } catch (error) {
    console.error('Error in getProcessingJobsStatus:', error);
    return res.status(500).json({ error: 'Unable to load processing-job status' });
  }
};

export default { getProcessingJobsStatus };
