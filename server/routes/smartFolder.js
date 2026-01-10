import express from "express";
import smartFolderController from "../controllers/smartFolder.js";
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/smartfolders
router.get("/", userMiddleware.isLoggedIn, smartFolderController.getSmartFolders);

// POST /api/smartfolders
router.post('/', userMiddleware.isLoggedIn, smartFolderController.postSmartFolder);

// GET /api/smartfolders/insights
router.get("/insights", userMiddleware.isLoggedIn, smartFolderController.getSmartFolderInsights);

export default router;