import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError } from '../utils/errors';

export const getNotifications = async (
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
    const unreadOnly = req.query.unread_only === 'true';
    const type = req.query.type as string;

    let query = supabaseAdmin
      .from('notifications')
      .select(`
        *,
        actor:profiles!actor_id(id, username, avatar_url)
      `, { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (unreadOnly) {
      query = query.eq('is_read', false);
    }

    if (type) {
      query = query.eq('type', type);
    }

    const { data: notifications, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get unread count
    const { count: unreadCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    res.json({
      success: true,
      notifications: notifications || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
      unread_count: unreadCount || 0,
    });
  } catch (error) {
    next(error);
  }
};

export const markAsRead = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if notification belongs to user
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !notification) {
      throw new NotFoundError('Notification');
    }

    if (notification.user_id !== req.user.id) {
      throw new ForbiddenError('Cannot mark notification as read');
    }

    const { data: updatedNotification, error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedNotification) {
      throw new NotFoundError('Notification');
    }

    res.json({
      success: true,
      notification: updatedNotification,
    });
  } catch (error) {
    next(error);
  }
};

export const markAllAsRead = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false)
      .select();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'All notifications marked as read',
      updated_count: data?.length || 0,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteNotification = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if notification belongs to user
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !notification) {
      throw new NotFoundError('Notification');
    }

    if (notification.user_id !== req.user.id) {
      throw new ForbiddenError('Cannot delete notification');
    }

    const { error } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    next(error);
  }
};


