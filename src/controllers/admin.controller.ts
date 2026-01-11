import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { requireAdmin } from '../middleware/auth';

// Dashboard Stats
export const getDashboardStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const [
      usersCount,
      activeUsers24h,
      newUsersToday,
      bannedUsers,
      predictionsCount,
      activePredictions,
      resolvedPredictions,
      pendingResolution,
      betsCount,
      betsToday,
      reportsCount,
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      // Active users in last 24h (users created or updated in last 24h)
      supabaseAdmin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      supabaseAdmin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'),
      supabaseAdmin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_banned', true),
      supabaseAdmin.from('predictions').select('*', { count: 'exact', head: true }),
      supabaseAdmin
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', false),
      supabaseAdmin
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', true),
      // Pending resolutions from resolution queue
      supabaseAdmin
        .from('prediction_resolution_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabaseAdmin.from('bets').select('*', { count: 'exact', head: true }),
      supabaseAdmin
        .from('bets')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0] + 'T00:00:00.000Z'),
      supabaseAdmin
        .from('reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
    ]);

    // Calculate volume
    const { data: allBets } = await supabaseAdmin
      .from('bets')
      .select('amount, currency');

    const totalVolumeXP = (allBets || [])
      .filter((b: any) => b.currency === 'XP')
      .reduce((sum: number, b: any) => sum + (b.amount || 0), 0);
    const totalVolumeXC = (allBets || [])
      .filter((b: any) => b.currency === 'XC')
      .reduce((sum: number, b: any) => sum + (b.amount || 0), 0);

    // Get KYC and Support counts
    const [kycPending, supportOpen] = await Promise.all([
      supabaseAdmin
        .from('verification_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabaseAdmin
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['open', 'in_progress']),
    ]);

    res.json({
      success: true,
      // Flat structure for frontend compatibility
      total_users: usersCount.count || 0,
      active_users_24h: activeUsers24h.count || 0,
      new_users_today: newUsersToday.count || 0,
      banned_users: bannedUsers.count || 0,
      total_predictions: predictionsCount.count || 0,
      active_predictions: activePredictions.count || 0,
      resolved_predictions: resolvedPredictions.count || 0,
      pending_resolution: pendingResolution.count || 0,
      total_bets: betsCount.count || 0,
      bets_today: betsToday.count || 0,
      total_volume_xp: totalVolumeXP,
      total_volume_xc: totalVolumeXC,
      revenue_total_xp: totalVolumeXP * 0.05, // 5% platform fee estimate
      revenue_total_xc: totalVolumeXC * 0.05,
      revenue_today_xp: (betsToday.count || 0) * 100 * 0.05, // Rough estimate
      revenue_today_xc: 0,
      pending_reports: reportsCount.count || 0,
      pending_kyc: kycPending.count || 0,
      open_support_tickets: supportOpen.count || 0,
      // Keep nested structure for backward compatibility
      users: {
        total: usersCount.count || 0,
        active_24h: activeUsers24h.count || 0,
        new_today: newUsersToday.count || 0,
        banned: bannedUsers.count || 0,
      },
      predictions: {
        total: predictionsCount.count || 0,
        active: activePredictions.count || 0,
        resolved: resolvedPredictions.count || 0,
        pending_resolution: pendingResolution.count || 0,
      },
      bets: {
        total: betsCount.count || 0,
        today: betsToday.count || 0,
        total_volume_xp: totalVolumeXP,
        total_volume_xc: totalVolumeXC,
      },
      revenue: {
        total_xp: totalVolumeXP * 0.05,
        total_xc: totalVolumeXC * 0.05,
        today_xp: (betsToday.count || 0) * 100 * 0.05,
        today_xc: 0,
      },
      reports: {
        pending: reportsCount.count || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

// User Management
export const getUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string;
    const role = req.query.role as string;
    const status = (req.query.status as string) || 'all';
    const sort = (req.query.sort as string) || 'newest';

    let query = supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact' });

    if (search) {
      query = query.or(`username.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (role) {
      query = query.eq('role', role);
    }

    if (status === 'active') {
      query = query.eq('is_banned', false);
    } else if (status === 'banned') {
      query = query.eq('is_banned', true);
    }

    if (sort === 'newest') {
      query = query.order('created_at', { ascending: false });
    } else if (sort === 'oldest') {
      query = query.order('created_at', { ascending: true });
    } else if (sort === 'balance') {
      query = query.order('balance_xp', { ascending: false });
    }

    query = query.range((page - 1) * limit, page * limit - 1);

    const { data: users, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      users: users || [],
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

export const getUserDetails = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !user) {
      throw new NotFoundError('User');
    }

    // Get activity stats
    const [predictionsCount, betsCount, totalWagered, totalWon] = await Promise.all([
      supabaseAdmin
        .from('predictions')
        .select('*', { count: 'exact', head: true })
        .eq('creator_id', id),
      supabaseAdmin
        .from('bets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', id),
      supabaseAdmin
        .from('bets')
        .select('amount')
        .eq('user_id', id),
      supabaseAdmin
        .from('bets')
        .select('amount, prediction:predictions!prediction_id(is_resolved, outcome)')
        .eq('user_id', id),
    ]);

    const wagered = (totalWagered.data || []).reduce((sum: number, b: any) => sum + b.amount, 0);
    const won = (totalWon.data || []).filter((b: any) => 
      b.prediction?.is_resolved && b.prediction.outcome === (b.choice === 'yes')
    ).reduce((sum: number, b: any) => sum + b.amount * 1.5, 0); // Rough estimate

    res.json({
      success: true,
      user,
      activity: {
        predictions_created: predictionsCount.count || 0,
        bets_placed: betsCount.count || 0,
        total_wagered: wagered,
        total_won: won,
        last_login: null, // Would need to track this separately
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: Request<{ id: string }, {}, any>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate allowed fields
    const allowedFields = ['role', 'is_banned', 'balance_xp', 'balance_xc', 'is_verified'];
    const updateData: any = {};

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No valid fields to update');
    }

    const { data: updatedUser, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedUser) {
      throw new NotFoundError('User');
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'update_user',
      details: `Updated user ${id}: ${JSON.stringify(updateData)}`,
    });

    res.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

export const banUser = async (
  req: Request<{ id: string }, {}, { reason?: string; duration_days?: number }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { reason, duration_days } = req.body;

    const { data: user, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('is_banned')
      .eq('id', id)
      .single();

    if (fetchError || !user) {
      throw new NotFoundError('User');
    }

    await supabaseAdmin
      .from('profiles')
      .update({ is_banned: true })
      .eq('id', id);

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'ban_user',
      details: `Banned user ${id}. Reason: ${reason || 'N/A'}. Duration: ${duration_days ? `${duration_days} days` : 'Permanent'}`,
    });

    // Get updated user
    const { data: updatedUser } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

    res.json({
      success: true,
      message: 'User banned',
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

export const addFunds = async (
  req: Request<{ id: string }, {}, { amount: number; currency: 'XP' | 'XC'; reason?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { amount, currency, reason } = req.body;

    if (amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(`balance_${currency.toLowerCase()}`)
      .eq('id', id)
      .single();

    if (!profile) {
      throw new NotFoundError('User profile');
    }

    const balanceField = currency === 'XP' ? 'balance_xp' : 'balance_xc';
    const newBalance = ((profile as any)[balanceField] || 0) + amount;

    await supabaseAdmin
      .from('profiles')
      .update({ [balanceField]: newBalance })
      .eq('id', id);

    // Create transaction record
    await supabaseAdmin.from('transactions').insert({
      user_id: id,
      amount: amount,
      currency: currency,
      type: 'bonus',
      description: reason || `Admin added funds`,
    });

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'add_funds',
      details: `Added ${amount} ${currency} to user ${id}. Reason: ${reason || 'N/A'}`,
    });

    res.json({
      success: true,
      message: 'Funds added',
      transaction: {
        amount,
        currency,
        new_balance: newBalance,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Prediction Management
export const getPredictions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string;
    const category = req.query.category as string;
    const search = req.query.search as string;

    let query = supabaseAdmin
      .from('predictions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status === 'active') {
      query = query.eq('is_resolved', false);
    } else if (status === 'resolved') {
      query = query.eq('is_resolved', true);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`question.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: predictions, error, count } = await query;

    if (error) {
      throw error;
    }

    // Fetch creator profiles
    const creatorIds = [...new Set((predictions || []).map((p: any) => p.creator_id).filter(Boolean))];
    const { data: creators } = creatorIds.length > 0
      ? await supabaseAdmin
          .from('profiles')
          .select('id, username, full_name')
          .in('id', creatorIds)
      : { data: [] };

    const creatorsMap = new Map((creators || []).map((c: any) => [c.id, c]));

    // Map field names for frontend compatibility (total_pot_xp/xc -> total_pool_xp/xc)
    // and add creator profile
    const mappedPredictions = (predictions || []).map((pred: any) => ({
      ...pred,
      total_pool_xp: pred.total_pot_xp || 0,
      total_pool_xc: pred.total_pot_xc || 0,
      creator: pred.creator_id ? creatorsMap.get(pred.creator_id) : null,
    }));

    res.json({
      success: true,
      predictions: mappedPredictions,
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

export const updatePrediction = async (
  req: Request<{ id: string }, {}, { is_featured?: boolean; category?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const { data: updatedPrediction, error } = await supabaseAdmin
      .from('predictions')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedPrediction) {
      throw new NotFoundError('Prediction');
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'update_prediction',
      details: `Updated prediction ${id}: ${JSON.stringify(updates)}`,
    });

    res.json({
      success: true,
      prediction: updatedPrediction,
    });
  } catch (error) {
    next(error);
  }
};

export const forceResolvePrediction = async (
  req: Request<{ id: string }, {}, { outcome: boolean; reason?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { outcome, reason } = req.body;

    // Use RPC function to resolve
    const { data: resolveResult, error: resolveError } = await supabaseAdmin.rpc(
      'resolve_prediction',
      {
        p_prediction_id: id,
        p_outcome: outcome,
      }
    );

    if (resolveError) {
      throw new ValidationError(`Failed to resolve prediction: ${resolveError.message}`);
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'force_resolve_prediction',
      details: `Force resolved prediction ${id} to ${outcome ? 'YES' : 'NO'}. Reason: ${reason || 'Admin override'}`,
    });

    const { data: updatedPrediction } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('id', id)
      .single();

    res.json({
      success: true,
      message: 'Prediction resolved',
      prediction: updatedPrediction,
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
    const { id } = req.params;

    // Get all bets for refund
    const { data: bets } = await supabaseAdmin
      .from('bets')
      .select('user_id, amount, currency')
      .eq('prediction_id', id);

    // Refund all bets
    if (bets && bets.length > 0) {
      for (const bet of bets) {
        const balanceField = bet.currency === 'XP' ? 'balance_xp' : 'balance_xc';
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select(balanceField)
          .eq('id', bet.user_id)
          .single();

        if (profile) {
          await supabaseAdmin
            .from('profiles')
            .update({ [balanceField]: ((profile as any)[balanceField] || 0) + bet.amount })
            .eq('id', bet.user_id);

          // Create refund transaction
          await supabaseAdmin.from('transactions').insert({
            user_id: bet.user_id,
            amount: bet.amount,
            currency: bet.currency,
            type: 'deposit',
            description: `Refund for deleted prediction`,
          });
        }
      }
    }

    // Delete prediction (bets will cascade or be deleted)
    await supabaseAdmin.from('predictions').delete().eq('id', id);

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'delete_prediction',
      details: `Deleted prediction ${id} and refunded ${bets?.length || 0} bets`,
    });

    res.json({
      success: true,
      message: 'Prediction deleted and bets refunded',
      refunded_bets: bets?.length || 0,
    });
  } catch (error) {
    next(error);
  }
};

// KYC Management
export const getKYCRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = (req.query.status as string) || 'all';

    let query = supabaseAdmin
      .from('verification_requests')
      .select(`
        *,
        user:profiles!user_id(id, username, full_name, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: requests, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      requests: requests || [],
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

export const updateKYCStatus = async (
  req: Request<{ id: string }, {}, { decision: 'approved' | 'rejected'; admin_notes?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { decision, admin_notes } = req.body;

    // Get request
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('verification_requests')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !request) {
      throw new NotFoundError('Verification request');
    }

    // Update request
    await supabaseAdmin
      .from('verification_requests')
      .update({
        status: decision,
        admin_notes: admin_notes || null,
      })
      .eq('id', id);

    // If approved, update user profile
    if (decision === 'approved') {
      await supabaseAdmin
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', request.user_id);

      // Create notification
      await supabaseAdmin.from('notifications').insert({
        user_id: request.user_id,
        type: 'admin_message',
        message: 'Your KYC verification has been approved!',
      });
    } else {
      // Create notification for rejection
      await supabaseAdmin.from('notifications').insert({
        user_id: request.user_id,
        type: 'admin_message',
        message: `Your KYC verification was rejected. ${admin_notes ? `Reason: ${admin_notes}` : ''}`,
      });
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'kyc_decision',
      details: `${decision} KYC request ${id} for user ${request.user_id}`,
    });

    const { data: updatedRequest } = await supabaseAdmin
      .from('verification_requests')
      .select('*')
      .eq('id', id)
      .single();

    res.json({
      success: true,
      message: `KYC request ${decision}`,
      request: updatedRequest,
    });
  } catch (error) {
    next(error);
  }
};

// Support Management
export const getAllTickets = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string;
    const search = req.query.search as string;

    let query = supabaseAdmin
      .from('support_tickets')
      .select(`
        *,
        user:profiles!user_id(id, username, email)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`subject.ilike.%${search}%,message.ilike.%${search}%`);
    }

    const { data: tickets, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      tickets: tickets || [],
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

export const replyToTicket = async (
  req: Request<{ id: string }, {}, { admin_reply: string; status?: 'resolved' | 'in_progress' }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { admin_reply, status } = req.body;

    if (!admin_reply || admin_reply.trim().length === 0) {
      throw new ValidationError('Admin reply is required');
    }

    const { data: ticket, error: fetchError } = await supabaseAdmin
      .from('support_tickets')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !ticket) {
      throw new NotFoundError('Support ticket');
    }

    const updateData: any = {
      admin_reply: admin_reply.trim(),
    };

    if (status) {
      updateData.status = status;
    } else if (!status && (ticket as any).status === 'open') {
      updateData.status = 'in_progress';
    }

    const { data: updatedTicket, error } = await supabaseAdmin
      .from('support_tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedTicket) {
      throw new ValidationError('Failed to update ticket');
    }

    // Create notification for user
    await supabaseAdmin.from('notifications').insert({
      user_id: ticket.user_id,
      actor_id: req.user!.id,
      type: 'admin_message',
      message: `Support replied to your ticket: "${admin_reply.substring(0, 50)}..."`,
    });

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'reply_support_ticket',
      details: `Replied to ticket ${id}`,
    });

    res.json({
      success: true,
      ticket: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};

// Reports & Moderation
export const getReports = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = (req.query.status as string) || 'all';
    const type = req.query.type as string;

    let query = supabaseAdmin
      .from('reports')
      .select(`
        *,
        reporter:profiles!reporter_id(id, username),
        reported_user:profiles!reported_user_id(id, username)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    if (type && type !== 'all') {
      query = query.eq('type', type);
    }

    const { data: reports, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      reports: reports || [],
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

export const resolveReport = async (
  req: Request<{ id: string }, {}, { action: 'dismiss' | 'ban_user' | 'delete_content' | 'warn_user'; notes?: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;

    const { data: report, error: fetchError } = await supabaseAdmin
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !report) {
      throw new NotFoundError('Report');
    }

    // Perform action based on type
    if (action === 'ban_user' && report.type === 'user' && report.reported_user_id) {
      await supabaseAdmin
        .from('profiles')
        .update({ is_banned: true })
        .eq('id', report.reported_user_id);
    } else if (action === 'delete_content') {
      // Delete based on type
      if (report.type === 'prediction' && report.prediction_id) {
        await supabaseAdmin.from('predictions').delete().eq('id', report.prediction_id);
      }
    } else if (action === 'warn_user' && report.type === 'user' && report.reported_user_id) {
      // Create warning notification
      await supabaseAdmin.from('notifications').insert({
        user_id: report.reported_user_id,
        actor_id: req.user!.id,
        type: 'admin_message',
        message: `Warning: ${notes || 'Content violation'}`,
      });
    }

    // Update report status
    await supabaseAdmin
      .from('reports')
      .update({ status: 'resolved' })
      .eq('id', id);

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'resolve_report',
      details: `Resolved report ${id} with action: ${action}. Notes: ${notes || 'N/A'}`,
    });

    res.json({
      success: true,
      message: 'Report resolved',
      report: {
        ...report,
        status: 'resolved',
      },
    });
  } catch (error) {
    next(error);
  }
};

// System Settings
export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { data: settings, error } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .order('key');

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      settings: settings || [],
    });
  } catch (error) {
    next(error);
  }
};

export const updateSetting = async (
  req: Request<{ key: string }, {}, { value: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    const { data: setting, error: fetchError } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .eq('key', key)
      .single();

    if (fetchError || !setting) {
      throw new NotFoundError('Setting');
    }

    const { data: updatedSetting, error } = await supabaseAdmin
      .from('system_settings')
      .update({ value })
      .eq('key', key)
      .select()
      .single();

    if (error || !updatedSetting) {
      throw new ValidationError('Failed to update setting');
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'update_setting',
      details: `Changed ${key} from "${setting.value}" to "${value}"`,
    });

    res.json({
      success: true,
      setting: updatedSetting,
    });
  } catch (error) {
    next(error);
  }
};

// Broadcast
export const sendBroadcast = async (
  req: Request<{}, {}, { message: string; type?: string; set_banner?: boolean }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { message, type = 'info', set_banner = false } = req.body;

    if (!message || message.trim().length === 0) {
      throw new ValidationError('Message is required');
    }

    // Get all active users
    const { data: users } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('is_banned', false)
      .limit(10000); // Limit for safety

    if (users && users.length > 0) {
      // Create notifications for all users
      const notifications = users.map((u: any) => ({
        user_id: u.id,
        type: 'admin_message',
        message: message.trim(),
        created_at: new Date().toISOString(),
      }));

      // Batch insert (Supabase allows up to 1000 per batch)
      const batchSize = 1000;
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        await supabaseAdmin.from('notifications').insert(batch);
      }
    }

    // Set banner if requested
    if (set_banner) {
      await supabaseAdmin.from('system_settings').upsert({
        key: 'latest_broadcast',
        value: message.trim(),
        description: 'Current global announcement banner',
      });
    }

    // Log audit event
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'send_broadcast',
      details: `Sent broadcast to ${users?.length || 0} users`,
    });

    res.json({
      success: true,
      message: 'Broadcast sent to all users',
      notifications_sent: users?.length || 0,
    });
  } catch (error) {
    next(error);
  }
};

// Finance Analytics
export const getFinanceAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const period = (req.query.period as string) || '7d';
    const groupBy = (req.query.group_by as string) || 'day';

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    if (period === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(0); // All time
    }

    // Get transactions in period
    const { data: transactions } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .gte('created_at', startDate.toISOString());

    // Calculate stats
    const deposits = (transactions || []).filter((t: any) => t.type === 'deposit');
    const withdrawals = (transactions || []).filter((t: any) => t.type === 'withdrawal');
    const bets = (transactions || []).filter((t: any) => t.type === 'bet_placed');

    const totalDepositsXP = deposits
      .filter((t: any) => t.currency === 'XP')
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const totalDepositsXC = deposits
      .filter((t: any) => t.currency === 'XC')
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const totalWithdrawalsXP = withdrawals
      .filter((t: any) => t.currency === 'XP')
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const totalWithdrawalsXC = withdrawals
      .filter((t: any) => t.currency === 'XC')
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const totalBetsXP = bets
      .filter((t: any) => t.currency === 'XP')
      .reduce((sum: number, t: any) => sum + t.amount, 0);
    const totalBetsXC = bets
      .filter((t: any) => t.currency === 'XC')
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    // Platform fee estimate (5%)
    const platformFeeXP = totalBetsXP * 0.05;
    const platformFeeXC = totalBetsXC * 0.05;

    res.json({
      success: true,
      revenue: {
        total_xp: platformFeeXP,
        total_xc: platformFeeXC,
        period_xp: platformFeeXP,
        period_xc: platformFeeXC,
      },
      volume: {
        total_bets_xp: totalBetsXP,
        total_bets_xc: totalBetsXC,
        period_bets_xp: totalBetsXP,
        period_bets_xc: totalBetsXC,
      },
      transactions: {
        deposits: deposits.length,
        withdrawals: withdrawals.length,
        net_xp: totalDepositsXP - totalWithdrawalsXP,
        net_xc: totalDepositsXC - totalWithdrawalsXC,
      },
      trends: [], // Would need time-series data for trends
    });
  } catch (error) {
    next(error);
  }
};

// Audit Logs
export const getAuditLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const adminId = req.query.admin_id as string;
    const action = req.query.action as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    let query = supabaseAdmin
      .from('audit_logs')
      .select(`
        *,
        admin:profiles!admin_id(id, username)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (adminId) {
      query = query.eq('admin_id', adminId);
    }

    if (action) {
      query = query.ilike('action', `%${action}%`);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: logs, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      logs: logs || [],
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

// =====================================================
// NEW ADMIN CONTROLLER METHODS
// =====================================================

// Get My Permissions
export const getMyPermissions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        username,
        email,
        role,
        admin_role_id,
        admin_role:admin_roles(
          id,
          name,
          display_name,
          description,
          level
        )
      `)
      .eq('id', req.user.id)
      .single();

    if (!profile || !(profile as any).admin_role_id) {
      throw new ForbiddenError('User is not an admin');
    }

    // Get permissions for this role
    const { data: permissions } = await supabaseAdmin
      .from('admin_permissions')
      .select('*')
      .eq('role_id', (profile as any).admin_role_id);

    res.json({
      success: true,
      user: {
        id: profile.id,
        username: (profile as any).username,
        email: profile.email,
        role: (profile as any).admin_role,
      },
      permissions: permissions || [],
    });
  } catch (error) {
    next(error);
  }
};

// Get All Admin Users
export const getAdmins = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { data: admins, error } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        username,
        full_name,
        email,
        role,
        admin_role_id,
        created_at,
        admin_role:admin_roles(
          id,
          name,
          display_name,
          level
        )
      `)
      .not('admin_role_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      admins: admins || [],
    });
  } catch (error) {
    next(error);
  }
};

