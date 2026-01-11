import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { CreatePostDto, UpdatePostDto } from '../models/post.types';

export const createPost = async (
  req: Request<{}, {}, CreatePostDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { content, image_url } = req.body;

    if (!content || content.trim().length === 0) {
      throw new ValidationError('Post content is required');
    }

    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .insert({
        user_id: req.user.id,
        content: content.trim(),
        image_url: image_url || null,
      })
      .select(`
        *,
        author:profiles!user_id(id, username, full_name, avatar_url, is_verified)
      `)
      .single();

    if (error || !post) {
      throw new ValidationError('Failed to create post');
    }

    res.status(201).json({
      success: true,
      post: {
        ...post,
        likes_count: 0,
        comments_count: 0,
        is_liked: false,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getPosts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const feedType = (req.query.feed_type as string) || 'explore';
    const userId = req.query.user_id as string;

    let query = supabaseAdmin
      .from('posts')
      .select(`
        *,
        author:profiles!user_id(id, username, full_name, avatar_url, is_verified)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    // Filter by user if specified
    if (userId) {
      query = query.eq('user_id', userId);
    } else if (feedType === 'following' && req.user) {
      // Get users that current user follows
      const { data: follows } = await supabaseAdmin
        .from('follows')
        .select('following_id')
        .eq('follower_id', req.user.id);

      const followingIds = (follows || []).map((f: any) => f.following_id);
      
      if (followingIds.length > 0) {
        query = query.in('user_id', [...followingIds, req.user.id]);
      } else {
        // No follows, return empty
        res.json({
          success: true,
          posts: [],
          pagination: {
            page,
            limit,
            total: 0,
            pages: 0,
          },
        });
        return;
      }
    }

    const { data: posts, error, count } = await query;

    if (error) {
      throw error;
    }

    // Get likes and comments counts, and check if current user liked each post
    const postsWithStats = await Promise.all(
      (posts || []).map(async (post: any) => {
        const [likesResult, commentsResult, userLike] = await Promise.all([
          supabaseAdmin
            .from('likes')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id),
          supabaseAdmin
            .from('comments')
            .select('*', { count: 'exact', head: true })
            .eq('post_id', post.id),
          req.user
            ? supabaseAdmin
                .from('likes')
                .select('id')
                .eq('post_id', post.id)
                .eq('user_id', req.user!.id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        return {
          ...post,
          likes_count: likesResult.count || 0,
          comments_count: commentsResult.count || 0,
          is_liked: !!userLike.data,
        };
      })
    );

    res.json({
      success: true,
      posts: postsWithStats,
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

export const getPost = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    const { data: post, error } = await supabaseAdmin
      .from('posts')
      .select(`
        *,
        author:profiles!user_id(id, username, full_name, avatar_url, is_verified)
      `)
      .eq('id', id)
      .single();

    if (error || !post) {
      throw new NotFoundError('Post');
    }

    // Get stats
    const [likesResult, commentsResult, userLike] = await Promise.all([
      supabaseAdmin
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', id),
      supabaseAdmin
        .from('comments')
        .select('*', { count: 'exact', head: true })
        .eq('post_id', id),
      req.user
        ? supabaseAdmin
            .from('likes')
            .select('id')
            .eq('post_id', id)
            .eq('user_id', req.user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Get comments
    const { data: comments } = await supabaseAdmin
      .from('comments')
      .select(`
        *,
        author:profiles!user_id(id, username, avatar_url)
      `)
      .eq('post_id', id)
      .order('created_at', { ascending: true });

    res.json({
      success: true,
      post: {
        ...post,
        likes_count: likesResult.count || 0,
        comments_count: commentsResult.count || 0,
        is_liked: !!userLike.data,
      },
      comments: comments || [],
    });
  } catch (error) {
    next(error);
  }
};

export const updatePost = async (
  req: Request<{ id: string }, {}, UpdatePostDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;
    const updates = req.body;

    // Check if post exists and user is author
    const { data: post, error: fetchError } = await supabaseAdmin
      .from('posts')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !post) {
      throw new NotFoundError('Post');
    }

    if (post.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the author can update this post');
    }

    // Clean content if provided
    if (updates.content !== undefined) {
      if (!updates.content || updates.content.trim().length === 0) {
        throw new ValidationError('Post content cannot be empty');
      }
      updates.content = updates.content.trim();
    }

    const { data: updatedPost, error } = await supabaseAdmin
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        author:profiles!user_id(id, username, full_name, avatar_url, is_verified)
      `)
      .single();

    if (error || !updatedPost) {
      throw new ValidationError('Failed to update post');
    }

    res.json({
      success: true,
      post: updatedPost,
    });
  } catch (error) {
    next(error);
  }
};

export const deletePost = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if post exists and user is author or admin
    const { data: post, error: fetchError } = await supabaseAdmin
      .from('posts')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !post) {
      throw new NotFoundError('Post');
    }

    if (post.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the author or admin can delete this post');
    }

    // Delete post (likes and comments will be handled by cascade or manual deletion)
    const { error } = await supabaseAdmin
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) {
      throw new ValidationError('Failed to delete post');
    }

    res.json({
      success: true,
      message: 'Post deleted',
    });
  } catch (error) {
    next(error);
  }
};

