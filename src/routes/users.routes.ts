import { Router } from 'express';
import { z } from 'zod';
import * as usersController from '../controllers/users.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const updateProfileSchema = z.object({
  body: z.object({
    full_name: z.string().optional(),
    username: z.string().min(3).max(30).optional(),
    bio: z.string().max(500).optional(),
    city: z.string().max(100).optional(),
    country: z.string().max(100).optional(),
    website: z.string().url().optional().or(z.literal('')),
    avatar_url: z.string().url().optional().or(z.literal('')),
  }),
});

// Routes
router.get('/me', authenticateUser, usersController.getCurrentUser);
router.get('/by-id/:id', usersController.getUserById);
router.get('/:username', usersController.getUserByUsername);
router.put('/me', authenticateUser, validate(updateProfileSchema), usersController.updateProfile);
router.get('/:username/predictions', usersController.getUserPredictions);
router.get('/:username/followers', usersController.getUserFollowers);
router.get('/:username/following', usersController.getUserFollowing);
router.get('/me/stats', authenticateUser, usersController.getUserStats);

export default router;


