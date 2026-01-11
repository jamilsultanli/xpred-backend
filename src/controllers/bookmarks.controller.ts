import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ConflictError } from '../utils/errors';

export const bookmarkPrediction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { predictionId } = req.body;

    if (!predictionId) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Prediction ID is required',
        },
      });
      return;
    }

    // Check if prediction exists
    const { data: prediction, error: predError } = await supabaseAdmin
      .from('predictions')
      .select('id')
      .eq('id', predictionId)
      .single();

    if (predError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    // Check if already bookmarked
    const { data: existing } = await supabaseAdmin
      .from('bookmarks')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('prediction_id', predictionId)
      .maybeSingle();

    if (existing) {
      throw new ConflictError('Prediction already bookmarked');
    }

    // Create bookmark
    const { data: bookmark, error } = await supabaseAdmin
      .from('bookmarks')
      .insert({
        user_id: req.user.id,
        prediction_id: predictionId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Prediction bookmarked',
      bookmark,
    });
  } catch (error) {
    next(error);
  }
};

export const unbookmarkPrediction = async (
  req: Request<{ predictionId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { predictionId } = req.params;

    const { error } = await supabaseAdmin
      .from('bookmarks')
      .delete()
      .eq('user_id', req.user.id)
      .eq('prediction_id', predictionId);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Bookmark removed',
    });
  } catch (error) {
    next(error);
  }
};

export const getBookmarks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const { data: bookmarks, error, count } = await supabaseAdmin
      .from('bookmarks')
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
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      bookmarks: bookmarks || [],
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

export const getBookmarkStatus = async (
  req: Request<{ predictionId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      res.json({
        success: true,
        isBookmarked: false,
      });
      return;
    }

    const { predictionId } = req.params;

    const { data: bookmark } = await supabaseAdmin
      .from('bookmarks')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('prediction_id', predictionId)
      .maybeSingle();

    res.json({
      success: true,
      isBookmarked: !!bookmark,
    });
  } catch (error) {
    next(error);
  }
};

