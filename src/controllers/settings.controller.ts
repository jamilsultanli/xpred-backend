import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { UnauthorizedError, ValidationError, ForbiddenError } from '../utils/errors';
import { z } from 'zod';

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string().min(8, 'Password must be at least 8 characters'),
});

const changeEmailSchema = z.object({
  new_email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export const changePassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { current_password, new_password } = changePasswordSchema.parse(req.body);

    // Verify current password
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: req.user.email,
      password: current_password,
    });

    if (authError || !authData.user) {
      throw new ValidationError('Current password is incorrect');
    }

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      req.user.id,
      { password: new_password }
    );

    if (updateError) {
      throw new ValidationError(updateError.message || 'Failed to update password');
    }

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const changeEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    // Store user in a constant so TypeScript knows it's defined
    const user = req.user;

    const { new_email, password } = changeEmailSchema.parse(req.body);

    // Verify password
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: user.email,
      password,
    });

    if (authError || !authData.user) {
      throw new ValidationError('Password is incorrect');
    }

    // Check if email is already in use
    const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
    const emailExists = existingUser?.users.some(u => u.email === new_email && u.id !== user.id);

    if (emailExists) {
      throw new ValidationError('Email is already in use');
    }

    // Update email (requires email confirmation)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      { email: new_email }
    );

    if (updateError) {
      throw new ValidationError(updateError.message || 'Failed to update email');
    }

    // Update profile email
    await supabaseAdmin
      .from('profiles')
      .update({ email: new_email })
      .eq('id', user.id);

    res.json({
      success: true,
      message: 'Email change request sent. Please check your new email for confirmation.',
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAccount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { password } = deleteAccountSchema.parse(req.body);

    // Verify password
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: req.user.email,
      password,
    });

    if (authError || !authData.user) {
      throw new ValidationError('Password is incorrect');
    }

    // Delete user account (soft delete by marking as banned and clearing data)
    // For hard delete, use: await supabaseAdmin.auth.admin.deleteUser(req.user.id);
    
    // Soft delete approach - mark as banned and clear sensitive data
    await supabaseAdmin
      .from('profiles')
      .update({
        is_banned: true,
        email: `deleted_${Date.now()}@deleted.local`,
        username: `deleted_${req.user.id.substring(0, 8)}`,
        full_name: 'Deleted User',
        bio: null,
        avatar_url: null,
      })
      .eq('id', req.user.id);

    // Delete auth user
    await supabaseAdmin.auth.admin.deleteUser(req.user.id);

    res.json({
      success: true,
      message: 'Account deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getNotificationSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('notification_preferences')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      throw new ValidationError('User profile not found');
    }

    // Default preferences if not set
    const defaultPreferences = {
      likes: true,
      comments: true,
      reposts: true,
      follows: true,
      wins: true,
      mentions: true,
    };

    const preferences = profile.notification_preferences || defaultPreferences;

    res.json({
      success: true,
      settings: {
        ...defaultPreferences,
        ...preferences,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateNotificationSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const updates = req.body;

    // Get current preferences
    const { data: profile, error: fetchError } = await supabaseAdmin
      .from('profiles')
      .select('notification_preferences')
      .eq('id', req.user.id)
      .single();

    if (fetchError || !profile) {
      throw new ValidationError('User profile not found');
    }

    // Merge with existing preferences
    const currentPreferences = profile.notification_preferences || {};
    const newPreferences = {
      ...currentPreferences,
      ...updates,
    };

    // Update preferences
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ notification_preferences: newPreferences })
      .eq('id', req.user.id);

    if (updateError) {
      throw new ValidationError('Failed to update notification settings');
    }

    res.json({
      success: true,
      message: 'Notification settings updated',
      settings: newPreferences,
    });
  } catch (error) {
    next(error);
  }
};

