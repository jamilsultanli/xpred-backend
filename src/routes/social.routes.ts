import { Router } from 'express';
import * as socialController from '../controllers/social.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Routes
router.post('/users/:userId/follow', authenticateUser, socialController.followUser);
router.delete('/users/:userId/follow', authenticateUser, socialController.unfollowUser);
router.get('/users/:userId/follow-status', authenticateUser, socialController.getFollowStatus);

export default router;


