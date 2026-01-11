import { Router } from 'express';
import { z } from 'zod';
import * as walletController from '../controllers/wallet.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const purchaseBundleSchema = z.object({
  body: z.object({
    bundle_id: z.string(),
    payment_method: z.enum(['stripe', 'paypal']),
    payment_token: z.string().optional(),
    payment_intent_id: z.string().optional(),
  }),
});

const createPaymentIntentSchema = z.object({
  body: z.object({
    bundle_id: z.string(),
  }),
});

const exchangeSchema = z.object({
  body: z.object({
    amount_xp: z.number().positive(),
    exchange_rate: z.number().positive().optional(),
  }),
});

const withdrawalSchema = z.object({
  body: z.object({
    amount: z.number().positive(),
    currency: z.literal('XC'),
    withdrawal_method: z.enum(['bank_transfer', 'paypal']),
    account_details: z.record(z.any()).optional(),
  }),
});

// Routes
router.get('/balance', authenticateUser, walletController.getBalance);
router.get('/transactions', authenticateUser, walletController.getTransactions);
router.get('/bundles', walletController.getBundles);
router.post(
  '/purchase-bundle',
  authenticateUser,
  validate(purchaseBundleSchema),
  walletController.purchaseBundle
);
router.post(
  '/create-payment-intent',
  authenticateUser,
  validate(createPaymentIntentSchema),
  walletController.createPaymentIntent
);
router.post(
  '/exchange',
  authenticateUser,
  validate(exchangeSchema),
  walletController.exchangeXPtoXC
);
router.post(
  '/withdraw',
  authenticateUser,
  validate(withdrawalSchema),
  walletController.requestWithdrawal
);

export default router;


