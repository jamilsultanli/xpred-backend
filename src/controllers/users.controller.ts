import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, ConflictError, ForbiddenError } from '../utils/errors';
import { UpdateProfileDto } from '../models/user.types';
import { assignAutoTitles } from './xpmarket.controller';

export const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      throw new NotFoundError('User profile');
    }

    // Auto-assign title if user doesn't have one
    if (!profile.title) {
      await assignAutoTitles(profile.id);
      // Refetch to get updated title
      const { data: updatedProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .single();
      
      if (updatedProfile) {
        return res.json({
          success: true,
          user: updatedProfile,
        });
      }
    }

    res.json({
      success: true,
      user: profile,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserByUsername = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { username } = req.params;

    // Username lookup should be case-insensitive
    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .ilike('username', username) // Case-insensitive search
      .single();

    if (error || !profile) {
      throw new NotFoundError('User');
    }

    // Auto-assign title if user doesn't have one
    if (!profile.title) {
      await assignAutoTitles(profile.id);
      // Refetch to get updated title
      const { data: updatedProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .single();
      
      if (updatedProfile) {
        return res.json({
          success: true,
          user: updatedProfile,
        });
      }
    }

    res.json({
      success: true,
      user: profile,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !profile) {
      throw new NotFoundError('User');
    }

    res.json({
      success: true,
      user: profile,
    });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (
  req: Request<{}, {}, UpdateProfileDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const updateData: any = {};

    if (req.body.full_name !== undefined) {
      updateData.full_name = req.body.full_name;
    }
    if (req.body.username !== undefined) {
      // Check if username is already taken
      if (req.body.username) {
        const { data: existingUser } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('username', req.body.username)
          .neq('id', req.user.id)
          .maybeSingle();

        if (existingUser) {
          throw new ConflictError('Username already taken');
        }
      }
      updateData.username = req.body.username;
    }
    if (req.body.bio !== undefined) {
      updateData.bio = req.body.bio;
    }
    if (req.body.city !== undefined) {
      updateData.city = req.body.city;
    }
    if (req.body.country !== undefined) {
      updateData.country = req.body.country;
    }
    if (req.body.website !== undefined) {
      updateData.website = req.body.website;
    }
    if (req.body.avatar_url !== undefined) {
      updateData.avatar_url = req.body.avatar_url;
    }

    const { data: updatedProfile, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Profile updated',
      user: updatedProfile,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserPredictions = async (
  req: Request,
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

    let query = supabaseAdmin
      .from('predictions')
      .select(
        `
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url, is_verified)
      `,
        { count: 'exact' }
      )
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data: predictions, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get bet counts, comment counts, and likes for each prediction
    const predictionsWithStats = await Promise.all(
      (predictions || []).map(async (pred: any) => {
        const [betCount, commentCount, likesCountResult, userLikeResult] = await Promise.all([
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
          req.user
            ? supabaseAdmin
                .from('likes')
                .select('id')
                .eq('prediction_id', pred.id)
                .eq('user_id', req.user.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        // Handle case where prediction_id column might not exist (migration not run)
        let likesCount = 0;
        let isLiked = false;

        if (likesCountResult.error) {
          // If error is about missing column, default to 0
          if (likesCountResult.error.message?.includes('column') && likesCountResult.error.message?.includes('does not exist')) {
            likesCount = 0;
          } else {
            // Other error - log it but continue
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
          bet_count: betCount.count || 0,
          comments_count: commentCount.count || 0,
          likes_count: likesCount,
          is_liked: isLiked,
        };
      })
    );

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

export const getUserFollowers = async (
  req: Request,
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

    const { data: follows, error, count } = await supabaseAdmin
      .from('follows')
      .select('follower_id, profiles!follower_id(*)', { count: 'exact' })
      .eq('following_id', user.id)
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    const followers = (follows || []).map((f: any) => f.profiles);

    res.json({
      success: true,
      followers,
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

export const getUserFollowing = async (
  req: Request,
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

    const { data: follows, error, count } = await supabaseAdmin
      .from('follows')
      .select('following_id, profiles!following_id(*)', { count: 'exact' })
      .eq('follower_id', user.id)
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    const following = (follows || []).map((f: any) => f.profiles);

    res.json({
      success: true,
      following,
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

export const getUserStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    // Get wallet balance
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, balance_xc')
      .eq('id', req.user.id)
      .single();

    // Get active bets count (bets on unresolved predictions)
    // First get all user bets, then filter
    const { data: allBets } = await supabaseAdmin
      .from('bets')
      .select('prediction_id, prediction:predictions!prediction_id(is_resolved)')
      .eq('user_id', req.user.id);

    const activeBetsCount = (allBets || []).filter((bet: any) => 
      bet.prediction && !bet.prediction.is_resolved
    ).length;

    // Get total predictions created
    const { count: predictionsCount } = await supabaseAdmin
      .from('predictions')
      .select('*', { count: 'exact', head: true })
      .eq('creator_id', req.user.id);

    // Get total bets placed
    const { count: totalBetsCount } = await supabaseAdmin
      .from('bets')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);

    // Calculate win rate
    // Get all resolved predictions where user had bets
    const { data: userBets } = await supabaseAdmin
      .from('bets')
      .select('prediction_id, choice, prediction:predictions!inner(id, outcome, is_resolved)')
      .eq('user_id', req.user.id);

    let wins = 0;
    let totalResolvedBets = 0;

    (userBets || []).forEach((bet: any) => {
      if (bet.prediction && bet.prediction.is_resolved) {
        totalResolvedBets++;
        const betChoice = bet.choice === 'yes';
        const outcome = bet.prediction.outcome;
        if (betChoice === outcome) {
          wins++;
        }
      }
    });

    const winRate = totalResolvedBets > 0 ? (wins / totalResolvedBets) * 100 : 0;

    // Calculate total winnings (from transactions)
    const { data: transactions } = await supabaseAdmin
      .from('transactions')
      .select('amount, currency')
      .eq('user_id', req.user.id)
      .eq('type', 'bet_won');

    let totalWinningsXP = 0;
    let totalWinningsXC = 0;

    (transactions || []).forEach((tx: any) => {
      if (tx.currency === 'XP') {
        totalWinningsXP += parseFloat(tx.amount) || 0;
      } else if (tx.currency === 'XC') {
        totalWinningsXC += parseFloat(tx.amount) || 0;
      }
    });

    res.json({
      success: true,
      stats: {
        totalXP: parseFloat(profile?.balance_xp || '0'),
        totalXC: parseFloat(profile?.balance_xc || '0'),
        activeBets: activeBetsCount,
        winRate: Math.round(winRate * 100) / 100, // Round to 2 decimal places
        totalPredictions: predictionsCount || 0,
        totalBets: totalBetsCount || 0,
        totalWinningsXP,
        totalWinningsXC,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const checkUsernameAvailability = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { username } = req.params;

    if (!username || username.length < 3) {
      return res.json({
        success: true,
        available: false,
        message: 'Username must be at least 3 characters',
      });
    }

    if (username.length > 15) {
      return res.json({
        success: true,
        available: false,
        message: 'Username must be less than 15 characters',
      });
    }

    // Check if username matches valid pattern (letters, numbers, underscores only)
    if (!/^[a-z0-9_]+$/.test(username.toLowerCase())) {
      return res.json({
        success: true,
        available: false,
        message: 'Username can only contain letters, numbers, and underscores',
      });
    }

    // Check if username is already taken
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return res.json({
        success: true,
        available: false,
        message: 'Username is already taken',
      });
    }

    return res.json({
      success: true,
      available: true,
      message: 'Username is available',
    });
  } catch (error) {
    return next(error);
  }
};

export const getSuggestedUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
    const interests = req.query.interests ? (req.query.interests as string).split(',') : [];

    // Get users with most followers, excluding current user
    // Order by follower count (we'll need to calculate this)
    let query = supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, bio, avatar_url, created_at')
      .neq('id', userId)
      .not('username', 'is', null)
      .limit(limit);

    const { data: users, error } = await query;

    if (error) {
      throw error;
    }

    // Get follower counts for each user
    const usersWithStats = await Promise.all(
      (users || []).map(async (user: any) => {
        const { count: followerCount } = await supabaseAdmin
          .from('follows')
          .select('*', { count: 'exact', head: true })
          .eq('following_id', user.id);

        const { count: predictionCount } = await supabaseAdmin
          .from('predictions')
          .select('*', { count: 'exact', head: true })
          .eq('creator_id', user.id);

        // Check if current user is already following this user
        const { data: isFollowing } = await supabaseAdmin
          .from('follows')
          .select('id')
          .eq('follower_id', userId)
          .eq('following_id', user.id)
          .maybeSingle();

        return {
          id: user.id,
          username: user.username,
          displayName: user.full_name || user.username,
          bio: user.bio || 'No bio yet',
          avatar_url: user.avatar_url,
          followers: followerCount || 0,
          predictions: predictionCount || 0,
          isFollowing: !!isFollowing,
        };
      })
    );

    // Sort by follower count (descending)
    usersWithStats.sort((a, b) => b.followers - a.followers);

    return res.json({
      success: true,
      users: usersWithStats,
    });
  } catch (error) {
    return next(error);
  }
};

export const completeOnboarding = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const userId = req.user.id;
    const { username, bio, avatar_url, interests, follow_user_ids } = req.body;

    const updateData: any = {};

    // Update username if provided
    if (username) {
      // Check if username is already taken
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .neq('id', userId)
        .maybeSingle();

      if (existingUser) {
        throw new ConflictError('Username already taken');
      }

      updateData.username = username.toLowerCase();
    }

    // Update bio if provided
    if (bio !== undefined) {
      updateData.bio = bio;
    }

    // Update avatar if provided
    if (avatar_url !== undefined) {
      updateData.avatar_url = avatar_url;
    }

    // Update interests (if you have an interests column in profiles table)
    // For now, we'll skip this as it might not exist in the schema

    // Update profile
    if (Object.keys(updateData).length > 0) {
      const { data: updatedProfile, error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }
    }

    // Follow users if provided
    if (follow_user_ids && Array.isArray(follow_user_ids) && follow_user_ids.length > 0) {
      const followPromises = follow_user_ids.map((targetUserId: string) => {
        return supabaseAdmin
          .from('follows')
          .upsert({
            follower_id: userId,
            following_id: targetUserId,
            created_at: new Date().toISOString(),
          }, {
            onConflict: 'follower_id,following_id',
          });
      });

      try {
        await Promise.all(followPromises);
      } catch (followError: any) {
        console.error('Error following users:', followError);
        // Don't throw - allow onboarding to complete even if follows fail
      }
    }

    return res.json({
      success: true,
      message: 'Onboarding completed successfully',
    });
  } catch (error) {
    return next(error);
  }
};