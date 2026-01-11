/**
 * Batch API Controller
 * Handles multiple API requests in a single call
 * Reduces network overhead and improves performance
 */

import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, ValidationError } from '../utils/errors';

interface BatchRequest {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  endpoint: string;
  data?: any;
}

interface BatchResponse {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  status?: number;
}

/**
 * Execute batch requests
 * POST /api/v1/batch
 */
export const executeBatch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { requests } = req.body;

    if (!Array.isArray(requests) || requests.length === 0) {
      throw new ValidationError('Requests array is required');
    }

    if (requests.length > 10) {
      throw new ValidationError('Maximum 10 requests per batch');
    }

    console.log(`📦 Executing batch of ${requests.length} requests for user ${req.user.id}`);

    // Execute all requests in parallel
    const results = await Promise.allSettled(
      requests.map(async (batchReq: BatchRequest): Promise<BatchResponse> => {
        try {
          // Validate request
          if (!batchReq.id || !batchReq.method || !batchReq.endpoint) {
            return {
              id: batchReq.id || 'unknown',
              success: false,
              error: 'Invalid request format',
              status: 400,
            };
          }

          // Execute request based on endpoint
          const result = await executeRequest(batchReq, req.user!.id);

          return {
            id: batchReq.id,
            success: true,
            data: result,
            status: 200,
          };
        } catch (error: any) {
          console.error(`❌ Batch request ${batchReq.id} failed:`, error.message);
          return {
            id: batchReq.id,
            success: false,
            error: error.message || 'Request failed',
            status: error.status || 500,
          };
        }
      })
    );

    // Format responses
    const responses: BatchResponse[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          id: requests[index]?.id || 'unknown',
          success: false,
          error: result.reason?.message || 'Request failed',
          status: 500,
        };
      }
    });

    console.log(`✅ Batch completed: ${responses.filter(r => r.success).length}/${responses.length} successful`);

    res.json({
      success: true,
      results: responses,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Execute individual request
 */
async function executeRequest(request: BatchRequest, userId: string): Promise<any> {
  const { method, endpoint, data } = request;

  // Parse endpoint
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // Route to appropriate handler
  switch (true) {
    // User endpoints
    case path === '/users/me':
      return handleGetCurrentUser(userId);

    // Wallet endpoints
    case path === '/wallet/balance':
      return handleGetWalletBalance(userId);

    // Notifications endpoints
    case path.startsWith('/notifications'):
      return handleGetNotifications(userId);

    // Messages endpoints
    case path === '/messages/unread-count':
      return handleGetUnreadMessages(userId);

    case path === '/messages':
      return handleGetConversations(userId);

    // Predictions endpoints
    case path.startsWith('/predictions') && method === 'GET':
      return handleGetPredictions(path, userId);

    default:
      throw new Error(`Endpoint ${path} not supported in batch requests`);
  }
}

// ==================== HANDLERS ====================

async function handleGetCurrentUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return { success: true, user: data };
}

async function handleGetWalletBalance(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('xp_balance, xc_balance')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return {
    success: true,
    balance: {
      xp: data.xp_balance || 0,
      xc: data.xc_balance || 0,
    },
  };
}

async function handleGetNotifications(userId: string) {
  const { data, error, count } = await supabaseAdmin
    .from('notifications')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;

  return {
    success: true,
    unread_count: count || 0,
    notifications: data || [],
  };
}

async function handleGetUnreadMessages(userId: string) {
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('receiver_id', userId)
    .eq('is_read', false)
    .eq('is_deleted', false);

  if (error) throw error;

  return {
    success: true,
    unreadCount: count || 0,
  };
}

async function handleGetConversations(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('conversations')
    .select(`
      *,
      participant1:profiles!participant1_id(id, username, full_name, avatar_url, is_verified),
      participant2:profiles!participant2_id(id, username, full_name, avatar_url, is_verified)
    `)
    .or(`participant1_id.eq.${userId},participant2_id.eq.${userId}`)
    .order('last_message_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return {
    success: true,
    conversations: data || [],
  };
}

async function handleGetPredictions(path: string, userId: string) {
  // Parse query parameters from path
  const url = new URL(`http://localhost${path}`);
  const params = url.searchParams;

  const page = parseInt(params.get('page') || '1');
  const limit = Math.min(parseInt(params.get('limit') || '20'), 100);

  let query = supabaseAdmin
    .from('predictions')
    .select(`*, creator:profiles!creator_id(id, username, full_name, avatar_url, is_verified)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    success: true,
    predictions: data || [],
    pagination: {
      page,
      limit,
      total: count || 0,
      pages: Math.ceil((count || 0) / limit),
    },
  };
}

