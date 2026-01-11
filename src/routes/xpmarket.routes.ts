import { Router } from 'express';
import * as xpMarketController from '../controllers/xpmarket.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Get market items (public)
router.get('/items', xpMarketController.getMarketItems);

// Purchase item (authenticated)
router.post('/purchase', authenticateUser, xpMarketController.purchaseItem);

// Get user purchases (authenticated)
router.get('/my-purchases', authenticateUser, xpMarketController.getUserPurchases);

export default router;

