import express from "express";
import tagController from "../controllers/tag.js";
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

router.get("/", userMiddleware.isLoggedIn, tagController.getTags);

export default router;