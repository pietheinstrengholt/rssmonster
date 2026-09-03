import express from 'express';
import userController from '../controllers/user.js';
import emailAdministrationController from '../controllers/emailAdministration.js';
import userMiddleware from "../middleware/users.js";

export const router = express.Router();

// GET /api/users
router.get('/', userMiddleware.isLoggedIn, userController.getUsers);
router.get(
  '/email-configuration',
  userMiddleware.isLoggedIn,
  emailAdministrationController.getConfigurationStatus
);
router.post(
  '/email-configuration/test',
  userMiddleware.isLoggedIn,
  emailAdministrationController.testSmtpConnectivity
);
router.get('/:userId', userMiddleware.isLoggedIn, userController.getUser);
router.post('/:userId', userMiddleware.isLoggedIn, userController.postUsers);
router.delete('/:userId', userMiddleware.isLoggedIn, userController.deleteUser);

export default router;
