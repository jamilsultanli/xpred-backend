import { Router } from 'express';
import * as communitiesController from '../controllers/communities.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

router.get('/best', communitiesController.getBestCommunities);
router.get('/', communitiesController.getCommunities);
router.get('/:id', communitiesController.getCommunity);
router.post('/', authenticateUser, communitiesController.createCommunity);
router.put('/:id', authenticateUser, communitiesController.updateCommunity);
router.delete('/:id', authenticateUser, communitiesController.deleteCommunity);
router.post('/:id/join', authenticateUser, communitiesController.joinCommunity);
router.delete('/:id/join', authenticateUser, communitiesController.leaveCommunity);
router.get('/:id/members', communitiesController.getCommunityMembers);
router.get('/:id/predictions', communitiesController.getCommunityPredictions);
router.get('/users/:username/communities', communitiesController.getUserCommunities);

export default router;

