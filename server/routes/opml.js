import express from "express";
import userMiddleware from "../middleware/users.js";
import opmlController from "../controllers/opml.js";
import multer from "multer";
import { OPML_IMPORT_MAX_BYTES } from "../services/feeds/opmlImport.js";

// Configure multer for file upload (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OPML_IMPORT_MAX_BYTES, files: 1 }
});

// This middleware returns a stable error for rejected in-memory OPML uploads.
const uploadOpml = (req, res, next) => {
  upload.single('opmlFile')(req, res, error => {
    if (error) {
      return res.status(400).json({ error: 'Invalid OPML upload' });
    }
    return next();
  });
};

const router = express.Router();

// Export OPML
router.get("/export", userMiddleware.isLoggedIn, opmlController.exportOpml);

// Preview an OPML upload without creating subscriptions
router.post("/preview", userMiddleware.isLoggedIn, uploadOpml, opmlController.previewOpml);
router.get(
  "/preview/:previewId/status",
  userMiddleware.isLoggedIn,
  opmlController.getOpmlPreviewStatus
);

// Import a previously previewed JSON contract
router.post("/import", userMiddleware.isLoggedIn, opmlController.importOpml);

export default router;
