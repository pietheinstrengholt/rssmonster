import express from "express";
import userMiddleware from "../middleware/users.js";
import opmlController from "../controllers/opml.js";

const router = express.Router();

// Export OPML
router.get("/export", userMiddleware.isLoggedIn, opmlController.exportOpml);

export default router;
