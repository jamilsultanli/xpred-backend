-- Complete Database Setup Migration
-- Run this in Supabase SQL Editor to set up all required tables and columns

-- ============================================
-- 1. PROFILES TABLE - Add missing columns
-- ============================================

-- Add role column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN role text DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator'));
    END IF;
END $$;

-- Add is_banned column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'is_banned'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN is_banned boolean DEFAULT false;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ============================================
-- 2. NOTIFICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  actor_id uuid REFERENCES public.profiles(id),
  type text CHECK (type IN ('follow', 'like', 'comment', 'bet_won', 'admin_message')),
  entity_id uuid,
  message text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id_is_read ON public.notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Enable RLS for notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
DO $$ 
BEGIN
    -- Users can view their own notifications
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'notifications' 
        AND policyname = 'Users can view their own notifications'
    ) THEN
        CREATE POLICY "Users can view their own notifications"
          ON public.notifications
          FOR SELECT
          USING (auth.uid() = user_id);
    END IF;

    -- Users can update their own notifications
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'notifications' 
        AND policyname = 'Users can update their own notifications'
    ) THEN
        CREATE POLICY "Users can update their own notifications"
          ON public.notifications
          FOR UPDATE
          USING (auth.uid() = user_id);
    END IF;

    -- Users can delete their own notifications
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'notifications' 
        AND policyname = 'Users can delete their own notifications'
    ) THEN
        CREATE POLICY "Users can delete their own notifications"
          ON public.notifications
          FOR DELETE
          USING (auth.uid() = user_id);
    END IF;
END $$;

-- ============================================
-- 3. CREATE USER PROFILE FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION create_user_profile(
  p_user_id uuid,
  p_email text,
  p_username text,
  p_full_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id uuid;
  v_result json;
BEGIN
  -- Check if profile already exists
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_profile_id IS NOT NULL THEN
    -- Profile already exists, return it
    SELECT row_to_json(p.*) INTO v_result
    FROM public.profiles p
    WHERE p.id = p_user_id;
    
    RETURN v_result;
  END IF;

  -- Create the profile
  INSERT INTO public.profiles (
    id,
    email,
    username,
    full_name,
    avatar_url,
    balance_xp,
    balance_xc,
    role,
    is_banned
  )
  VALUES (
    p_user_id,
    p_email,
    p_username,
    COALESCE(p_full_name, split_part(p_email, '@', 1)),
    p_avatar_url,
    1000,
    0.00,
    'user',
    false
  )
  RETURNING id INTO v_profile_id;

  -- Return the created profile
  SELECT row_to_json(p.*) INTO v_result
  FROM public.profiles p
  WHERE p.id = v_profile_id;

  RETURN v_result;
EXCEPTION
  WHEN unique_violation THEN
    -- Username already exists, try with a suffix
    DECLARE
      v_new_username text;
      v_attempts int := 1;
    BEGIN
      v_new_username := p_username || '_' || v_attempts;
      
      WHILE EXISTS (SELECT 1 FROM public.profiles WHERE username = v_new_username) AND v_attempts < 10 LOOP
        v_attempts := v_attempts + 1;
        v_new_username := p_username || '_' || v_attempts;
      END LOOP;

      INSERT INTO public.profiles (
        id,
        email,
        username,
        full_name,
        avatar_url,
        balance_xp,
        balance_xc,
        role,
        is_banned
      )
      VALUES (
        p_user_id,
        p_email,
        v_new_username,
        COALESCE(p_full_name, split_part(p_email, '@', 1)),
        p_avatar_url,
        1000,
        0.00,
        'user',
        false
      )
      RETURNING id INTO v_profile_id;

      SELECT row_to_json(p.*) INTO v_result
      FROM public.profiles p
      WHERE p.id = v_profile_id;

      RETURN v_result;
    END;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to create profile: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, text) TO service_role;

-- ============================================
-- 4. COMMENTS
-- ============================================

COMMENT ON COLUMN public.profiles.role IS 'User role: user, admin, or moderator';
COMMENT ON COLUMN public.profiles.is_banned IS 'Whether the user account is banned';
COMMENT ON TABLE public.notifications IS 'User notifications for follows, likes, comments, bet wins, and admin messages';

-- ============================================
-- Migration Complete!
-- ============================================

SELECT 'Migration completed successfully!' AS status;

