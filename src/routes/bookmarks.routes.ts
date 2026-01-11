import { Router } from 'express';
import * as bookmarksController from '../controllers/bookmarks.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

router.post('/', authenticateUser, bookmarksController.bookmarkPrediction);
router.delete('/:predictionId', authenticateUser, bookmarksController.unbookmarkPrediction);
router.get('/', authenticateUser, bookmarksController.getBookmarks);
router.get('/:predictionId/status', authenticateUser, bookmarksController.getBookmarkStatus);

export default router;

