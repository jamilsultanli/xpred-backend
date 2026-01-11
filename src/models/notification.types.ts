export interface Notification {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: 'follow' | 'like' | 'comment' | 'bet_won' | 'admin_message';
  entity_id: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  admin_reply: string | null;
  created_at: string;
}

export interface CreateTicketDto {
  subject: string;
  message: string;
}

export interface ReplyTicketDto {
  message: string;
}


