import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ConflictError } from '../utils/errors';

export const repostPrediction = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if prediction exists
    const { data: prediction, error: predError } = await supabaseAdmin
      .from('predictions')
      .select('id, creator_id')
      .eq('id', id)
      .single();

    if (predError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    // Check if already reposted
    const { data: existing } = await supabaseAdmin
      .from('reposts')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('prediction_id', id)
      .maybeSingle();

    if (existing) {
      throw new ConflictError('Prediction already reposted');
    }

    // Create repost
    const { data: repost, error } = await supabaseAdmin
      .from('reposts')
      .insert({
        user_id: req.user.id,
        prediction_id: id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Create notification for prediction creator (if not self-repost)
    if (prediction.creator_id !== req.user.id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: prediction.creator_id,
        actor_id: req.user.id,
        type: 'repost',
        entity_id: id,
        message: 'reposted your prediction',
      });
    }

    res.json({
      success: true,
      message: 'Prediction reposted',
      repost,
    });
  } catch (error) {
    next(error);
  }
};

export const unrepostPrediction = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('reposts')
      .delete()
      .eq('user_id', req.user.id)
      .eq('prediction_id', id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Repost removed',
    });
  } catch (error) {
    next(error);
  }
};

export const getReposts = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Get reposts count
    const { count, error: countError } = await supabaseAdmin
      .from('reposts')
      .select('*', { count: 'exact', head: true })
      .eq('prediction_id', id);

    if (countError) {
      throw countError;
    }

    // Get reposts with user details
    const { data: reposts, error } = await supabaseAdmin
      .from('reposts')
      .select(
        `
        *,
        user:profiles!user_id(id, username, full_name, avatar_url)
      `
      )
      .eq('prediction_id', id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      reposts: reposts || [],
      count: count || 0,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserReposts = async (
  req: Request<{ username: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Get user first
    const { data: user, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (userError || !user) {
      throw new NotFoundError('User');
    }

    // Get reposts
    const { data: reposts, error, count } = await supabaseAdmin
      .from('reposts')
      .select(
        `
        *,
        prediction:predictions(
          id,
          question,
          description,
          deadline,
          category,
          creator_id,
          total_pot_xp,
          yes_pool_xp,
          no_pool_xp,
          total_pot_xc,
          yes_pool_xc,
          no_pool_xc,
          market_image,
          market_video,
          created_at,
          creator:profiles!creator_id(id, username, full_name, avatar_url)
        )
      `,
        { count: 'exact' }
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      reposts: reposts || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

