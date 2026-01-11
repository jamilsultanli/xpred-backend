-- Add missing columns to profiles table
-- This migration adds is_banned and role columns if they don't exist

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

-- Create index on is_banned for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles(is_banned);

-- Create index on role for faster queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

COMMENT ON COLUMN public.profiles.role IS 'User role: user, admin, or moderator';
COMMENT ON COLUMN public.profiles.is_banned IS 'Whether the user account is banned';

