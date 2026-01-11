import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { UnauthorizedError, ForbiddenError, UserBannedError } from '../utils/errors';
import { createUserProfile } from '../utils/profile-helper';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        is_banned: boolean;
        admin_role_id?: string;
      };
    }
  }
}

export const authenticateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[AUTH] No authorization header or invalid format');
      throw new UnauthorizedError();
    }

    const token = authHeader.substring(7);
    
    if (!token || token.length === 0) {
      console.log('[AUTH] Token is empty');
      throw new UnauthorizedError('Token is empty');
    }

    // Verify token with Supabase
    // Use getUser() which accepts the access token directly
    const { data: { user }, error: tokenError } = await supabaseAdmin.auth.getUser(token);

    if (tokenError) {
      console.error('[AUTH] Token verification error:', {
        message: tokenError.message,
        status: tokenError.status,
        name: tokenError.name,
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...',
      });
      throw new UnauthorizedError(`Invalid or expired token: ${tokenError.message}`);
    }

    if (!user) {
      console.error('[AUTH] No user returned from token verification');
      throw new UnauthorizedError('Invalid or expired token');
    }

    console.log('[AUTH] Token verified successfully for user:', user.id, user.email);

    // Get user profile to check role and ban status
    let { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, is_banned, admin_role_id')
      .eq('id', user.id)
      .single();

    // If profile doesn't exist, create it (in case trigger didn't run)
    if (profileError || !profile) {
      console.log('[AUTH] Profile not found, attempting to create for user:', user.id);
      try {
        const result = await createUserProfile(
          user.id,
          user.email || '',
          user.user_metadata
        );
        
        if (result.success && result.profile) {
          // Use the profile returned directly
          const createdProfile = result.profile;
          
          console.log('[AUTH] Profile creation result:', {
            hasId: !!(createdProfile.id || (createdProfile as any).id),
            hasEmail: !!(createdProfile.email || (createdProfile as any).email),
            hasRole: !!(createdProfile.role || (createdProfile as any).role),
            profileKeys: Object.keys(createdProfile),
          });
          
          // Extract required fields from the profile
          const profileId = createdProfile.id || (createdProfile as any).id;
          const profileEmail = createdProfile.email || (createdProfile as any).email;
          const profileRole = createdProfile.role || (createdProfile as any).role;
          const profileIsBanned = createdProfile.is_banned !== undefined 
            ? createdProfile.is_banned 
            : ((createdProfile as any).is_banned !== undefined ? (createdProfile as any).is_banned : false);
          
          if (profileId) {
            console.log('[AUTH] Profile created successfully for user:', user.id);
            profile = {
              id: profileId,
              email: profileEmail || user.email || '',
              role: profileRole || 'user',
              is_banned: profileIsBanned,
              admin_role_id: null,
            };
          } else {
            // If profile format is unexpected, try fetching it with a small delay
            console.log('[AUTH] Profile format unexpected, waiting and fetching...');
            await new Promise(resolve => setTimeout(resolve, 200)); // Wait for consistency
            
            const { data: fetchedProfile, error: fetchError } = await supabaseAdmin
              .from('profiles')
              .select('id, email, role, is_banned, admin_role_id')
              .eq('id', user.id)
              .single();
            
            if (fetchError || !fetchedProfile) {
              console.error('[AUTH] Failed to fetch created profile:', {
                error: fetchError,
                code: fetchError?.code,
                message: fetchError?.message,
                userId: user.id,
              });
              throw new Error(`Profile was created but could not be retrieved: ${fetchError?.message || 'Not found'}`);
            }
            
            console.log('[AUTH] Profile fetched successfully');
            profile = fetchedProfile;
          }
        } else {
          throw new Error('Profile creation returned unsuccessful result');
        }
      } catch (createError: any) {
        console.error('[AUTH] Failed to create profile:', {
          error: createError,
          message: createError?.message,
          userId: user.id,
        });
        throw new UnauthorizedError(`User profile not found and could not be created: ${createError?.message || 'Unknown error'}`);
      }
    } else {
      console.log('[AUTH] Profile found for user:', user.id);
    }

    // Check if user is banned
    if (profile && profile.is_banned) {
      throw new UserBannedError();
    }

    // Attach user to request
    if (profile) {
      req.user = {
        id: profile.id,
        email: profile.email || user.email || '',
        role: profile.role || 'user',
        is_banned: profile.is_banned || false,
        admin_role_id: (profile as any).admin_role_id || null,
      };
    }

    console.log('[AUTH] Authentication successful for user:', req.user?.id);
    next();
  } catch (error: any) {
    console.error('[AUTH] Authentication failed:', error.message || error);
    next(error);
  }
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new UnauthorizedError());
  }

  if (req.user.role !== 'admin') {
    return next(new ForbiddenError('Admin access required'));
  }

  next();
};

