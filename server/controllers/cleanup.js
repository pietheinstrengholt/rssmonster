import { cleanupArticles } from '../services/articleCleanup.js';

// Delete eligible articles using the authenticated user's saved retention settings.
const cleanup = async (req, res, _next) => {
  try {
    const userId = req.userData?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: missing userId' });
    }

    const deletedCount = await cleanupArticles(userId);

    return res.status(200).json({ 
      message: 'Articles cleaned up successfully',
      deletedCount 
    });
  } catch (err) {
    console.error('Error in cleanup:', err);
    return res.status(500).json({ error: 'Could not clean up articles' });
  }
};

export default {
  cleanup
};
