import express from "express";
import userMiddleware from "../middleware/users.js";
import opmlController from "../controllers/opml.js";
import multer from "multer";

// Configure multer for file upload (store in memory)
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// Export OPML
router.get("/export", userMiddleware.isLoggedIn, opmlController.exportOpml);

// Import OPML
router.post("/import", userMiddleware.isLoggedIn, upload.single('opmlFile'), opmlController.importOpml);

export default router;
