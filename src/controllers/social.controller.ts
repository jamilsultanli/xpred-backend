import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';

export const followUser = async (
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { userId } = req.params;

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social.controller.ts:15',message:'followUser entry',data:{userId,isUUID:userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)?true:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Check if userId is a UUID or username - try username first (more common)
    let targetUser;
    let userError;
    
    // Try as username first (most common case)
    const usernameResult = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .eq('username', userId)
      .single();

    if (usernameResult.data) {
      targetUser = usernameResult.data;
    } else {
      // Try as UUID
      const uuidResult = await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .eq('id', userId)
        .single();
      
      targetUser = uuidResult.data;
      userError = uuidResult.error;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social.controller.ts:35',message:'user lookup result',data:{hasTargetUser:!!targetUser,userError:userError?.message||null,targetUserId:targetUser?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!targetUser) {
      throw new NotFoundError('User');
    }

    const targetUserId = targetUser.id;

    // Check if already following
    if (targetUserId === req.user.id) {
      throw new ConflictError('Cannot follow yourself', 'CANNOT_FOLLOW_SELF');
    }

    const { data: existingFollow } = await supabaseAdmin
      .from('follows')
      .select('*')
      .eq('follower_id', req.user.id)
      .eq('following_id', targetUserId)
      .maybeSingle();

    if (existingFollow) {
      throw new ConflictError('Already following this user', 'ALREADY_FOLLOWING');
    }

    // Create follow relationship
    const { error } = await supabaseAdmin
      .from('follows')
      .insert({
        follower_id: req.user.id,
        following_id: targetUserId,
      });

    if (error) {
      throw new ConflictError('Failed to follow user');
    }

    // Create notification
    await supabaseAdmin.from('notifications').insert({
      user_id: targetUserId,
      actor_id: req.user.id,
      type: 'follow',
    });

    res.json({
      success: true,
      message: 'Now following user',
      following: true,
    });
  } catch (error) {
    next(error);
  }
};

export const unfollowUser = async (
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { userId } = req.params;

    // Check if userId is a UUID or username - try username first
    let targetUser;
    
    // Try as username first
    const usernameResult = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .eq('username', userId)
      .single();

    if (usernameResult.data) {
      targetUser = usernameResult.data;
    } else {
      // Try as UUID
      const uuidResult = await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .eq('id', userId)
        .single();
      
      targetUser = uuidResult.data;
    }

    if (!targetUser) {
      throw new NotFoundError('User');
    }

    const targetUserId = targetUser.id;

    // Check if follow relationship exists
    const { data: follow, error: followError } = await supabaseAdmin
      .from('follows')
      .select('*')
      .eq('follower_id', req.user.id)
      .eq('following_id', targetUserId)
      .maybeSingle();

    if (followError || !follow) {
      throw new NotFoundError('Follow relationship');
    }

    // Delete follow relationship
    const { error } = await supabaseAdmin
      .from('follows')
      .delete()
      .eq('follower_id', req.user.id)
      .eq('following_id', targetUserId);

    if (error) {
      throw new ConflictError('Failed to unfollow user');
    }

    res.json({
      success: true,
      message: 'Unfollowed user',
      following: false,
    });
  } catch (error) {
    next(error);
  }
};

export const getFollowStatus = async (
  req: Request<{ userId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { userId } = req.params;

    // Check if userId is a UUID or username - try username first
    let targetUser;
    
    // Try as username first
    const usernameResult = await supabaseAdmin
      .from('profiles')
      .select('id, username')
      .eq('username', userId)
      .single();

    if (usernameResult.data) {
      targetUser = usernameResult.data;
    } else {
      // Try as UUID
      const uuidResult = await supabaseAdmin
        .from('profiles')
        .select('id, username')
        .eq('id', userId)
        .single();
      
      targetUser = uuidResult.data;
    }

    if (!targetUser) {
      throw new NotFoundError('User');
    }

    const targetUserId = targetUser.id;

    const { data: follow } = await supabaseAdmin
      .from('follows')
      .select('*')
      .eq('follower_id', req.user.id)
      .eq('following_id', targetUserId)
      .maybeSingle();

    res.json({
      success: true,
      following: !!follow,
    });
  } catch (error) {
    next(error);
  }
};


