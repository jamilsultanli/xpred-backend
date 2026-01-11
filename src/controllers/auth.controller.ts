import { Request, Response, NextFunction } from 'express';
import { supabase, supabaseAdmin } from '../config/supabase';
import { ConflictError, UnauthorizedError, ValidationError } from '../utils/errors';
import { CreateUserDto, LoginDto } from '../models/user.types';
import { createUserProfile } from '../utils/profile-helper';

export const register = async (
  req: Request<{}, {}, CreateUserDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password, full_name, username } = req.body;

    // Check if username is already taken
    if (username) {
      const { data: existingUser } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .single();

      if (existingUser) {
        throw new ConflictError('Username already taken');
      }
    }

    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: full_name || email.split('@')[0],
          username: username || email.split('@')[0],
        },
      },
    });

    if (authError) {
      if (authError.message.includes('already registered')) {
        throw new ConflictError('Email already registered');
      }
      throw new ValidationError(authError.message);
    }

    if (!authData.user) {
      throw new ValidationError('Failed to create user');
    }

    // Get the created profile (trigger should have created it)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    if (profileError || !profile) {
      throw new ValidationError('Failed to create user profile');
    }

    // Update username if provided
    if (username && profile.username !== username) {
      await supabaseAdmin
        .from('profiles')
        .update({ username })
        .eq('id', authData.user.id);
      profile.username = username;
    }

    // Generate session token
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError || !sessionData.session) {
      console.error('[AUTH] Session creation failed:', sessionError);
      // If user was created but session failed, provide helpful error
      if (sessionError?.message.includes('Email not confirmed')) {
        throw new ValidationError('Please check your email to confirm your account before signing in');
      }
      throw new ValidationError(sessionError?.message || 'Failed to create session. Please try logging in.');
    }

    res.status(201).json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        username: profile.username,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        balance_xp: profile.balance_xp,
        balance_xc: profile.balance_xc,
        is_verified: profile.is_verified,
        role: profile.role,
        created_at: profile.created_at,
      },
      token: sessionData.session.access_token,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (
  req: Request<{}, {}, LoginDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;

    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user || !authData.session) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Get user profile
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .single();

    // If profile doesn't exist, create it (in case trigger didn't run)
    if (profileError || !profile) {
      console.log('[AUTH CONTROLLER] Profile not found, attempting to create for user:', authData.user.id);
      try {
        const result = await createUserProfile(
          authData.user.id,
          authData.user.email || '',
          authData.user.user_metadata
        );
        
        if (result.success && result.profile) {
          // Use the profile returned directly
          const createdProfile = result.profile;
          
          if (createdProfile && (createdProfile.id || (createdProfile as any).id)) {
            console.log('[AUTH CONTROLLER] Profile created successfully for user:', authData.user.id);
            // If it's already a full profile object, use it; otherwise fetch it
            if (createdProfile.username !== undefined || (createdProfile as any).username !== undefined) {
              profile = createdProfile as any;
            } else {
              // Fetch the full profile if needed
              const { data: fetchedProfile, error: fetchError } = await supabaseAdmin
                .from('profiles')
                .select('*')
                .eq('id', authData.user.id)
                .single();
              
              if (fetchError || !fetchedProfile) {
                throw new Error(`Profile was created but could not be retrieved: ${fetchError?.message || 'Not found'}`);
              }
              
              profile = fetchedProfile;
            }
          } else {
            throw new Error('Profile was created but has invalid format');
          }
        } else {
          throw new Error('Profile creation returned unsuccessful result');
        }
      } catch (createError: any) {
        console.error('[AUTH CONTROLLER] Failed to create profile during login:', {
          error: createError,
          message: createError?.message,
          userId: authData.user.id,
        });
        throw new UnauthorizedError(`User profile not found and could not be created: ${createError?.message || 'Unknown error'}`);
      }
    }

    // Check if user is banned
    if (profile.is_banned) {
      throw new UnauthorizedError('Account is banned');
    }

    res.json({
      success: true,
      user: {
        id: profile.id,
        email: profile.email,
        username: profile.username,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        bio: profile.bio,
        city: profile.city,
        country: profile.country,
        website: profile.website,
        balance_xp: profile.balance_xp,
        balance_xc: profile.balance_xc,
        is_verified: profile.is_verified,
        role: profile.role,
        created_at: profile.created_at,
      },
      token: authData.session.access_token,
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // Sign out using admin API - invalidate the session
      try {
        await supabaseAdmin.auth.admin.signOut(token, 'global');
      } catch (err) {
        // Ignore errors - token might already be invalid
        console.log('Sign out error (ignored):', err);
      }
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      throw new ValidationError('Refresh token is required');
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    res.json({
      success: true,
      token: data.session.access_token,
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    if (!email) {
      throw new ValidationError('Email is required');
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password`,
    });

    if (error) {
      // Don't reveal if email exists or not for security
      console.error('Password reset error:', error);
    }

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account exists, a password reset email has been sent',
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      throw new ValidationError('Token and new password are required');
    }

    if (new_password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const { error } = await supabaseAdmin.auth.updateUser({
      password: new_password,
    });

    if (error) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    next(error);
  }
};


