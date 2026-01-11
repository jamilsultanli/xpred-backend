import { Router } from 'express';
import * as leaderboardController from '../controllers/leaderboard.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Routes (public, but can show user rank if authenticated)
router.get('/', leaderboardController.getLeaderboard);

export default router;