// Promote User to Admin
export const promoteToAdmin = async (
  req: Request<{ userId: string }, {}, { role_name: string; reason?: string }>,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = req.params;
    const { role_name, reason } = req.body;

    // Get target role
    const { data: targetRole, error: roleError } = await supabaseAdmin
      .from('admin_roles')
      .select('id, name, display_name, level')
      .eq('name', role_name)
      .single();

    if (roleError || !targetRole) {
      throw new ValidationError('Invalid admin role');
    }

    // Get user
    const { data: user, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, email, role, admin_role_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new NotFoundError('User');
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: targetRole.level <= 2 ? 'admin' : 'moderator',
        admin_role_id: targetRole.id,
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError || !updatedUser) {
      throw new ValidationError('Failed to promote user');
    }

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'promote_to_admin',
      resource_type: 'user',
      resource_id: userId,
      details: {
        role: targetRole.name,
        reason: reason || 'No reason provided',
      },
    });

    // Notify user
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      actor_id: req.user!.id,
      type: 'admin_message',
      message: `You have been promoted to ${targetRole.display_name}!`,
    });

    res.json({
      success: true,
      message: 'User promoted to admin',
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// Demote Admin
export const demoteAdmin = async (
  req: Request<{ userId: string }, {}, { reason?: string }>,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    // Get user
    const { data: user, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, admin_role_id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      throw new NotFoundError('User');
    }

    if (!(user as any).admin_role_id) {
      throw new ValidationError('User is not an admin');
    }

    // Update user - remove admin access
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: 'user',
        admin_role_id: null,
      })
      .eq('id', userId)
      .select()
      .single();

    if (updateError || !updatedUser) {
      throw new ValidationError('Failed to demote admin');
    }

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'demote_admin',
      resource_type: 'user',
      resource_id: userId,
      details: {
        reason: reason || 'No reason provided',
      },
    });

    // Notify user
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      actor_id: req.user!.id,
      type: 'admin_message',
      message: 'Your admin access has been revoked.',
    });

    res.json({
      success: true,
      message: 'Admin access removed',
      user: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// Get Resolution Queue
export const getResolutionQueue = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = (req.query.status as string) || 'pending';
    const category = req.query.category as string;

    let query = supabaseAdmin
      .from('prediction_resolution_queue')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: resolutions, error, count } = await query;

    if (error) {
      console.error('[ADMIN] Resolution queue query error:', error);
      throw error;
    }

    // Fetch related data separately to avoid relationship issues
    const resolutionIds = (resolutions || []).map((r: any) => r.id);
    const predictionIds = [...new Set((resolutions || []).map((r: any) => r.prediction_id).filter(Boolean))];
    const userIds = [
      ...new Set([
        ...(resolutions || []).map((r: any) => r.submitted_by).filter(Boolean),
        ...(resolutions || []).map((r: any) => r.reviewed_by).filter(Boolean),
      ])
    ];

    const [predictionsData, profilesData] = await Promise.all([
      predictionIds.length > 0
        ? supabaseAdmin
            .from('predictions')
            .select('id, question, description, category, deadline, creator_id')
            .in('id', predictionIds)
        : { data: [] },
      userIds.length > 0
        ? supabaseAdmin
            .from('profiles')
            .select('id, username, full_name')
            .in('id', userIds)
        : { data: [] },
    ]);

    // Create lookup maps
    const predictionsMap = new Map((predictionsData.data || []).map((p: any) => [p.id, p]));
    const profilesMap = new Map((profilesData.data || []).map((p: any) => [p.id, p]));

    // Transform the data to match frontend expectations
    let transformedResolutions = (resolutions || []).map((r: any) => ({
      ...r,
      prediction: r.prediction_id ? predictionsMap.get(r.prediction_id) : null,
      submitter: r.submitted_by ? profilesMap.get(r.submitted_by) : null,
      reviewer: r.reviewed_by ? profilesMap.get(r.reviewed_by) : null,
    }));

    // Filter by category if provided
    if (category) {
      transformedResolutions = transformedResolutions.filter((r: any) => r.prediction?.category === category);
    }

    res.json({
      success: true,
      resolutions: transformedResolutions,
      pagination: {
        page,
        limit,
        total: category ? transformedResolutions.length : (count || 0),
        pages: category ? Math.ceil(transformedResolutions.length / limit) : Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Review Resolution
export const reviewResolution = async (
  req: Request<{ id: string }, {}, { decision: 'approved' | 'rejected'; admin_notes?: string; rejection_reason?: string }>,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id } = req.params;
    const { decision, admin_notes, rejection_reason } = req.body;

    // Get resolution
    const { data: resolution, error: fetchError } = await supabaseAdmin
      .from('prediction_resolution_queue')
      .select('*, prediction:predictions(id, question)')
      .eq('id', id)
      .single();

    if (fetchError || !resolution) {
      throw new NotFoundError('Resolution submission');
    }

    // Update resolution status
    const { error: updateError } = await supabaseAdmin
      .from('prediction_resolution_queue')
      .update({
        status: decision,
        reviewed_by: req.user!.id,
        reviewed_at: new Date().toISOString(),
        admin_notes,
        rejection_reason: decision === 'rejected' ? rejection_reason : null,
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // If approved, resolve the prediction
    if (decision === 'approved') {
      const { error: resolveError } = await supabaseAdmin.rpc('resolve_prediction', {
        p_prediction_id: (resolution as any).prediction_id,
        p_outcome: (resolution as any).proposed_outcome,
      });

      if (resolveError) {
        throw new ValidationError(`Failed to resolve prediction: ${resolveError.message}`);
      }
    }

    // Notify submitter
    await supabaseAdmin.from('notifications').insert({
      user_id: (resolution as any).submitted_by,
      actor_id: req.user!.id,
      type: 'admin_message',
      message: decision === 'approved'
        ? 'Your prediction resolution submission has been approved!'
        : `Your resolution submission was rejected. ${rejection_reason || ''}`,
    });

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'review_resolution',
      resource_type: 'resolution',
      resource_id: id,
      details: {
        decision,
        prediction_id: (resolution as any).prediction_id,
        outcome: (resolution as any).proposed_outcome,
      },
    });

    res.json({
      success: true,
      message: `Resolution ${decision}`,
    });
  } catch (error) {
    next(error);
  }
};

// Add User Note
export const addUserNote = async (
  req: Request<{ id: string }, {}, { note: string; type?: string; is_visible_to_user?: boolean }>,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id: userId } = req.params;
    const { note, type = 'note', is_visible_to_user = false } = req.body;

    if (!note || note.trim().length === 0) {
      throw new ValidationError('Note is required');
    }

    const { data: newNote, error } = await supabaseAdmin
      .from('admin_user_notes')
      .insert({
        user_id: userId,
        admin_id: req.user!.id,
        note: note.trim(),
        type,
        is_visible_to_user,
      })
      .select(`
        *,
        admin:profiles!admin_id(id, username)
      `)
      .single();

    if (error || !newNote) {
      throw new ValidationError('Failed to add note');
    }

    // Log audit
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: req.user!.id,
      action: 'add_user_note',
      resource_type: 'user',
      resource_id: userId,
      details: { type, note_id: newNote.id },
    });

    res.json({
      success: true,
      note: newNote,
    });
  } catch (error) {
    next(error);
  }
};

