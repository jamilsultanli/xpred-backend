-- Add notification preferences column to profiles table
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles' 
        AND column_name = 'notification_preferences'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN notification_preferences jsonb DEFAULT '{
            "likes": true,
            "comments": true,
            "reposts": true,
            "follows": true,
            "wins": true,
            "mentions": true
        }'::jsonb;
    END IF;
END $$;

COMMENT ON COLUMN public.profiles.notification_preferences IS 'User notification preferences stored as JSON';