export const toggleLike = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if it's a post or prediction
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('user_id')
      .eq('id', id)
      .single();

    const { data: prediction } = await supabaseAdmin
      .from('predictions')
      .select('creator_id')
      .eq('id', id)
      .single();

    if (!post && !prediction) {
      throw new NotFoundError('Post or Prediction');
    }

    const isPost = !!post;
    const entityOwnerId = post ? post.user_id : prediction?.creator_id;

    // Check if like exists
    const likeQuery = isPost
      ? supabaseAdmin.from('likes').select('id').eq('post_id', id).eq('user_id', req.user.id)
      : supabaseAdmin.from('likes').select('id').eq('prediction_id', id).eq('user_id', req.user.id);

    const { data: existingLike } = await likeQuery.maybeSingle();

    let liked = false;

    if (existingLike) {
      // Unlike
      await supabaseAdmin
        .from('likes')
        .delete()
        .eq('id', existingLike.id);
      liked = false;
    } else {
      // Like
      const likeData: any = {
        user_id: req.user.id,
      };
      if (isPost) {
        likeData.post_id = id;
        likeData.prediction_id = null;
      } else {
        likeData.prediction_id = id;
        likeData.post_id = null;
      }

      const { error: insertError } = await supabaseAdmin
        .from('likes')
        .insert(likeData);
      
      if (insertError) {
        // If unique constraint violation, user already liked this
        if (insertError.code === '23505' || insertError.message?.includes('unique')) {
          // Check again to get the existing like
          const { data: existingLikeAfterError } = await likeQuery.maybeSingle();
          if (existingLikeAfterError) {
            // User already liked, so unlike it
            await supabaseAdmin
              .from('likes')
              .delete()
              .eq('id', existingLikeAfterError.id);
            liked = false;
          } else {
            throw insertError;
          }
        } else {
          throw insertError;
        }
      } else {
        liked = true;
      }

      // Create notification for entity owner (if not self-like)
      if (entityOwnerId && entityOwnerId !== req.user.id) {
        await supabaseAdmin.from('notifications').insert({
          user_id: entityOwnerId,
          actor_id: req.user.id,
          type: 'like',
          entity_id: id,
        });
      }
    }

    // Get updated likes count
    const countQuery = isPost
      ? supabaseAdmin.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', id)
      : supabaseAdmin.from('likes').select('*', { count: 'exact', head: true }).eq('prediction_id', id);

    const { count: likesCount } = await countQuery;

    res.json({
      success: true,
      liked,
      likes_count: likesCount || 0,
    });
  } catch (error) {
    next(error);
  }
};


