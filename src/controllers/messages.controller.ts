import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';

// Get user's conversations
export const getConversations = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: conversations, error } = await supabaseAdmin
      .from('conversations')
      .select(`
        *,
        participant1:profiles!participant1_id(id, username, full_name, avatar_url, is_verified),
        participant2:profiles!participant2_id(id, username, full_name, avatar_url, is_verified),
        messages!inner(content, created_at, sender_id, is_read)
      `)
      .or(`participant1_id.eq.${req.user.id},participant2_id.eq.${req.user.id}`)
      .order('last_message_at', { ascending: false });

    if (error) throw error;

    // Format conversations with the other participant and last message
    const formattedConversations = (conversations || []).map((conv: any) => {
      const otherParticipant = conv.participant1.id === req.user!.id 
        ? conv.participant2 
        : conv.participant1;
      
      const lastMessage = conv.messages?.[conv.messages.length - 1];
      const unreadCount = conv.messages?.filter(
        (m: any) => m.sender_id !== req.user!.id && !m.is_read
      ).length || 0;

      return {
        id: conv.id,
        participant: otherParticipant,
        lastMessage: lastMessage?.content || '',
        lastMessageTime: lastMessage?.created_at || conv.created_at,
        unreadCount,
        createdAt: conv.created_at,
      };
    });

    res.json({
      success: true,
      conversations: formattedConversations,
    });
  } catch (error) {
    next(error);
  }
};

// Get messages in a conversation
export const getMessages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { conversationId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    // Verify user is participant in conversation
    const { data: conversation } = await supabaseAdmin
      .from('conversations')
      .select('participant1_id, participant2_id')
      .eq('id', conversationId)
      .single();

    if (!conversation) {
      throw new NotFoundError('Conversation');
    }

    if (
      conversation.participant1_id !== req.user.id &&
      conversation.participant2_id !== req.user.id
    ) {
      throw new ForbiddenError('Not a participant in this conversation');
    }

    // Get messages with reactions
    const { data: messages, error } = await supabaseAdmin
      .from('messages')
      .select(`
        *,
        sender:profiles!sender_id(id, username, full_name, avatar_url),
        reactions:message_reactions(id, emoji, user_id)
      `)
      .eq('conversation_id', conversationId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    // Mark messages as read
    await supabaseAdmin
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('receiver_id', req.user.id)
      .eq('is_read', false);

    res.json({
      success: true,
      messages: (messages || []).reverse(), // Reverse to show oldest first
      pagination: {
        page,
        limit,
        hasMore: (messages || []).length === limit,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Send a message
export const sendMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { receiverId, content } = req.body;

    if (!receiverId || !content?.trim()) {
      throw new ValidationError('Receiver and message content are required');
    }

    if (receiverId === req.user.id) {
      throw new ValidationError('Cannot send message to yourself');
    }

    // Get or create conversation
    const { data: conversationId, error: convError } = await supabaseAdmin
      .rpc('get_or_create_conversation', {
        user1_id: req.user.id,
        user2_id: receiverId,
      });

    if (convError) throw convError;

    // Create message
    const { data: message, error: msgError } = await supabaseAdmin
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: req.user.id,
        receiver_id: receiverId,
        content: content.trim(),
      })
      .select(`
        *,
        sender:profiles!sender_id(id, username, full_name, avatar_url)
      `)
      .single();

    if (msgError) throw msgError;

    // Emit socket event for real-time delivery (handled by socket.io middleware)
    if ((req as any).io) {
      (req as any).io.to(`user:${receiverId}`).emit('new_message', message);
    }

    res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a message
export const deleteMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { messageId } = req.params;

    // Get message
    const { data: message, error: fetchError } = await supabaseAdmin
      .from('messages')
      .select('sender_id, conversation_id, receiver_id')
      .eq('id', messageId)
      .single();

    if (fetchError || !message) {
      throw new NotFoundError('Message');
    }

    // Only sender can delete
    if (message.sender_id !== req.user.id) {
      throw new ForbiddenError('Only the sender can delete this message');
    }

    // Soft delete
    const { error: deleteError } = await supabaseAdmin
      .from('messages')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        deleted_by: req.user.id,
        content: '[Message deleted]',
      })
      .eq('id', messageId);

    if (deleteError) throw deleteError;

    // Emit socket event
    if ((req as any).io) {
      (req as any).io.to(`conversation:${message.conversation_id}`).emit('message_deleted', {
        messageId,
        conversationId: message.conversation_id,
      });
    }

    res.json({
      success: true,
      message: 'Message deleted',
    });
  } catch (error) {
    next(error);
  }
};

// React to a message
export const reactToMessage = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) {
      throw new ValidationError('Emoji is required');
    }

    // Check if reaction already exists
    const { data: existing } = await supabaseAdmin
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', req.user.id)
      .eq('emoji', emoji)
      .single();

    if (existing) {
      // Remove reaction if it exists
      await supabaseAdmin
        .from('message_reactions')
        .delete()
        .eq('id', existing.id);

      return res.json({
        success: true,
        action: 'removed',
        emoji,
      });
    }

    // Add new reaction
    const { data: reaction, error } = await supabaseAdmin
      .from('message_reactions')
      .insert({
        message_id: messageId,
        user_id: req.user.id,
        emoji,
      })
      .select()
      .single();

    if (error) throw error;

    // Get message conversation for socket
    const { data: message } = await supabaseAdmin
      .from('messages')
      .select('conversation_id')
      .eq('id', messageId)
      .single();

    // Emit socket event
    if ((req as any).io && message) {
      (req as any).io.to(`conversation:${message.conversation_id}`).emit('message_reaction', {
        messageId,
        userId: req.user.id,
        emoji,
        action: 'added',
      });
    }

    res.json({
      success: true,
      action: 'added',
      reaction,
    });
  } catch (error) {
    next(error);
  }
};

// Update typing status
export const updateTypingStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { conversationId } = req.params;
    const { isTyping } = req.body;

    await supabaseAdmin
      .from('typing_status')
      .upsert({
        conversation_id: conversationId,
        user_id: req.user.id,
        is_typing: isTyping,
        updated_at: new Date().toISOString(),
      });

    // Emit socket event
    if ((req as any).io) {
      (req as any).io.to(`conversation:${conversationId}`).emit('typing_status', {
        userId: req.user.id,
        isTyping,
      });
    }

    res.json({
      success: true,
    });
  } catch (error) {
    next(error);
  }
};

// Get unread message count
export const getUnreadCount = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { count, error } = await supabaseAdmin
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', req.user.id)
      .eq('is_read', false)
      .eq('is_deleted', false);

    if (error) throw error;

    res.json({
      success: true,
      unreadCount: count || 0,
    });
  } catch (error) {
    next(error);
  }
};
