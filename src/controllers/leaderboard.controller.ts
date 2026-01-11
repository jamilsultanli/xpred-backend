import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError } from '../utils/errors';

export const getLeaderboard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const type = (req.query.type as string) || 'xp';
    const period = (req.query.period as string) || 'all_time';
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    let query = supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, avatar_url, balance_xp, balance_xc, is_verified')
      .eq('is_banned', false)
      .limit(limit);

    // Apply sorting based on type
    if (type === 'xp') {
      query = query.order('balance_xp', { ascending: false });
    } else if (type === 'xc') {
      query = query.order('balance_xc', { ascending: false });
    } else if (type === 'wins') {
      // For wins, we'll calculate from bets and sort by total_wins
      // We'll sort after calculating stats
      query = query.order('balance_xp', { ascending: false }); // Temporary, will re-sort after
    } else {
      query = query.order('balance_xp', { ascending: false });
    }

    const { data: users, error } = await query;

    if (error) {
      throw error;
    }

    // Calculate additional stats for each user
    const usersWithStats = await Promise.all(
      (users || []).map(async (user: any, index: number) => {
        // Get prediction stats based on period
        let betsQuery = supabaseAdmin
          .from('bets')
          .select('choice, created_at, prediction:predictions!prediction_id(is_resolved, outcome, deadline)')
          .eq('user_id', user.id);

        // Filter by period if needed
        if (period === 'weekly') {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          betsQuery = betsQuery.gte('created_at', weekAgo.toISOString());
        } else if (period === 'monthly') {
          const monthAgo = new Date();
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          betsQuery = betsQuery.gte('created_at', monthAgo.toISOString());
        }
        // all_time: no date filter

        const { data: bets } = await betsQuery;

        const totalBets = bets?.length || 0;
        const wonBets = (bets || []).filter(
          (b: any) => b.prediction?.is_resolved && b.prediction.outcome === (b.choice === 'yes')
        ).length;
        const winRate = totalBets > 0 ? wonBets / totalBets : 0;

        return {
          rank: index + 1,
          user: {
            id: user.id,
            username: user.username,
            full_name: user.full_name,
            avatar_url: user.avatar_url,
            is_verified: user.is_verified,
          },
          balance_xp: user.balance_xp,
          balance_xc: user.balance_xc,
          total_wins: wonBets,
          total_predictions: totalBets,
          win_rate: winRate,
          current_streak: 0, // TODO: Calculate streak
        };
      })
    );

    // If sorting by wins, re-sort the array
    if (type === 'wins') {
      usersWithStats.sort((a: any, b: any) => {
        if (b.total_wins !== a.total_wins) {
          return b.total_wins - a.total_wins;
        }
        // Tie-breaker: higher win rate
        return b.win_rate - a.win_rate;
      });
      // Re-assign ranks
      usersWithStats.forEach((user: any, index: number) => {
        user.rank = index + 1;
      });
    }

    // Get current user's rank if authenticated
    let userRank = null;
    if (req.user && req.user.id) {
      const { data: currentUser } = await supabaseAdmin
        .from('profiles')
        .select('balance_xp, balance_xc')
        .eq('id', req.user.id)
        .single();

      if (currentUser) {
        const { count: rankCount } = await supabaseAdmin
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('is_banned', false)
          .gt('balance_xp', currentUser.balance_xp || 0);

        userRank = (rankCount || 0) + 1;
      }
    }

    res.json({
      success: true,
      leaderboard: usersWithStats,
      user_rank: userRank,
    });
  } catch (error) {
    next(error);
  }
};

