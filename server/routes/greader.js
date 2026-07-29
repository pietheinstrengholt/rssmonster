import express from 'express';
import multer from 'multer';
import greaderController from '../controllers/greader.js';
import {
  authenticateGreader,
  validateGreaderActionToken
} from '../middleware/greaderAuth.js';
import { OPML_IMPORT_MAX_BYTES } from '../services/feeds/opmlImport.js';

export const router = express.Router();
const opmlUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OPML_IMPORT_MAX_BYTES, files: 1 }
});
const rawOpmlUpload = express.raw({
  type: ['application/xml', 'text/xml'],
  limit: OPML_IMPORT_MAX_BYTES
});

// This middleware converts bounded in-memory upload failures to Reader text errors.
const uploadGreaderOpml = (req, res, next) => {
  if (req.is('application/xml') || req.is('text/xml')) {
    return rawOpmlUpload(req, res, error => {
      if (error) {
        return res.status(400).type('text/plain').send('Invalid OPML upload');
      }
      return next();
    });
  }

  opmlUpload.single('subscriptions_file')(req, res, error => {
    if (error) {
      return res.status(400).type('text/plain').send('Invalid OPML upload');
    }
    return next();
  });
};

/**
 * Google Reader API Routes
 * 
 * Base URL: /api/greader
 * 
 * Authentication:
 * - POST /accounts/ClientLogin - Login and get auth token
 * - State-changing endpoints require the action token in T
 * 
 * API endpoints (require Authorization: GoogleLogin auth=username/token header):
 * - GET /reader/api/0/token - Get action token
 * - GET /reader/api/0/user-info - Get user info
 * - GET /reader/api/0/tag/list - List tags/categories
 * - GET /reader/api/0/subscription/list - List subscriptions
 * - POST /reader/api/0/subscription/edit - Edit subscription
 * - POST /reader/api/0/subscription/quickadd - Quick add subscription
 * - POST /reader/api/0/subscription/import - Import subscriptions from OPML
 * - GET /reader/api/0/subscription/export - Export OPML
 * - GET /reader/api/0/unread-count - Get unread counts
 * - GET /reader/api/0/stream/contents/* - Get articles
 * - GET /reader/api/0/stream/items/ids - Get article IDs
 * - POST /reader/api/0/stream/items/contents - Get articles by ID
 * - POST /reader/api/0/edit-tag - Mark read/unread/starred
 * - POST /reader/api/0/mark-all-as-read - Mark all as read
 * - POST /reader/api/0/rename-tag - Rename category
 * - POST /reader/api/0/disable-tag - Delete category
 */

// Reader credentials and mutable state must never be cached by intermediaries.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, private');
  res.set('Pragma', 'no-cache');
  next();
});

// Enable CORS preflight for all routes
router.options('/{*splat}', (req, res) => {
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Max-Age', '600');
  res.sendStatus(204);
});

// Compatibility check
router.get('/check/compatibility', greaderController.checkCompatibility);

// Authentication
router.get('/accounts/ClientLogin', greaderController.clientLogin);
router.post('/accounts/ClientLogin', greaderController.clientLogin);

// Authenticate all Google Reader API endpoints once per request.
router.use('/reader/api/0', authenticateGreader);

// Token
router.get('/reader/api/0/token', greaderController.getToken);

// User info
router.get('/reader/api/0/user-info', greaderController.getUserInfo);

// Tags
router.get('/reader/api/0/tag/list', greaderController.getTagList);

// Subscriptions
router.get('/reader/api/0/subscription/list', greaderController.getSubscriptionList);
router.post('/reader/api/0/subscription/edit', validateGreaderActionToken, greaderController.editSubscription);
router.get('/reader/api/0/subscription/edit', validateGreaderActionToken, greaderController.editSubscription); // Some clients use GET
router.post('/reader/api/0/subscription/quickadd', validateGreaderActionToken, greaderController.quickAddSubscription);
router.post(
  '/reader/api/0/subscription/import',
  uploadGreaderOpml,
  validateGreaderActionToken,
  greaderController.importSubscriptions
);
router.get('/reader/api/0/subscription/export', greaderController.exportSubscriptions);

// Unread count
router.get('/reader/api/0/unread-count', greaderController.getUnreadCount);

// Stream contents - using named parameter to handle all stream paths
router.get('/reader/api/0/stream/contents', greaderController.getStreamContents);
router.get('/reader/api/0/stream/contents/{*streamPath}', greaderController.getStreamContents);

// Stream item IDs
router.get('/reader/api/0/stream/items/ids', greaderController.getStreamItemIds);

// Stream item contents
router.post('/reader/api/0/stream/items/contents', greaderController.getStreamItemContents);
router.get('/reader/api/0/stream/items/contents', greaderController.getStreamItemContents);

// Edit tags (mark read/unread/starred)
router.post('/reader/api/0/edit-tag', validateGreaderActionToken, greaderController.editTag);

// Mark all as read
router.post('/reader/api/0/mark-all-as-read', validateGreaderActionToken, greaderController.markAllAsRead);

// Rename/disable tags (categories)
router.post('/reader/api/0/rename-tag', validateGreaderActionToken, greaderController.renameTag);
router.post('/reader/api/0/disable-tag', validateGreaderActionToken, greaderController.disableTag);

export default router;
