-- Add multiplier_at_bet column to bets table
-- This stores the multiplier at the time the bet was placed
ALTER TABLE public.bets 
ADD COLUMN IF NOT EXISTS multiplier_at_bet numeric;

-- Optional: Per-market bet limits
ALTER TABLE public.predictions
ADD COLUMN IF NOT EXISTS min_bet_amount_xp numeric DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_bet_amount_xp numeric,
ADD COLUMN IF NOT EXISTS min_bet_amount_xc numeric DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_bet_amount_xc numeric;

