/**
 * Batch API Routes
 * Handles multiple requests in a single call
 */

import { Router } from 'express';
import { z } from 'zod';
import * as batchController from '../controllers/batch.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schema
const batchRequestSchema = z.object({
  body: z.object({
    requests: z.array(z.object({
      id: z.string(),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
      endpoint: z.string(),
      data: z.any().optional(),
    })).min(1).max(10), // Max 10 requests per batch
  }),
});

// Routes
router.post('/', authenticateUser, validate(batchRequestSchema), batchController.executeBatch);

export default router;

