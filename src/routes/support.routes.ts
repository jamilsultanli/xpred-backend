import { Router } from 'express';
import { z } from 'zod';
import * as supportController from '../controllers/support.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const createTicketSchema = z.object({
  body: z.object({
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
  }),
});

const replyTicketSchema = z.object({
  body: z.object({
    message: z.string().min(1).max(5000),
  }),
});

const contactSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email().max(200),
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
  }),
});

// Routes
router.post(
  '/tickets',
  authenticateUser,
  validate(createTicketSchema),
  supportController.createTicket
);
router.get('/tickets', authenticateUser, supportController.getTickets);
router.get('/tickets/:id', authenticateUser, supportController.getTicket);
router.post(
  '/tickets/:id/reply',
  authenticateUser,
  validate(replyTicketSchema),
  supportController.replyToTicket
);

router.post(
  '/contact',
  validate(contactSchema),
  supportController.submitContact
);

export default router;


