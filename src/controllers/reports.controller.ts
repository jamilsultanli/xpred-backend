import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, ValidationError } from '../utils/errors';
import { z } from 'zod';

const reportSchema = z.object({
  prediction_id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  reason: z.string().min(1).max(500),
  type: z.enum(['prediction', 'user']),
});

export const createReport = async (
  req: Request<{}, {}, z.infer<typeof reportSchema>>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const data = reportSchema.parse(req.body);

    if (data.type === 'prediction' && !data.prediction_id) {
      throw new ValidationError('Prediction ID is required for prediction reports');
    }

    if (data.type === 'user' && !data.user_id) {
      throw new ValidationError('User ID is required for user reports');
    }

    // Check if reports table exists, if not create it
    const { error: insertError } = await supabaseAdmin.from('reports').insert({
      reporter_id: req.user.id,
      prediction_id: data.prediction_id || null,
      reported_user_id: data.user_id || null,
      reason: data.reason,
      type: data.type,
      status: 'pending',
    });

    if (insertError) {
      // If table doesn't exist, create it
      if (insertError.message.includes('does not exist')) {
        // Table will be created via migration
        throw new ValidationError('Reports feature is being set up. Please try again later.');
      }
      throw insertError;
    }

    res.json({
      success: true,
      message: 'Report submitted successfully',
    });
  } catch (error) {
    next(error);
  }
};

