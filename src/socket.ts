import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './config/env';

interface AuthSocket extends Socket {
  userId?: string;
}

// Online users tracking
const onlineUsers = new Map<string, string>(); // userId -> socketId

export function setupSocketIO(io: SocketIOServer) {
  // Authentication middleware
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as { userId: string };
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    const userId = socket.userId!;
    console.log(`✅ User connected: ${userId}`);

    // Track online status
    onlineUsers.set(userId, socket.id);
    socket.join(`user:${userId}`);

    // Broadcast online status to friends/contacts
    socket.broadcast.emit('user_online', { userId });

    // Join conversation rooms
    socket.on('join_conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
      console.log(`User ${userId} joined conversation: ${conversationId}`);
    });

    // Leave conversation room
    socket.on('leave_conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
      console.log(`User ${userId} left conversation: ${conversationId}`);
    });

    // Typing indicator
    socket.on('typing_start', (data: { conversationId: string; username: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('user_typing', {
        userId,
        username: data.username,
        conversationId: data.conversationId,
      });
    });

    socket.on('typing_stop', (data: { conversationId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('user_stopped_typing', {
        userId,
        conversationId: data.conversationId,
      });
    });

    // Message events
    socket.on('send_message', (data: {
      conversationId: string;
      receiverId: string;
      message: any;
    }) => {
      // Send to receiver
      io.to(`user:${data.receiverId}`).emit('new_message', {
        conversationId: data.conversationId,
        message: data.message,
      });

      // Broadcast to conversation
      socket.to(`conversation:${data.conversationId}`).emit('message_sent', {
        message: data.message,
      });
    });

    // Message read receipt
    socket.on('message_read', (data: {
      conversationId: string;
      messageIds: string[];
      senderId: string;
    }) => {
      io.to(`user:${data.senderId}`).emit('messages_read', {
        conversationId: data.conversationId,
        messageIds: data.messageIds,
        readBy: userId,
      });
    });

    // Message deletion
    socket.on('delete_message', (data: {
      conversationId: string;
      messageId: string;
    }) => {
      socket.to(`conversation:${data.conversationId}`).emit('message_deleted', {
        messageId: data.messageId,
        conversationId: data.conversationId,
      });
    });

    // Message reaction
    socket.on('add_reaction', (data: {
      conversationId: string;
      messageId: string;
      emoji: string;
    }) => {
      socket.to(`conversation:${data.conversationId}`).emit('reaction_added', {
        messageId: data.messageId,
        userId,
        emoji: data.emoji,
      });
    });

    socket.on('remove_reaction', (data: {
      conversationId: string;
      messageId: string;
      emoji: string;
    }) => {
      socket.to(`conversation:${data.conversationId}`).emit('reaction_removed', {
        messageId: data.messageId,
        userId,
        emoji: data.emoji,
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${userId}`);
      onlineUsers.delete(userId);
      socket.broadcast.emit('user_offline', { userId });
    });
  });

  // Helper function to check if user is online
  io.on('check_online_status', (userId: string) => {
    return onlineUsers.has(userId);
  });
}

export function getOnlineUsers() {
  return Array.from(onlineUsers.keys());
}

export function isUserOnline(userId: string): boolean {
  return onlineUsers.has(userId);
}

