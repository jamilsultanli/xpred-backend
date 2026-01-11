import { Router } from 'express';
import * as blocksController from '../controllers/blocks.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

router.post('/block', authenticateUser, blocksController.blockUser);
router.post('/unblock', authenticateUser, blocksController.unblockUser);
router.get('/blocked', authenticateUser, blocksController.getBlockedUsers);
router.post('/mute', authenticateUser, blocksController.muteUser);
router.post('/unmute', authenticateUser, blocksController.unmuteUser);
router.get('/muted', authenticateUser, blocksController.getMutedUsers);

export default router;

