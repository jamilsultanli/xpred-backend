import { Router } from 'express';
import { z } from 'zod';
import * as postsController from '../controllers/posts.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const createPostSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(5000),
    image_url: z.string().url().optional().or(z.literal('')),
  }),
});

const updatePostSchema = z.object({
  body: z.object({
    content: z.string().min(1).max(5000).optional(),
    image_url: z.string().url().optional().or(z.literal('')),
  }),
});

// Routes
router.post(
  '/',
  authenticateUser,
  validate(createPostSchema),
  postsController.createPost
);
router.get('/', postsController.getPosts);
router.get('/:id', postsController.getPost);
router.put(
  '/:id',
  authenticateUser,
  validate(updatePostSchema),
  postsController.updatePost
);
router.delete('/:id', authenticateUser, postsController.deletePost);
router.post('/:id/like', authenticateUser, postsController.toggleLike);

export default router;


