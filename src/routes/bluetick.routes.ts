import { Router } from 'express';
import * as blueTickController from '../controllers/bluetick.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Create subscription (authenticated)
router.post('/subscribe', authenticateUser, blueTickController.createBlueTickSubscription);

// Cancel subscription (authenticated)
router.post('/cancel', authenticateUser, blueTickController.cancelBlueTickSubscription);

// Get status (authenticated)
router.get('/status', authenticateUser, blueTickController.getBlueTickStatus);

// Webhook (no auth, Stripe signature verification)
router.post('/webhook', blueTickController.handleStripeWebhook);

export default router;

