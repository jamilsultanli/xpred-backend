import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';

export const search = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const q = (req.query.q as string) || '';
    const type = (req.query.type as string) || 'all';
    const category = req.query.category as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const results: any = {
      predictions: [],
      users: [],
    };

    // Search predictions
    if (type === 'all' || type === 'predictions') {
      let predQuery = supabaseAdmin
        .from('predictions')
        .select(`
          *,
          creator:profiles!creator_id(id, username, avatar_url)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (q) {
        predQuery = predQuery.or(`question.ilike.%${q}%,description.ilike.%${q}%`);
      }

      if (category) {
        predQuery = predQuery.eq('category', category);
      }

      const { data: predictions, count: predCount } = await predQuery;
      
      // Get likes and comments counts for each prediction
      const predictionsWithStats = await Promise.all(
        (predictions || []).map(async (pred: any) => {
          const [commentCount, likesCountResult, userLikeResult] = await Promise.all([
            supabaseAdmin
              .from('comments')
              .select('*', { count: 'exact', head: true })
              .eq('prediction_id', pred.id),
            supabaseAdmin
              .from('likes')
              .select('*', { count: 'exact', head: true })
              .eq('prediction_id', pred.id),
            req.user
              ? supabaseAdmin
                  .from('likes')
                  .select('id')
                  .eq('prediction_id', pred.id)
                  .eq('user_id', req.user.id)
                  .maybeSingle()
              : Promise.resolve({ data: null, error: null }),
          ]);

          // Handle case where prediction_id column might not exist
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

          return {
            ...pred,
            comments_count: commentCount.count || 0,
            likes_count: likesCount,
            is_liked: isLiked,
          };
        })
      );
      
      results.predictions = predictionsWithStats;
    }

    // Search users
    if (type === 'all' || type === 'users') {
      let userQuery = supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_verified, bio')
        .limit(limit);

      if (q) {
        userQuery = userQuery.or(`username.ilike.%${q}%,full_name.ilike.%${q}%`);
      }

      const { data: users } = await userQuery;
      results.users = users || [];
    }

    res.json({
      success: true,
      results,
      pagination: {
        page,
        limit,
        total: results.predictions.length + results.users.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCategories = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const categories = [
      'Politics',
      'Sports',
      'E-Gaming',
      'Crypto',
      'Finance',
      'Geopolitics',
      'Tech',
      'Startups',
      'Culture',
      'World',
      'Music',
      'Economy',
    ];

    // Get counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (cat) => {
        const [totalCount, activeCount] = await Promise.all([
          supabaseAdmin
            .from('predictions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat),
          supabaseAdmin
            .from('predictions')
            .select('*', { count: 'exact', head: true })
            .eq('category', cat)
            .eq('is_resolved', false),
        ]);

        return {
          name: cat,
          count: totalCount.count || 0,
          active_predictions: activeCount.count || 0,
        };
      })
    );

    res.json({
      success: true,
      categories: categoriesWithCounts,
    });
  } catch (error) {
    next(error);
  }
};

export const getTrending = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const period = (req.query.period as string) || '7d';
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    if (period === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Get predictions with XC bet activity in period (XC-based trending)
    const { data: bets } = await supabaseAdmin
      .from('bets')
      .select('prediction_id, amount, currency')
      .gte('created_at', startDate.toISOString());

    // Calculate trending score (bet count + total volume)
    const predictionScores: Record<string, { bets: number; volume: number; score: number }> = {};

    (bets || []).forEach((bet: any) => {
      if (bet.currency !== 'XC') return;
      if (!predictionScores[bet.prediction_id]) {
        predictionScores[bet.prediction_id] = { bets: 0, volume: 0, score: 0 };
      }
      predictionScores[bet.prediction_id].bets += 1;
      predictionScores[bet.prediction_id].volume += bet.amount;
    });

    // Calculate scores (bets * 10 + volume)
    Object.keys(predictionScores).forEach((id) => {
      predictionScores[id].score =
        predictionScores[id].bets * 10 + predictionScores[id].volume;
    });

    // Get top predictions
    const topPredictionIds = Object.entries(predictionScores)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([id]) => id);

    if (topPredictionIds.length === 0) {
      // Fallback: XC pot size for unresolved predictions
      const { data: fallback } = await supabaseAdmin
        .from('predictions')
        .select(
          `
        *,
        creator:profiles!creator_id(id, username, avatar_url, is_verified)
      `
        )
        .eq('is_resolved', false)
        .order('total_pot_xc', { ascending: false })
        .limit(limit);

      res.json({
        success: true,
        predictions: fallback || [],
      });
      return;
    }

    const { data: predictions } = await supabaseAdmin
      .from('predictions')
      .select(`
        *,
        creator:profiles!creator_id(id, username, avatar_url, is_verified)
      `)
      .in('id', topPredictionIds)
      .eq('is_resolved', false);

    // Sort by score
    const sortedPredictions = (predictions || []).sort((a: any, b: any) => {
      const scoreA = predictionScores[a.id]?.score || 0;
      const scoreB = predictionScores[b.id]?.score || 0;
      return scoreB - scoreA;
    });

    res.json({
      success: true,
      predictions: sortedPredictions,
    });
  } catch (error) {
    next(error);
  }
};