export const requireModerator = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(new UnauthorizedError());
  }

  if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
    return next(new ForbiddenError('Moderator access required'));
  }

  next();
};

/**
 * Check if user has specific permission for a resource
 * @param resource - Resource name (users, predictions, reports, etc)
 * @param action - Action type (read, create, update, delete, approve)
 */
export const requirePermission = (
  resource: string,
  action: 'read' | 'create' | 'update' | 'delete' | 'approve'
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError());
      }

      // TEMPORARY FIX: If user has role=admin but no admin_role_id, allow all permissions
      // This handles legacy admin users without proper admin_roles setup
      if (!req.user.admin_role_id) {
        if (req.user.role === 'admin') {
          console.log('[AUTH] Legacy admin user detected, granting full access');
          return next(); // Allow admin without admin_role_id
        }
        return next(new ForbiddenError('Admin access required'));
      }

      // Check if super admin (level 1) - bypass all permission checks
      const { data: role } = await supabaseAdmin
        .from('admin_roles')
        .select('level')
        .eq('id', req.user.admin_role_id)
        .single();

      if (role && role.level === 1) {
        // Super admin has all permissions
        return next();
      }

      // Check specific permission
      const { data: permission } = await supabaseAdmin
        .from('admin_permissions')
        .select('*')
        .eq('role_id', req.user.admin_role_id)
        .eq('resource', resource)
        .single();

      if (!permission) {
        return next(new ForbiddenError(`No access to resource: ${resource}`));
      }

      const actionColumn = `can_${action}`;
      if (!(permission as any)[actionColumn]) {
        return next(new ForbiddenError(`No ${action} permission for ${resource}`));
      }

      next();
    } catch (error: any) {
      console.error('[AUTH] Permission check failed:', error.message);
      next(new ForbiddenError(`Permission check failed: ${error.message}`));
    }
  };
};

/**
 * Log admin action to audit trail
 * @param adminId - Admin user ID
 * @param action - Action performed
 * @param resourceType - Type of resource affected
 * @param resourceId - ID of the resource affected
 * @param details - Additional details as JSON
 * @param req - Express request object for IP and user agent
 */
export const logAdminAction = async (
  adminId: string,
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: any,
  req?: Request
): Promise<void> => {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      admin_id: adminId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details ? JSON.stringify(details) : null,
      ip_address: req?.ip || req?.socket?.remoteAddress,
      user_agent: req?.headers['user-agent'],
    });
  } catch (error: any) {
    console.error('[AUDIT] Failed to log admin action:', {
      adminId,
      action,
      error: error.message,
    });
    // Don't throw error - audit logging failure shouldn't break the request
  }
};

/**
 * Middleware to automatically log admin actions
 * Captures the action from route and logs it
 */
export const autoLogAdminAction = (action: string, resourceType?: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Store original res.json to intercept it
    const originalJson = res.json.bind(res);
    
    res.json = function(body: any) {
      // Log the action after successful response
      if (req.user && body.success !== false) {
        const resourceId = req.params.id || body.id || body.data?.id;
        logAdminAction(
          req.user.id,
          action,
          resourceType,
          resourceId,
          {
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query,
          },
          req
        ).catch(err => {
          console.error('[AUDIT] Auto-log failed:', err.message);
        });
      }
      
      return originalJson(body);
    };
    
    next();
  };
};

