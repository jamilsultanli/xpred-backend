import { Router } from 'express';
import * as repostsController from '../controllers/reposts.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

router.post('/predictions/:id/repost', authenticateUser, repostsController.repostPrediction);
router.delete('/predictions/:id/repost', authenticateUser, repostsController.unrepostPrediction);
router.get('/predictions/:id/reposts', repostsController.getReposts);
router.get('/users/:username/reposts', repostsController.getUserReposts);

export default router;

