-- Add title, grey_tick, blue_tick, avatar_frame columns to profiles table
DO $$
BEGIN
    -- Add title column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'title'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN title VARCHAR(100);
    END IF;

    -- Add grey_tick column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'grey_tick'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN grey_tick BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add blue_tick column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'blue_tick'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN blue_tick BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add avatar_frame column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'avatar_frame'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN avatar_frame VARCHAR(50);
    END IF;

    -- Add blue_tick_subscription_end column for subscription expiry
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'blue_tick_subscription_end'
    ) THEN
        ALTER TABLE public.profiles
        ADD COLUMN blue_tick_subscription_end TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create XP Market items table
CREATE TABLE IF NOT EXISTS public.xp_market_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('title', 'avatar_frame', 'grey_tick')),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    cost_xp INTEGER NOT NULL,
    image_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user purchases table
CREATE TABLE IF NOT EXISTS public.user_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.xp_market_items(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL,
    cost_xp INTEGER NOT NULL,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, item_id)
);

-- Create blue tick subscriptions table
CREATE TABLE IF NOT EXISTS public.blue_tick_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'expired', 'past_due')),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_purchases_user_id ON public.user_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_user_purchases_item_id ON public.user_purchases(item_id);
CREATE INDEX IF NOT EXISTS idx_xp_market_items_type ON public.xp_market_items(type);
CREATE INDEX IF NOT EXISTS idx_xp_market_items_active ON public.xp_market_items(is_active);
CREATE INDEX IF NOT EXISTS idx_blue_tick_subscriptions_user_id ON public.blue_tick_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_blue_tick_subscriptions_status ON public.blue_tick_subscriptions(status);

-- Insert default titles
INSERT INTO public.xp_market_items (type, name, description, cost_xp, metadata) VALUES
    ('title', 'Top Predictor', 'Proven track record of accurate predictions', 50000, '{"color": "#FFD700"}'),
    ('title', 'Crypto Guru', 'Expert in cryptocurrency predictions', 30000, '{"color": "#FF6B35"}'),
    ('title', 'Tech Visionary', 'Forward-thinking technology predictor', 25000, '{"color": "#4ECDC4"}'),
    ('title', 'Sports Analyst', 'Master of sports predictions', 20000, '{"color": "#45B7D1"}'),
    ('title', 'Market Master', 'Skilled in market trend predictions', 40000, '{"color": "#96CEB4"}'),
    ('title', 'Prediction Pro', 'Professional predictor with high accuracy', 35000, '{"color": "#FFEAA7"}'),
    ('title', 'Future Seer', 'Exceptional at seeing future trends', 45000, '{"color": "#DDA15E"}'),
    ('title', 'Data Wizard', 'Expert in data-driven predictions', 30000, '{"color": "#A8E6CF"}')
ON CONFLICT DO NOTHING;

-- Insert default avatar frames
INSERT INTO public.xp_market_items (type, name, description, cost_xp, metadata) VALUES
    ('avatar_frame', 'Gold Frame', 'Elegant gold border for your profile picture', 15000, '{"frame_type": "gold", "border_width": 4}'),
    ('avatar_frame', 'Silver Frame', 'Classic silver border for your profile picture', 10000, '{"frame_type": "silver", "border_width": 4}'),
    ('avatar_frame', 'Rainbow Frame', 'Colorful rainbow border for your profile picture', 20000, '{"frame_type": "rainbow", "border_width": 5}'),
    ('avatar_frame', 'Diamond Frame', 'Premium diamond-studded border', 30000, '{"frame_type": "diamond", "border_width": 6}'),
    ('avatar_frame', 'Neon Frame', 'Glowing neon border effect', 25000, '{"frame_type": "neon", "border_width": 4}')
ON CONFLICT DO NOTHING;

-- Insert grey tick
INSERT INTO public.xp_market_items (type, name, description, cost_xp, metadata) VALUES
    ('grey_tick', 'Grey Verification Badge', 'Verified account badge', 50000, '{"badge_type": "grey"}')
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN public.profiles.title IS 'User title/rank displayed on profile';
COMMENT ON COLUMN public.profiles.grey_tick IS 'Grey verification badge (purchased with XP)';
COMMENT ON COLUMN public.profiles.blue_tick IS 'Blue verification badge (subscription-based)';
COMMENT ON COLUMN public.profiles.avatar_frame IS 'Avatar frame type purchased from XP Market';
COMMENT ON COLUMN public.profiles.blue_tick_subscription_end IS 'Blue tick subscription expiry date';

