import { Router } from 'express';
import * as settingsController from '../controllers/settings.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// Notification settings
router.get('/notifications', settingsController.getNotificationSettings);
router.put('/notifications', settingsController.updateNotificationSettings);

// Change password
router.post('/change-password', settingsController.changePassword);

// Change email
router.post('/change-email', settingsController.changeEmail);

// Delete account
router.post('/delete-account', settingsController.deleteAccount);

export default router;

