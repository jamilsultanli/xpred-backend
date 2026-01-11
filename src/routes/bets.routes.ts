import { Router } from 'express';
import { z } from 'zod';
import * as betsController from '../controllers/bets.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const placeBetSchema = z.object({
  body: z.object({
    prediction_id: z.string().uuid(),
    amount: z.number().positive(),
    currency: z.enum(['XP', 'XC']),
    choice: z.enum(['yes', 'no']),
  }),
});

// Routes
router.post(
  '/',
  authenticateUser,
  validate(placeBetSchema),
  betsController.placeBet
);
router.get('/active', authenticateUser, betsController.getActiveBets);
router.get('/multipliers/:predictionId', betsController.getMultipliers);
router.get('/', authenticateUser, betsController.getBets);
router.get('/:id', authenticateUser, betsController.getBet);
router.delete('/:id', authenticateUser, betsController.cancelBet);

export default router;


