import { Router } from 'express';
import { z } from 'zod';
import * as kycController from '../controllers/kyc.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const submitKYCSchema = z.object({
  body: z.object({
    document_url: z.string().url(),
  }),
});

// Routes
router.post(
  '/request',
  authenticateUser,
  validate(submitKYCSchema),
  kycController.submitKYCRequest
);
router.get('/status', authenticateUser, kycController.getVerificationStatus);

export default router;


