import { Router } from 'express';
import { z } from 'zod';
import * as messagesController from '../controllers/messages.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const sendMessageSchema = z.object({
  body: z.object({
    receiverId: z.string().uuid(),
    content: z.string().min(1).max(5000),
  }),
});

const reactToMessageSchema = z.object({
  body: z.object({
    emoji: z.string().min(1).max(10),
  }),
});

const typingStatusSchema = z.object({
  body: z.object({
    isTyping: z.boolean(),
  }),
});

// Routes
router.get('/', authenticateUser, messagesController.getConversations);
router.get('/unread-count', authenticateUser, messagesController.getUnreadCount);
router.get('/:conversationId', authenticateUser, messagesController.getMessages);
router.get('/:conversationId/typing', authenticateUser, messagesController.getTypingStatus);
router.post('/', authenticateUser, validate(sendMessageSchema), messagesController.sendMessage);
router.delete('/:messageId', authenticateUser, messagesController.deleteMessage);
router.post('/:messageId/react', authenticateUser, validate(reactToMessageSchema), messagesController.reactToMessage);
router.post('/:conversationId/typing', authenticateUser, validate(typingStatusSchema), messagesController.updateTypingStatus);

export default router;
