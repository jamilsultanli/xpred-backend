import { Router } from 'express';
import * as notificationsController from '../controllers/notifications.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Routes
router.get('/', authenticateUser, notificationsController.getNotifications);
router.put('/:id/read', authenticateUser, notificationsController.markAsRead);
router.put('/read-all', authenticateUser, notificationsController.markAllAsRead);
router.delete('/:id', authenticateUser, notificationsController.deleteNotification);

export default router;


