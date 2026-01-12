import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, ValidationError } from '../utils/errors';
import { config } from '../config/env';

// File upload middleware would be added here
// For now, we'll handle URL-based uploads (files uploaded to Supabase Storage via frontend)

export const uploadImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    // In a full implementation, you would:
    // 1. Use multer or similar to handle file uploads
    // 2. Validate file type and size
    // 3. Upload to Supabase Storage or S3
    // 4. Return the public URL

    // For now, this is a placeholder that expects the file to be uploaded
    // via Supabase Storage client-side, and we just validate the URL

    const { url, type } = req.body;

    if (!url || typeof url !== 'string') {
      throw new ValidationError('Image URL is required');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new ValidationError('Invalid URL format');
    }

    // Validate file type from URL
    const validImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const urlLower = url.toLowerCase();
    const hasValidExtension = validImageExtensions.some(ext => urlLower.includes(ext));

    if (!hasValidExtension) {
      throw new ValidationError('Invalid image file type');
    }

    res.json({
      success: true,
      url: url,
      public_url: url,
    });
  } catch (error) {
    next(error);
  }
};

export const uploadDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      throw new ValidationError('Document URL is required');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new ValidationError('Invalid URL format');
    }

    // Validate file type from URL
    const validDocExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
    const urlLower = url.toLowerCase();
    const hasValidExtension = validDocExtensions.some(ext => urlLower.includes(ext));

    if (!hasValidExtension) {
      throw new ValidationError('Invalid document file type. Allowed: PDF, JPG, PNG');
    }

    // In production, upload to a private bucket and return signed URL
    res.json({
      success: true,
      url: url,
      secure_url: url, // In production, this would be a signed URL
    });
  } catch (error) {
    next(error);
  }
};

export const uploadVideo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    // Handle base64 data URL or file upload
    const { url, file } = req.body;

    // If it's a base64 data URL, extract and upload to Supabase Storage
    if (url && typeof url === 'string' && url.startsWith('data:video/')) {
      try {
        // Extract base64 data
        const matches = url.match(/^data:video\/(\w+);base64,(.+)$/);
        if (!matches) {
          throw new ValidationError('Invalid video data URL format');
        }

        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        // Validate file size (max 100MB)
        const maxSizeBytes = 100 * 1024 * 1024;
        if (buffer.length > maxSizeBytes) {
          throw new ValidationError('Video size must be less than 100MB');
        }

        // Generate unique filename
        const fileExt = mimeType === 'webm' ? 'webm' : mimeType === 'mp4' ? 'mp4' : 'mp4';
        const fileName = `videos/${req.user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('predictions')
          .upload(fileName, buffer, {
            contentType: `video/${mimeType}`,
            upsert: false,
          });

        if (uploadError) {
          console.error('Supabase storage upload error:', uploadError);
          // Check if bucket doesn't exist
          if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('not found')) {
            throw new ValidationError('Storage bucket not configured. Please create the "predictions" bucket in Supabase Storage. See migrations/create_storage_buckets.sql');
          }
          throw new ValidationError(`Failed to upload video: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from('predictions')
          .getPublicUrl(fileName);

        res.json({
          success: true,
          url: urlData.publicUrl,
          public_url: urlData.publicUrl,
        });
      } catch (error: any) {
        if (error instanceof ValidationError) {
          throw error;
        }
        throw new ValidationError(`Failed to process video: ${error.message}`);
      }
    } else if (url && typeof url === 'string') {
      // Validate URL format
      try {
        new URL(url);
      } catch {
        throw new ValidationError('Invalid URL format');
      }

      // Validate file type from URL
      const validVideoExtensions = ['.mp4', '.webm', '.mov', '.avi'];
      const urlLower = url.toLowerCase();
      const hasValidExtension = validVideoExtensions.some(ext => urlLower.includes(ext));

      if (!hasValidExtension && !url.startsWith('http')) {
        throw new ValidationError('Invalid video file type');
      }

      res.json({
        success: true,
        url: url,
        public_url: url,
      });
    } else {
      throw new ValidationError('Video URL or file is required');
    }
  } catch (error) {
    next(error);
  }
};


