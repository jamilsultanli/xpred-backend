import { Router } from 'express';
import { z } from 'zod';
import * as commentsController from '../controllers/comments.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const createCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(1000),
  }),
});

// Routes
// Note: These routes are mounted at /api/v1/posts, so:
// GET /api/v1/posts/:id/comments
// POST /api/v1/posts/:id/comments
// DELETE /api/v1/posts/comments/:id (comment ID, not post ID)
router.get('/:id/comments', commentsController.getComments);
router.post(
  '/:id/comments',
  authenticateUser,
  validate(createCommentSchema),
  commentsController.addComment
);
// For delete, we need the comment ID, so we use a different path
router.delete('/comments/:id', authenticateUser, commentsController.deleteComment);

export default router;

