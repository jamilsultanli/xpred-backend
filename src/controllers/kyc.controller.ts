import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';
import { SubmitKYCDto } from '../models/kyc.types';

export const submitKYCRequest = async (
  req: Request<{}, {}, SubmitKYCDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { document_url } = req.body;

    if (!document_url || document_url.trim().length === 0) {
      throw new ValidationError('Document URL is required');
    }

    // Check if user already has a pending request
    const { data: existingRequest } = await supabaseAdmin
      .from('verification_requests')
      .select('status')
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingRequest) {
      throw new ConflictError('You already have a pending verification request');
    }

    // Check if user is already verified
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_verified')
      .eq('id', req.user.id)
      .single();

    if (profile?.is_verified) {
      throw new ConflictError('User is already verified');
    }

    // Create verification request
    const { data: request, error } = await supabaseAdmin
      .from('verification_requests')
      .insert({
        user_id: req.user.id,
        document_url: document_url.trim(),
        status: 'pending',
      })
      .select()
      .single();

    if (error || !request) {
      throw new ValidationError('Failed to submit verification request');
    }

    res.status(201).json({
      success: true,
      message: 'Verification request submitted',
      request,
    });
  } catch (error) {
    next(error);
  }
};

export const getVerificationStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_verified')
      .eq('id', req.user.id)
      .single();

    const { data: request } = await supabaseAdmin
      .from('verification_requests')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({
      success: true,
      is_verified: profile?.is_verified || false,
      verification_request: request || null,
    });
  } catch (error) {
    next(error);
  }
};


