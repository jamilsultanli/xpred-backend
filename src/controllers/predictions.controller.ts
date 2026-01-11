import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  PredictionResolvedError,
} from '../utils/errors';
import { CreatePredictionDto, UpdatePredictionDto, ResolvePredictionDto } from '../models/prediction.types';
import { aiService } from '../services/ai.service';
import { recommendationService } from '../services/recommendation.service';

export const createPrediction = async (
  req: Request<{}, {}, CreatePredictionDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    // Rate limiting: Check if user created a prediction in the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentPrediction, error: rateLimitError } = await supabaseAdmin
      .from('predictions')
      .select('id, created_at')
      .eq('creator_id', req.user.id)
      .gte('created_at', fiveMinutesAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (rateLimitError) {
      console.error('Rate limit check error:', rateLimitError);
    }

    if (recentPrediction) {
      const timeSinceLastPost = Date.now() - new Date(recentPrediction.created_at).getTime();
      const minutesRemaining = Math.ceil((5 * 60 * 1000 - timeSinceLastPost) / (60 * 1000));
      throw new ValidationError(
        `You can only share 1 prediction every 5 minutes. Please wait ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''} before sharing another prediction.`
      );
    }

    let { question, description, deadline, initial_pot_xp = 0, market_image, market_video, category } = req.body;

    // Convert deadline to ISO datetime if it's just a date (fallback, should already be converted)
    if (deadline && !deadline.includes('T')) {
      deadline = new Date(deadline + 'T23:59:59').toISOString();
    }

    // AI Moderation & Categorization
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/6ad6876e-0063-49c9-9841-eceac6501018',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.controller.ts:30',message:'Before AI moderation call',data:{questionLength:question.length,hasDescription:!!description,hasMedia:!!(market_image||market_video)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    const aiAnalysis = await aiService.moderateContent(question, description, market_image || market_video, deadline);
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/6ad6876e-0063-49c9-9841-eceac6501018',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.controller.ts:32',message:'After AI moderation call',data:{aiAnalysisSafe:aiAnalysis?.safe,aiAnalysisCategory:aiAnalysis?.category,aiAnalysisReason:aiAnalysis?.reason?.substring(0,100)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    // Check for deadline conflict
    if (aiAnalysis.deadlineConflict && aiAnalysis.deadlineReason) {
      throw new ValidationError(aiAnalysis.deadlineReason);
    }

    // Check for violations - these are blocking
    if (aiAnalysis.violations && aiAnalysis.violations.length > 0) {
      throw new ValidationError(
        `Content violates platform policies: ${aiAnalysis.violations.join(', ')}. Please revise your prediction.`
      );
    }

    if (!aiAnalysis.safe) {
      throw new ValidationError(`Content flagged as unsafe: ${aiAnalysis.reason}`);
    }

    // Use grammar-corrected versions if available
    const finalQuestion = aiAnalysis.grammarFixed || question;
    const finalDescription = aiAnalysis.descriptionFixed || description;
    
    console.log('📝 Final Text After Grammar Fix:', {
      originalQuestion: question.substring(0, 80),
      finalQuestion: finalQuestion.substring(0, 80),
      questionChanged: finalQuestion.trim() !== question.trim(),
      originalDescription: description?.substring(0, 80) || 'none',
      finalDescription: finalDescription?.substring(0, 80) || 'none',
      descriptionChanged: description && finalDescription ? finalDescription.trim() !== description.trim() : false,
    });
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/6ad6876e-0063-49c9-9841-eceac6501018',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.controller.ts:73',message:'Grammar check',data:{originalQuestion:question.substring(0,100),correctedQuestion:finalQuestion.substring(0,100),questionChanged:finalQuestion.trim().toLowerCase()!==question.trim().toLowerCase(),originalDescription:description?.substring(0,100)||'none',correctedDescription:finalDescription?.substring(0,100)||'none',descriptionChanged:description&&finalDescription?finalDescription.trim().toLowerCase()!==description.trim().toLowerCase():false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    // ALWAYS use AI-determined category (ignore user's choice as it might be wrong)
    const finalCategory = aiAnalysis.category;
    
    console.log('🏷️ Category Selection:', {
      userProvided: category || 'none',
      aiSelected: aiAnalysis.category,
      final: finalCategory
    });
    
    // Log category decision
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/6ad6876e-0063-49c9-9841-eceac6501018',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'predictions.controller.ts:81',message:'Category decision',data:{userProvidedCategory:category||'none',aiSelectedCategory:aiAnalysis.category,finalCategory:finalCategory},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion

    // Prepare warnings response if any
    const warnings = aiAnalysis.warnings && aiAnalysis.warnings.length > 0 
      ? aiAnalysis.warnings 
      : undefined;

    // Create prediction
    // Build insert object - conditionally include optional columns to avoid errors if they don't exist
    const insertData: any = {
      question: finalQuestion, // Use grammar-corrected version
      description: finalDescription || null,
      deadline,
      creator_id: req.user.id,
      category: finalCategory,
      total_pot_xp: initial_pot_xp,
      market_image: market_image || null,
      is_resolved: false,
      // Note: resolution_status may not exist in database yet, so we don't include it
      // It will default to 'pending' if the column exists with a default value
    };
    
    // Only include market_video if it's provided (column may not exist yet)
    if (market_video) {
      insertData.market_video = market_video;
    }
    
    const { data: prediction, error } = await supabaseAdmin
      .from('predictions')
      .insert(insertData)
      .select('*, creator:profiles!creator_id(id, username, full_name, avatar_url, is_verified)')
      .single();

    if (error || !prediction) {
      console.error('Database insert error:', error);
      throw new ValidationError(`Failed to create prediction: ${error?.message || 'Unknown error'}`);
    }

    // Create transaction record if initial pot is provided
    if (initial_pot_xp > 0) {
      await supabaseAdmin.from('transactions').insert({
        user_id: req.user.id,
        amount: initial_pot_xp,
        currency: 'XP',
        type: 'bet_placed',
        description: `Initial pot for prediction: ${finalQuestion.substring(0, 50)}...`,
      });
    }

    res.status(201).json({
      success: true,
      prediction,
      ai_analysis: {
        category: finalCategory,
        safe: aiAnalysis.safe,
        reason: aiAnalysis.reason,
        grammarFixed: aiAnalysis.grammarFixed !== question,
        warnings: warnings,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPredictions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const category = req.query.category as string;
    const status = (req.query.status as string) || 'active';
    const sort = (req.query.sort as string) || 'newest';
    const featured = req.query.featured === 'true';
    const search = req.query.search as string;
    const feedType = req.query.feedType as string; // 'for-you', 'explore', or default

    // Use personalized feed if requested
    if (feedType === 'for-you' && req.user) {
      const predictionIds = await recommendationService.getPersonalizedFeed(
        req.user.id,
        page,
        limit
      );

      if (predictionIds.length > 0) {
        const { data: predictions } = await supabaseAdmin
          .from('predictions')
          .select(`
            *,
            creator:profiles!creator_id(id, username, full_name, avatar_url, is_verified)
          `)
          .in('id', predictionIds);

        // Sort by the order returned from recommendation service
        const orderedPredictions = predictionIds
          .map(id => predictions?.find(p => p.id === id))
          .filter(Boolean);

        const predictionsWithStats = await addStatsToPredictions(orderedPredictions as any[], req.user?.id);

        return res.json({
          success: true,
          predictions: predictionsWithStats,
          pagination: {
            page,
            limit,
            total: predictionIds.length,
            pages: Math.ceil(predictionIds.length / limit),
          },
          feedType: 'for-you',
        });
      }
    }

    // Use explore feed if requested
    if (feedType === 'explore') {
      const predictionIds = await recommendationService.getExploreFeed(
        req.user?.id || null,
        page,
        limit
      );

      if (predictionIds.length > 0) {
        const { data: predictions } = await supabaseAdmin
          .from('predictions')
          .select(`
            *,
            creator:profiles!creator_id(id, username, full_name, avatar_url, is_verified)
          `)
          .in('id', predictionIds);

        const orderedPredictions = predictionIds
          .map(id => predictions?.find(p => p.id === id))
          .filter(Boolean);

        const predictionsWithStats = await addStatsToPredictions(orderedPredictions as any[], req.user?.id);

        return res.json({
          success: true,
          predictions: predictionsWithStats,
          pagination: {
            page,
            limit,
            total: predictionIds.length,
            pages: Math.ceil(predictionIds.length / limit),
          },
          feedType: 'explore',
        });
      }
    }

    // Default query-based feed
    let query = supabaseAdmin
      .from('predictions')
      .select(`
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url, is_verified)
      `, { count: 'exact' });

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (status === 'active') {
      query = query.eq('is_resolved', false);
    } else if (status === 'resolved') {
      query = query.eq('is_resolved', true);
    }

    if (featured) {
      query = query.eq('is_featured', true);
    }

    if (search) {
      query = query.or(`question.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply sorting
    if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sort === 'trending') {
      query = query.order('total_pot_xp', { ascending: false });
    } else if (sort === 'deadline') {
      query = query.order('deadline', { ascending: true });
    } else if (sort === 'pot_size') {
      query = query.order('total_pot_xp', { ascending: false });
    }

    // Apply pagination
    query = query.range((page - 1) * limit, page * limit - 1);

    const { data: predictions, error, count } = await query;

    if (error) {
      throw error;
    }

    const predictionsWithStats = await addStatsToPredictions(predictions || [], req.user?.id);

    res.json({
      success: true,
      predictions: predictionsWithStats,
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

// Helper function to add stats to predictions
async function addStatsToPredictions(predictions: any[], userId?: string) {
  return await Promise.all(
    predictions.map(async (pred: any) => {
      const [betCount, commentCount, likesCountResult, userLikeResult, repostsCountResult, userRepostResult] = await Promise.all([
        supabaseAdmin
          .from('bets')
          .select('*', { count: 'exact', head: true })
          .eq('prediction_id', pred.id),
        supabaseAdmin
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('prediction_id', pred.id),
        supabaseAdmin
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('prediction_id', pred.id),
        userId
          ? supabaseAdmin
              .from('likes')
              .select('id')
              .eq('prediction_id', pred.id)
              .eq('user_id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabaseAdmin
          .from('reposts')
          .select('*', { count: 'exact', head: true })
          .eq('prediction_id', pred.id),
        userId
          ? supabaseAdmin
              .from('reposts')
              .select('id')
              .eq('prediction_id', pred.id)
              .eq('user_id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      let likesCount = 0;
      let isLiked = false;

      if (likesCountResult.error) {
        if (likesCountResult.error.message?.includes('column') && likesCountResult.error.message?.includes('does not exist')) {
          likesCount = 0;
        } else {
          console.error('Error fetching likes count:', likesCountResult.error);
          likesCount = 0;
        }
      } else {
        likesCount = likesCountResult.count || 0;
      }

      if (userLikeResult.error) {
        if (userLikeResult.error.message?.includes('column') && userLikeResult.error.message?.includes('does not exist')) {
          isLiked = false;
        } else {
          console.error('Error checking user like:', userLikeResult.error);
          isLiked = false;
        }
      } else {
        isLiked = !!userLikeResult.data;
      }

      const repostsCount = repostsCountResult.count || 0;
      const isReposted = !!userRepostResult.data;

      return {
        ...pred,
        bet_count: betCount.count || 0,
        comments_count: commentCount.count || 0,
        likes_count: likesCount,
        is_liked: isLiked,
        reposts_count: repostsCount,
        is_reposted: isReposted,
      };
    })
  );
}

export const getPrediction = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const { data: prediction, error } = await supabaseAdmin
      .from('predictions')
      .select(`
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url, is_verified)
      `)
      .eq('id', id)
      .single();

    if (error || !prediction) {
      throw new NotFoundError('Prediction');
    }

    // Track view if user is authenticated
    if (req.user) {
      recommendationService.trackInteraction(
        req.user.id,
        id,
        'view',
        prediction.category
      ).catch(err => console.error('Failed to track view:', err));
    }

    // Get stats
    const [betsResult, uniqueBettorsResult, commentCount, likesCountResult, userLikeResult, repostsCountResult, userRepostResult] = await Promise.all([
      supabaseAdmin
        .from('bets')
        .select('*', { count: 'exact', head: true })
        .eq('prediction_id', id),
      supabaseAdmin
        .from('bets')
        .select('user_id')
        .eq('prediction_id', id),
      supabaseAdmin
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('prediction_id', id),
      supabaseAdmin
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('prediction_id', id),
      req.user
        ? supabaseAdmin
            .from('likes')
            .select('id')
            .eq('prediction_id', id)
            .eq('user_id', req.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from('reposts')
        .select('*', { count: 'exact', head: true })
        .eq('prediction_id', id),
      req.user
        ? supabaseAdmin
            .from('reposts')
            .select('id')
            .eq('prediction_id', id)
            .eq('user_id', req.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    const totalBets = betsResult.count || 0;
    const uniqueBettors = new Set((uniqueBettorsResult.data || []).map((b: any) => b.user_id)).size;
    
    // Handle likes/comments counts
    let likesCount = 0;
    let isLiked = false;

    if (likesCountResult.error) {
      if (likesCountResult.error.message?.includes('column') && likesCountResult.error.message?.includes('does not exist')) {
        likesCount = 0;
      } else {
        console.error('Error fetching likes count:', likesCountResult.error);
        likesCount = 0;
      }
    } else {
      likesCount = likesCountResult.count || 0;
    }

    if (userLikeResult.error) {
      if (userLikeResult.error.message?.includes('column') && userLikeResult.error.message?.includes('does not exist')) {
        isLiked = false;
      } else {
        console.error('Error checking user like:', userLikeResult.error);
        isLiked = false;
      }
    } else {
      isLiked = !!userLikeResult.data;
    }

    const yesPercentage = prediction.total_pot_xp > 0
      ? Math.round((prediction.yes_pool_xp / prediction.total_pot_xp) * 100)
      : 50;
    const noPercentage = 100 - yesPercentage;

    // Get user's bet if authenticated
    let userBet = null;
    if (req.user) {
      const { data: bet } = await supabaseAdmin
        .from('bets')
        .select('*')
        .eq('prediction_id', id)
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      userBet = bet;
    }

    res.json({
      success: true,
      prediction: {
        ...prediction,
        likes_count: likesCount,
        comments_count: commentCount.count || 0,
        is_liked: isLiked,
      },
      user_bet: userBet,
      stats: {
        total_bets: totalBets,
        unique_bettors: uniqueBettors,
        yes_percentage: yesPercentage,
        no_percentage: noPercentage,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updatePrediction = async (
  req: Request<{ id: string }, {}, UpdatePredictionDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;
    const updates = req.body;

    // Check if prediction exists and user is creator
    const { data: prediction, error: fetchError } = await supabaseAdmin
      .from('predictions')
      .select('creator_id, deadline, is_resolved')
      .eq('id', id)
      .single();

    if (fetchError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    if (prediction.creator_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the creator can update this prediction');
    }

    // Check if deadline has passed
    if (new Date(prediction.deadline) < new Date() && req.user.role !== 'admin') {
      throw new ValidationError('Cannot update prediction after deadline');
    }

    if (prediction.is_resolved) {
      throw new PredictionResolvedError();
    }

    const { data: updatedPrediction, error } = await supabaseAdmin
      .from('predictions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedPrediction) {
      throw new ValidationError('Failed to update prediction');
    }

    res.json({
      success: true,
      prediction: updatedPrediction,
    });
  } catch (error) {
    next(error);
  }
};

// Commented out - no longer used after frontend AI buttons removed
// export const getAISuggestions = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     if (!req.user) {
//       throw new ForbiddenError('User not authenticated');
//     }

//     const { topic, category } = req.query;
    
//     const suggestions = await aiService.generatePredictionSuggestions(
//       topic as string,
//       category as string
//     );

//     res.json({
//       success: true,
//       ...suggestions,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

// export const improvePredictionQuestion = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     if (!req.user) {
//       throw new ForbiddenError('User not authenticated');
//     }

//     const { question, description } = req.body;

//     if (!question || typeof question !== 'string') {
//       throw new ValidationError('Question is required');
//     }

//     const improved = await aiService.improvePredictionQuestion(question, description);

//     res.json({
//       success: true,
//       ...improved,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

export const getExpiredPredictions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const now = new Date().toISOString();

    // Get predictions created by user that have expired but not been resolved
    const { data: expiredPredictions, error } = await supabaseAdmin
      .from('predictions')
      .select(`
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url)
      `)
      .eq('creator_id', req.user.id)
      .eq('is_resolved', false)
      .lt('deadline', now)
      .order('deadline', { ascending: false });

    if (error) {
      throw new ValidationError(`Failed to fetch expired predictions: ${error.message}`);
    }

    res.json({
      success: true,
      predictions: expiredPredictions || [],
      count: expiredPredictions?.length || 0,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePrediction = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if prediction exists and user is creator or admin
    const { data: prediction, error: fetchError } = await supabaseAdmin
      .from('predictions')
      .select('creator_id, is_resolved')
      .eq('id', id)
      .single();

    if (fetchError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    if (prediction.creator_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the creator or admin can delete this prediction');
    }

    // Check if there are bets (for non-admins)
    if (req.user.role !== 'admin') {
      const { count } = await supabaseAdmin
        .from('bets')
        .select('*', { count: 'exact', head: true })
        .eq('prediction_id', id);

      if (count && count > 0) {
        throw new ValidationError('Cannot delete prediction with existing bets');
      }
    }

    // Delete prediction (bets will be handled by cascade or manual deletion for admins)
    const { error } = await supabaseAdmin
      .from('predictions')
      .delete()
      .eq('id', id);

    if (error) {
      throw new ValidationError('Failed to delete prediction');
    }

    res.json({
      success: true,
      message: 'Prediction deleted',
    });
  } catch (error) {
    next(error);
  }
};

export const resolvePrediction = async (
  req: Request<{ id: string }, {}, ResolvePredictionDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;
    const { outcome } = req.body;

    // Check if prediction exists
    const { data: prediction, error: fetchError } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    if (prediction.is_resolved) {
      throw new PredictionResolvedError();
    }

    // Check if user is creator or admin
    if (prediction.creator_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the creator or admin can resolve this prediction');
    }

    // Use RPC function to resolve and distribute payouts
    const { config } = await import('../config/env');
    const { data: resolveResult, error: resolveError } = await supabaseAdmin.rpc(
      'resolve_prediction',
      {
        p_prediction_id: id,
        p_outcome: outcome,
        p_platform_fee_rate: config.PLATFORM_FEE_RATE,
      }
    );

    if (resolveError) {
      throw new ValidationError(`Failed to resolve prediction: ${resolveError.message}`);
    }

    // Get updated prediction
    const { data: updatedPrediction } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('id', id)
      .single();

    // Calculate payout summary
    const { data: winningBets } = await supabaseAdmin
      .from('bets')
      .select('amount, currency')
      .eq('prediction_id', id)
      .eq('choice', outcome ? 'yes' : 'no');

    const totalPayoutXP = (winningBets || [])
      .filter((b: any) => b.currency === 'XP')
      .reduce((sum: number, b: any) => sum + b.amount, 0);
    const totalPayoutXC = (winningBets || [])
      .filter((b: any) => b.currency === 'XC')
      .reduce((sum: number, b: any) => sum + b.amount, 0);

    res.json({
      success: true,
      message: 'Prediction resolved and payouts distributed',
      prediction: updatedPrediction,
      payout_summary: {
        total_payout_xp: totalPayoutXP,
        total_payout_xc: totalPayoutXC,
        winners_count: winningBets?.length || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const proposeResolution = async (
  req: Request<{ id: string }, {}, { proposed_outcome: boolean; evidence?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;
    const { proposed_outcome, evidence } = req.body;

    // Check if prediction exists and user is creator
    const { data: prediction, error: fetchError } = await supabaseAdmin
      .from('predictions')
      .select('creator_id, is_resolved, deadline')
      .eq('id', id)
      .single();

    if (fetchError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    if (prediction.creator_id !== req.user.id) {
      throw new ForbiddenError('Only the creator can propose resolution');
    }

    if (prediction.is_resolved) {
      throw new PredictionResolvedError();
    }

    // Check if deadline has passed
    const deadlineDate = new Date(prediction.deadline);
    const now = new Date();
    if (deadlineDate > now) {
      throw new ValidationError('Cannot submit resolution before deadline has passed');
    }

    // Update prediction with proposed resolution
    const { data: updatedPrediction, error } = await supabaseAdmin
      .from('predictions')
      .update({
        proposed_outcome,
        resolution_status: 'submitted',
        resolution_proof_url: evidence,
        resolution_proof_type: evidence?.startsWith('http') ? 'url' : 'image',
        resolution_submitted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedPrediction) {
      throw new ValidationError('Failed to propose resolution');
    }

    res.json({
      success: true,
      message: 'Resolution proposal submitted for admin review',
      prediction: updatedPrediction,
    });
  } catch (error) {
    next(error);
  }
};

export const getPendingResolutions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    // Get all expired predictions where user is creator and not yet resolved
    const { data: predictions, error } = await supabaseAdmin
      .from('predictions')
      .select('*, creator:profiles!creator_id(id, username, full_name, avatar_url)')
      .eq('creator_id', req.user.id)
      .eq('is_resolved', false)
      .lt('deadline', new Date().toISOString())
      .order('deadline', { ascending: false });

    if (error) {
      throw new ValidationError('Failed to fetch pending resolutions');
    }

    // Count pending (not submitted) and submitted (under review)
    const pending = (predictions || []).filter(p => p.resolution_status === 'pending');
    const underReview = (predictions || []).filter(p => p.resolution_status === 'submitted');

    res.json({
      success: true,
      predictions: predictions || [],
      counts: {
        total: (predictions || []).length,
        pending: pending.length,
        underReview: underReview.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

