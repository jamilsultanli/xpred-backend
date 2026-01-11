import { Router } from 'express';
import { z } from 'zod';
import * as uploadController from '../controllers/upload.controller';
import { authenticateUser } from '../middleware/auth';
import { validate } from '../middleware/validation';

const router = Router();

// Validation schemas
const uploadImageSchema = z.object({
  body: z.object({
    url: z.string().url(),
    type: z.enum(['avatar', 'post', 'prediction']).optional(),
  }),
});

const uploadDocumentSchema = z.object({
  body: z.object({
    url: z.string(),
  }),
});

const uploadVideoSchema = z.object({
  body: z.object({
    url: z.string().refine((val) => {
      // Allow base64 data URLs or regular URLs
      return val.startsWith('data:video/') || val.startsWith('http://') || val.startsWith('https://');
    }, {
      message: 'Video URL must be a valid data URL or HTTP(S) URL',
    }),
  }),
});

// Routes
router.post(
  '/image',
  authenticateUser,
  validate(uploadImageSchema),
  uploadController.uploadImage
);
router.post(
  '/document',
  authenticateUser,
  validate(uploadDocumentSchema),
  uploadController.uploadDocument
);
router.post(
  '/video',
  authenticateUser,
  validate(uploadVideoSchema),
  uploadController.uploadVideo
);

export default router;


