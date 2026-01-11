import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { CreateTicketDto, ReplyTicketDto } from '../models/notification.types';

export const createTicket = async (
  req: Request<{}, {}, CreateTicketDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { subject, message } = req.body;

    if (!subject || subject.trim().length === 0) {
      throw new ValidationError('Subject is required');
    }

    if (!message || message.trim().length === 0) {
      throw new ValidationError('Message is required');
    }

    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: req.user.id,
        subject: subject.trim(),
        message: message.trim(),
        status: 'open',
      })
      .select()
      .single();

    if (error || !ticket) {
      throw new ValidationError('Failed to create support ticket');
    }

    res.status(201).json({
      success: true,
      ticket,
    });
  } catch (error) {
    next(error);
  }
};

export const submitContact = async (
  req: Request<{}, {}, { name: string; email: string; subject: string; message: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || name.trim().length === 0) {
      throw new ValidationError('Name is required');
    }

    if (!email || email.trim().length === 0) {
      throw new ValidationError('Email is required');
    }

    if (!subject || subject.trim().length === 0) {
      throw new ValidationError('Subject is required');
    }

    if (!message || message.trim().length === 0) {
      throw new ValidationError('Message is required');
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new ValidationError('Invalid email format');
    }

    // If user is authenticated, link to their account
    const userId = req.user?.id || null;

    // Create contact form submission (can be stored in support_tickets or a separate contacts table)
    const { data: contact, error } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: userId,
        subject: `Contact Form: ${subject.trim()}`,
        message: `From: ${name.trim()} (${email.trim()})\n\n${message.trim()}`,
        status: 'open',
      })
      .select()
      .single();

    if (error || !contact) {
      throw new ValidationError('Failed to submit contact form');
    }

    res.status(201).json({
      success: true,
      message: 'Contact form submitted successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const getTickets = async (
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
    const status = (req.query.status as string) || 'all';

    let query = supabaseAdmin
      .from('support_tickets')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: tickets, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      tickets: tickets || [],
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

export const getTicket = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !ticket) {
      throw new NotFoundError('Support ticket');
    }

    res.json({
      success: true,
      ticket,
    });
  } catch (error) {
    next(error);
  }
};

export const replyToTicket = async (
  req: Request<{ id: string }, {}, ReplyTicketDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;
    const { message } = req.body;

    if (!message || message.trim().length === 0) {
      throw new ValidationError('Reply message is required');
    }

    // Check if ticket exists and belongs to user
    const { data: ticket, error: fetchError } = await supabaseAdmin
      .from('support_tickets')
      .select('user_id, status')
      .eq('id', id)
      .single();

    if (fetchError || !ticket) {
      throw new NotFoundError('Support ticket');
    }

    if (ticket.user_id !== req.user.id) {
      throw new ForbiddenError('Cannot reply to this ticket');
    }

    if (ticket.status === 'closed') {
      throw new ValidationError('Cannot reply to closed ticket');
    }

    // For user replies, we'll append to the message or create a new system
    // For simplicity, we'll update the message field (in production, use a replies table)
    const updatedMessage = (ticket as any).message + '\n\n--- User Reply ---\n' + message.trim();

    const { data: updatedTicket, error } = await supabaseAdmin
      .from('support_tickets')
      .update({
        message: updatedMessage,
        status: 'open', // Reopen if it was in_progress
      })
      .eq('id', id)
      .select()
      .single();

    if (error || !updatedTicket) {
      throw new ValidationError('Failed to add reply');
    }

    res.json({
      success: true,
      ticket: updatedTicket,
    });
  } catch (error) {
    next(error);
  }
};