// Get User Notes
export const getUserNotes = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const { id: userId } = req.params;

    const { data: notes, error } = await supabaseAdmin
      .from('admin_user_notes')
      .select(`
        *,
        admin:profiles!admin_id(id, username, full_name)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      notes: notes || [],
    });
  } catch (error) {
    next(error);
  }
};

// Get Dashboard Charts
export const getDashboardCharts = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const period = (req.query.period as string) || '7d';
    
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    if (period === '24h') {
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === '7d') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === '30d') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    // User growth
    const { data: userGrowth } = await supabaseAdmin
      .from('profiles')
      .select('created_at')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    // Bet volume
    const { data: bets } = await supabaseAdmin
      .from('bets')
      .select('created_at, amount, currency')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    // Group data by day
    const groupByDay = (data: any[], dateField: string, valueField?: string) => {
      const grouped: { [key: string]: number } = {};
      
      data.forEach(item => {
        const date = new Date(item[dateField]).toISOString().split('T')[0];
        if (!grouped[date]) grouped[date] = 0;
        grouped[date] += valueField ? (item[valueField] || 1) : 1;
      });
      
      return Object.keys(grouped).sort().map(date => ({
        date,
        value: grouped[date],
      }));
    };

    res.json({
      success: true,
      charts: {
        user_growth: groupByDay(userGrowth || [], 'created_at'),
        bet_volume_xp: groupByDay((bets || []).filter(b => b.currency === 'XP'), 'created_at', 'amount'),
        bet_volume_xc: groupByDay((bets || []).filter(b => b.currency === 'XC'), 'created_at', 'amount'),
        bet_count: groupByDay(bets || [], 'created_at'),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get Top Users
export const getTopUsers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const metric = (req.query.metric as string) || 'balance_xp';
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    let orderBy: string;
    switch (metric) {
      case 'balance_xp':
        orderBy = 'balance_xp';
        break;
      case 'balance_xc':
        orderBy = 'balance_xc';
        break;
      case 'predictions':
        // Need to count predictions separately
        const { data: topPredictors } = await supabaseAdmin
          .rpc('get_top_predictors', { limit_count: limit });
        return res.json({
          success: true,
          users: topPredictors || [],
        });
      default:
        orderBy = 'balance_xp';
    }

    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('id, username, full_name, avatar_url, balance_xp, balance_xc, created_at')
      .order(orderBy, { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json({
      success: true,
      users: users || [],
    });
  } catch (error) {
    next(error);
  }
};

// Get Recent Activity
export const getRecentActivity = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Get recent predictions, bets, and users
    const [predictions, bets, users] = await Promise.all([
      supabaseAdmin
        .from('predictions')
        .select('id, question, created_at, creator:profiles!creator_id(username)')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('bets')
        .select('id, amount, currency, created_at, user:profiles!user_id(username), prediction:predictions(question)')
        .order('created_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('profiles')
        .select('id, username, full_name, created_at')
        .order('created_at', { ascending: false})
        .limit(limit),
    ]);

    // Combine and sort by date
    const activities = [
      ...(predictions.data || []).map(p => ({
        type: 'prediction_created',
        data: p,
        created_at: p.created_at,
      })),
      ...(bets.data || []).map(b => ({
        type: 'bet_placed',
        data: b,
        created_at: b.created_at,
      })),
      ...(users.data || []).map(u => ({
        type: 'user_joined',
        data: u,
        created_at: u.created_at,
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);

    res.json({
      success: true,
      activity: activities,
    });
  } catch (error) {
    next(error);
  }
};


