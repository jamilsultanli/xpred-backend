import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, ForbiddenError, ValidationError } from '../utils/errors';
import { CreateCommentDto } from '../models/post.types';

export const getComments = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:12',message:'getComments entry',data:{id,page,limit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
    // #endregion

    // Check if it's a post or prediction
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('id')
      .eq('id', id)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:21',message:'post query result',data:{post:!!post,hasPost:!!post},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D'})}).catch(()=>{});
    // #endregion

    const { data: prediction } = await supabaseAdmin
      .from('predictions')
      .select('id, creator_id')
      .eq('id', id)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:32',message:'prediction query result',data:{prediction:!!prediction,hasPrediction:!!prediction},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D'})}).catch(()=>{});
    // #endregion

    if (!post && !prediction) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:37',message:'throwing NotFoundError',data:{id,isPost:false,isPrediction:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      throw new NotFoundError('Post or Prediction');
    }

    // Fetch comments - check both post_id and prediction_id
    const { data: comments, error, count } = await supabaseAdmin
      .from('comments')
      .select(`
        *,
        author:profiles!user_id(id, username, avatar_url, is_verified)
      `, { count: 'exact' })
      .or(`post_id.eq.${id},prediction_id.eq.${id}`)
      .order('created_at', { ascending: true })
      .range((page - 1) * limit, page * limit - 1);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:50',message:'comments query result',data:{commentsCount:comments?.length||0,error:error?.message||null,errorCode:error?.code||null,count:count||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      comments: comments || [],
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

export const addComment = async (
  req: Request<{ id: string }, {}, CreateCommentDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;
    const { content } = req.body;

    if (!content || content.trim().length === 0) {
      throw new ValidationError('Comment content is required');
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:85',message:'addComment entry',data:{id,contentLength:content?.length||0,userId:req.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,D'})}).catch(()=>{});
    // #endregion

    // Check if it's a post or prediction
    const { data: post } = await supabaseAdmin
      .from('posts')
      .select('user_id')
      .eq('id', id)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:95',message:'post query result in addComment',data:{hasPost:!!post},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D'})}).catch(()=>{});
    // #endregion

    const { data: prediction } = await supabaseAdmin
      .from('predictions')
      .select('creator_id')
      .eq('id', id)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:102',message:'prediction query result in addComment',data:{hasPrediction:!!prediction},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,D'})}).catch(()=>{});
    // #endregion

    if (!post && !prediction) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:107',message:'throwing NotFoundError in addComment',data:{id,isPost:false,isPrediction:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      throw new NotFoundError('Post or Prediction');
    }

    // Determine entity type and owner
    const entityOwnerId = post ? post.user_id : prediction?.creator_id;
    const isPost = !!post;

    // Create comment
    const commentData: any = {
      user_id: req.user.id,
      content: content.trim(),
    };

    if (isPost) {
      commentData.post_id = id;
      commentData.prediction_id = null;
    } else {
      commentData.prediction_id = id;
      commentData.post_id = null;
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:125',message:'inserting comment',data:{isPost,commentDataKeys:Object.keys(commentData)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert(commentData)
      .select(`
        *,
        author:profiles!user_id(id, username, avatar_url, is_verified)
      `)
      .single();

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/4bb0fde4-702b-42b2-b730-961917097050',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'comments.controller.ts:137',message:'comment insert result',data:{hasComment:!!comment,error:error?.message||null,errorCode:error?.code||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion

    if (error || !comment) {
      throw new ValidationError('Failed to create comment');
    }

    // Create notification for entity owner (if not self-comment)
    if (entityOwnerId && entityOwnerId !== req.user.id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: entityOwnerId,
        actor_id: req.user.id,
        type: 'comment',
        entity_id: id,
        message: `commented: "${content.substring(0, 20)}..."`,
      });
    }

    res.status(201).json({
      success: true,
      comment,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteComment = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Check if comment exists and user is author or admin
    const { data: comment, error: fetchError } = await supabaseAdmin
      .from('comments')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || !comment) {
      throw new NotFoundError('Comment');
    }

    if (comment.user_id !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenError('Only the author or admin can delete this comment');
    }

    // Delete comment
    const { error } = await supabaseAdmin
      .from('comments')
      .delete()
      .eq('id', id);

    if (error) {
      throw new ValidationError('Failed to delete comment');
    }

    res.json({
      success: true,
      message: 'Comment deleted',
    });
  } catch (error) {
    next(error);
  }
};


