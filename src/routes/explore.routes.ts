import { Router } from 'express';
import * as exploreController from '../controllers/explore.controller';

const router = Router();

// Routes
router.get('/search', exploreController.search);
router.get('/categories', exploreController.getCategories);
router.get('/trending', exploreController.getTrending);

export default router;


