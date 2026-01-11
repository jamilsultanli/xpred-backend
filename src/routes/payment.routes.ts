import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Create payment intent (requires auth)
router.post('/create-intent', authenticateUser, paymentController.createPaymentIntent);

// Confirm payment (requires auth)
router.post('/confirm/:id', authenticateUser, paymentController.confirmPayment);

// Stripe webhook endpoint (no auth required, uses signature verification)
// Note: This route should use express.raw() middleware in app.ts for webhook signature verification
router.post('/webhook/stripe', paymentController.handleStripeWebhook);

export default router;

