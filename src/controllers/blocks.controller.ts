import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ConflictError } from '../utils/errors';

export const blockUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { user_id } = req.body;

    if (!user_id) {
      throw new NotFoundError('User ID is required');
    }

    if (user_id === req.user.id) {
      throw new ConflictError('Cannot block yourself');
    }

    // Check if user exists
    const { data: user } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', user_id)
      .single();

    if (!user) {
      throw new NotFoundError('User');
    }

    // Check if already blocked
    const { data: existing } = await supabaseAdmin
      .from('blocked_users')
      .select('id')
      .eq('blocker_id', req.user.id)
      .eq('blocked_id', user_id)
      .maybeSingle();

    if (existing) {
      throw new ConflictError('User is already blocked');
    }

    // Block user
    const { error } = await supabaseAdmin.from('blocked_users').insert({
      blocker_id: req.user.id,
      blocked_id: user_id,
    });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'User blocked successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const unblockUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { user_id } = req.body;

    if (!user_id) {
      throw new NotFoundError('User ID is required');
    }

    const { error } = await supabaseAdmin
      .from('blocked_users')
      .delete()
      .eq('blocker_id', req.user.id)
      .eq('blocked_id', user_id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'User unblocked successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getBlockedUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: blocked, error } = await supabaseAdmin
      .from('blocked_users')
      .select(`
        blocked_id,
        profiles:blocked_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('blocker_id', req.user.id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      blocked_users: blocked || [],
    });
  } catch (error) {
    next(error);
  }
};

export const muteUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { user_id } = req.body;

    if (!user_id) {
      throw new NotFoundError('User ID is required');
    }

    if (user_id === req.user.id) {
      throw new ConflictError('Cannot mute yourself');
    }

    // Check if already muted
    const { data: existing } = await supabaseAdmin
      .from('muted_users')
      .select('id')
      .eq('muter_id', req.user.id)
      .eq('muted_id', user_id)
      .maybeSingle();

    if (existing) {
      throw new ConflictError('User is already muted');
    }

    const { error } = await supabaseAdmin.from('muted_users').insert({
      muter_id: req.user.id,
      muted_id: user_id,
    });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'User muted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const unmuteUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { user_id } = req.body;

    if (!user_id) {
      throw new NotFoundError('User ID is required');
    }

    const { error } = await supabaseAdmin
      .from('muted_users')
      .delete()
      .eq('muter_id', req.user.id)
      .eq('muted_id', user_id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'User unmuted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getMutedUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: muted, error } = await supabaseAdmin
      .from('muted_users')
      .select(`
        muted_id,
        profiles:muted_id (
          id,
          username,
          full_name,
          avatar_url
        )
      `)
      .eq('muter_id', req.user.id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      muted_users: muted || [],
    });
  } catch (error) {
    next(error);
  }
};

