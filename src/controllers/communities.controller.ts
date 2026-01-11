import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ValidationError, ConflictError } from '../utils/errors';

export const getBestCommunities = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const { data: communities, error } = await supabaseAdmin
      .from('communities')
      .select(
        `
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url)
      `
      )
      .eq('is_featured', true)
      .order('featured_at', { ascending: false, nullsFirst: false })
      .order('member_count', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    // Get member counts and check if user is member
    const communitiesWithStats = await Promise.all(
      (communities || []).map(async (community: any) => {
        const [isMember] = await Promise.all([
          req.user
            ? supabaseAdmin
                .from('community_members')
                .select('id')
                .eq('community_id', community.id)
                .eq('user_id', req.user.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        return {
          ...community,
          members: community.member_count || 0,
          predictions: community.prediction_count || 0,
          isJoined: !!isMember.data,
        };
      })
    );

    res.json({
      success: true,
      communities: communitiesWithStats,
    });
  } catch (error) {
    next(error);
  }
};

export const getCommunities = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = req.query.search as string;
    const featured = req.query.featured === 'true';

    let query = supabaseAdmin
      .from('communities')
      .select(
        `
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url)
      `,
        { count: 'exact' }
      );

    if (featured) {
      query = query.eq('is_featured', true);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    query = query.order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    const { data: communities, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get member counts and check if user is member
    const communitiesWithStats = await Promise.all(
      (communities || []).map(async (community: any) => {
        const [isMember] = await Promise.all([
          req.user
            ? supabaseAdmin
                .from('community_members')
                .select('id')
                .eq('community_id', community.id)
                .eq('user_id', req.user.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        return {
          ...community,
          members: community.member_count || 0,
          predictions: community.prediction_count || 0,
          isJoined: !!isMember.data,
        };
      })
    );

    res.json({
      success: true,
      communities: communitiesWithStats,
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

export const getCommunity = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const { data: community, error } = await supabaseAdmin
      .from('communities')
      .select(
        `
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url)
      `
      )
      .eq('id', id)
      .single();

    if (error || !community) {
      throw new NotFoundError('Community');
    }

    // Get membership status
    const [isMember] = await Promise.all([
      req.user
        ? supabaseAdmin
            .from('community_members')
            .select('id')
            .eq('community_id', id)
            .eq('user_id', req.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    res.json({
      success: true,
      community: {
        ...community,
        members: community.member_count || 0,
        predictions: community.prediction_count || 0,
        isJoined: !!isMember.data,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createCommunity = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    // Check if user is admin or moderator
    if (req.user.role !== 'admin' && req.user.role !== 'moderator') {
      throw new ForbiddenError('Only admins and moderators can create communities');
    }

    const { name, description, avatar_url, banner_url } = req.body;

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Community name is required');
    }

    // Check if name already exists
    const { data: existing } = await supabaseAdmin
      .from('communities')
      .select('id')
      .eq('name', name.trim())
      .maybeSingle();

    if (existing) {
      throw new ConflictError('Community name already exists', 'NAME_EXISTS');
    }

    const { data: community, error } = await supabaseAdmin
      .from('communities')
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        avatar_url: avatar_url || null,
        banner_url: banner_url || null,
        creator_id: req.user.id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Community created',
      community,
    });
  } catch (error) {
    next(error);
  }
};

export const updateCommunity = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;
    const { description, avatar_url, banner_url } = req.body;

    // Check if community exists and user has permission
    const { data: community, error: fetchError } = await supabaseAdmin
      .from('communities')
      .select('creator_id')
      .eq('id', id)
      .single();

    if (fetchError || !community) {
      throw new NotFoundError('Community');
    }

    if (community.creator_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the creator or admin can update this community');
    }

    const { data: updatedCommunity, error } = await supabaseAdmin
      .from('communities')
      .update({
        description: description?.trim() || null,
        avatar_url: avatar_url || null,
        banner_url: banner_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Community updated',
      community: updatedCommunity,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCommunity = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if community exists and user has permission
    const { data: community, error: fetchError } = await supabaseAdmin
      .from('communities')
      .select('creator_id')
      .eq('id', id)
      .single();

    if (fetchError || !community) {
      throw new NotFoundError('Community');
    }

    if (community.creator_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the creator or admin can delete this community');
    }

    const { error } = await supabaseAdmin
      .from('communities')
      .delete()
      .eq('id', id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Community deleted',
    });
  } catch (error) {
    next(error);
  }
};

export const joinCommunity = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if community exists
    const { data: community } = await supabaseAdmin
      .from('communities')
      .select('id')
      .eq('id', id)
      .single();

    if (!community) {
      throw new NotFoundError('Community');
    }

    // Check if already member
    const { data: existing } = await supabaseAdmin
      .from('community_members')
      .select('id')
      .eq('community_id', id)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (existing) {
      throw new ConflictError('You are already a member of this community', 'ALREADY_MEMBER');
    }

    // Join community
    const { error } = await supabaseAdmin
      .from('community_members')
      .insert({
        community_id: id,
        user_id: req.user.id,
      });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Joined community',
    });
  } catch (error) {
    next(error);
  }
};

export const leaveCommunity = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    const { error } = await supabaseAdmin
      .from('community_members')
      .delete()
      .eq('community_id', id)
      .eq('user_id', req.user.id);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      message: 'Left community',
    });
  } catch (error) {
    next(error);
  }
};

export const getCommunityMembers = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const { data: members, error, count } = await supabaseAdmin
      .from('community_members')
      .select(
        `
        *,
        user:profiles!user_id(id, username, full_name, avatar_url)
      `,
        { count: 'exact' }
      )
      .eq('community_id', id)
      .order('joined_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      members: members || [],
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

export const getCommunityPredictions = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Get community name
    const { data: community } = await supabaseAdmin
      .from('communities')
      .select('name')
      .eq('id', id)
      .single();

    if (!community) {
      throw new NotFoundError('Community');
    }

    // Get predictions with this category
    const { data: predictions, error, count } = await supabaseAdmin
      .from('predictions')
      .select(
        `
        *,
        creator:profiles!creator_id(id, username, full_name, avatar_url)
      `,
        { count: 'exact' }
      )
      .eq('category', community.name)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      predictions: predictions || [],
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

export const getUserCommunities = async (
  req: Request<{ username: string }>,
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

    // Get user's communities
    const { data: memberships, error, count } = await supabaseAdmin
      .from('community_members')
      .select(
        `
        *,
        community:communities(
          id,
          name,
          description,
          avatar_url,
          banner_url,
          creator_id,
          created_at
        )
      `,
        { count: 'exact' }
      )
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      communities: (memberships || []).map((m: any) => m.community),
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

