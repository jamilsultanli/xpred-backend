-- ============================================
-- COMPREHENSIVE MESSAGING SYSTEM MIGRATION
-- Handles existing tables and creates new structure
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Drop old trigger and function if they exist
DROP TRIGGER IF EXISTS trigger_update_conversation_last_message ON messages;
DROP FUNCTION IF EXISTS update_conversation_last_message();
DROP FUNCTION IF EXISTS get_or_create_conversation(UUID, UUID);

-- Step 2: Check if old messages table exists and back it up if needed
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
    -- If messages table exists without conversation_id, we need to drop it
    -- (Or you can backup first if you have important data)
    DROP TABLE IF EXISTS public.messages CASCADE;
    RAISE NOTICE 'Dropped old messages table';
  END IF;
END $$;

-- Step 3: Drop related tables if they exist
DROP TABLE IF EXISTS public.message_reactions CASCADE;
DROP TABLE IF EXISTS public.typing_status CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;

-- Step 4: Create conversations table
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT conversations_participants_unique UNIQUE (participant1_id, participant2_id),
  CONSTRAINT conversations_different_participants CHECK (participant1_id != participant2_id)
);

-- Step 5: Create NEW messages table with conversation_id
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT messages_different_users CHECK (sender_id != receiver_id)
);

-- Step 6: Create message reactions table
CREATE TABLE public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji VARCHAR(10) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT message_reactions_unique UNIQUE (message_id, user_id, emoji)
);

-- Step 7: Create typing status table
CREATE TABLE public.typing_status (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_typing BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT typing_status_unique UNIQUE (conversation_id, user_id)
);

-- Step 8: Create indexes
CREATE INDEX idx_conversations_participant1 ON public.conversations(participant1_id);
CREATE INDEX idx_conversations_participant2 ON public.conversations(participant2_id);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);

CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_receiver ON public.messages(receiver_id);
CREATE INDEX idx_messages_unread ON public.messages(receiver_id, is_read) WHERE is_read = FALSE;

CREATE INDEX idx_message_reactions_message ON public.message_reactions(message_id);
CREATE INDEX idx_typing_status_conversation ON public.typing_status(conversation_id);

-- Step 9: Create function to update last_message_at
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 10: Create trigger
CREATE TRIGGER trigger_update_conversation_last_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_conversation_last_message();

-- Step 11: Create function to get or create conversation
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(user1_id UUID, user2_id UUID)
RETURNS UUID AS $$
DECLARE
  conv_id UUID;
  min_id UUID;
  max_id UUID;
BEGIN
  -- Ensure consistent ordering
  IF user1_id < user2_id THEN
    min_id := user1_id;
    max_id := user2_id;
  ELSE
    min_id := user2_id;
    max_id := user1_id;
  END IF;

  -- Try to find existing conversation
  SELECT id INTO conv_id
  FROM public.conversations
  WHERE (participant1_id = min_id AND participant2_id = max_id)
     OR (participant1_id = max_id AND participant2_id = min_id)
  LIMIT 1;

  -- If not found, create new conversation
  IF conv_id IS NULL THEN
    INSERT INTO public.conversations (participant1_id, participant2_id)
    VALUES (min_id, max_id)
    RETURNING id INTO conv_id;
  END IF;

  RETURN conv_id;
END;
$$ LANGUAGE plpgsql;

-- Step 12: Add online status columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_online_at TIMESTAMP WITH TIME ZONE;

-- Step 13: Enable RLS (Row Level Security)
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_status ENABLE ROW LEVEL SECURITY;

-- Step 14: Create RLS Policies for conversations
CREATE POLICY "Users can view their own conversations" ON public.conversations
  FOR SELECT USING (auth.uid() = participant1_id OR auth.uid() = participant2_id);

CREATE POLICY "Users can create conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = participant1_id OR auth.uid() = participant2_id);

-- Step 15: Create RLS Policies for messages
CREATE POLICY "Users can view messages in their conversations" ON public.messages
  FOR SELECT USING (
    auth.uid() = sender_id OR auth.uid() = receiver_id
  );

CREATE POLICY "Users can send messages" ON public.messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their received messages" ON public.messages
  FOR UPDATE USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE POLICY "Users can delete their own messages" ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);

-- Step 16: Create RLS Policies for reactions
CREATE POLICY "Users can view all reactions" ON public.message_reactions
  FOR SELECT USING (true);

CREATE POLICY "Users can add reactions" ON public.message_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reactions" ON public.message_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- Step 17: Create RLS Policies for typing status
CREATE POLICY "Users can view typing status in their conversations" ON public.typing_status
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = typing_status.conversation_id
      AND (participant1_id = auth.uid() OR participant2_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own typing status" ON public.typing_status
  FOR ALL USING (auth.uid() = user_id);

-- Step 18: Add helpful comments
COMMENT ON TABLE public.conversations IS 'Direct message conversations between two users';
COMMENT ON TABLE public.messages IS 'Individual messages in conversations';
COMMENT ON TABLE public.message_reactions IS 'Emoji reactions on messages';
COMMENT ON TABLE public.typing_status IS 'Real-time typing indicators';

-- Success!
SELECT 
  '✅ Messaging system created successfully!' as status,
  (SELECT COUNT(*) FROM public.conversations) as conversations_count,
  (SELECT COUNT(*) FROM public.messages) as messages_count;

