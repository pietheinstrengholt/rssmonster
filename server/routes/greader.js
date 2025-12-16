import express from 'express';
import greaderController from '../controllers/greader.js';

export const router = express.Router();

/**
 * Google Reader API Routes
 * 
 * Base URL: /api/greader
 * 
 * Authentication:
 * - POST /accounts/ClientLogin - Login and get auth token
 * 
 * API endpoints (require Authorization: GoogleLogin auth=username/token header):
 * - GET /reader/api/0/token - Get action token
 * - GET /reader/api/0/user-info - Get user info
 * - GET /reader/api/0/tag/list - List tags/categories
 * - GET /reader/api/0/subscription/list - List subscriptions
 * - POST /reader/api/0/subscription/edit - Edit subscription
 * - POST /reader/api/0/subscription/quickadd - Quick add subscription
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

// Token
router.get('/reader/api/0/token', greaderController.getToken);

// User info
router.get('/reader/api/0/user-info', greaderController.getUserInfo);

// Tags
router.get('/reader/api/0/tag/list', greaderController.getTagList);

// Subscriptions
router.get('/reader/api/0/subscription/list', greaderController.getSubscriptionList);
router.post('/reader/api/0/subscription/edit', greaderController.editSubscription);
router.get('/reader/api/0/subscription/edit', greaderController.editSubscription); // Some clients use GET
router.post('/reader/api/0/subscription/quickadd', greaderController.quickAddSubscription);
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
router.post('/reader/api/0/edit-tag', greaderController.editTag);

// Mark all as read
router.post('/reader/api/0/mark-all-as-read', greaderController.markAllAsRead);

// Rename/disable tags (categories)
router.post('/reader/api/0/rename-tag', greaderController.renameTag);
router.post('/reader/api/0/disable-tag', greaderController.disableTag);

export default router;
