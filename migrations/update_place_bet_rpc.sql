-- Update place_bet RPC function to accept user_id parameter
-- This is needed because auth.uid() is null when called from backend using supabaseAdmin

-- First, ensure XC columns exist in predictions table
ALTER TABLE public.predictions 
ADD COLUMN IF NOT EXISTS total_pot_xc numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS yes_pool_xc numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS no_pool_xc numeric DEFAULT 0;

-- Update the RPC function
CREATE OR REPLACE FUNCTION place_bet(
  p_user_id uuid,
  p_prediction_id uuid,
  p_amount numeric,
  p_currency text,
  p_choice text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_balance numeric;
  v_prediction record;
  v_total_pot numeric;
  v_winning_pool numeric;
  v_multiplier numeric;
BEGIN
  -- 1. Check Balance
  IF p_currency = 'XP' THEN
    SELECT balance_xp INTO v_user_balance FROM public.profiles WHERE id = p_user_id;
  ELSE
    SELECT balance_xc INTO v_user_balance FROM public.profiles WHERE id = p_user_id;
  END IF;

  IF v_user_balance IS NULL OR v_user_balance < p_amount THEN
    RETURN json_build_object('success', false, 'message', 'Insufficient funds');
  END IF;

  -- 2. Get current prediction state
  SELECT * INTO v_prediction FROM public.predictions WHERE id = p_prediction_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Prediction not found');
  END IF;

  IF v_prediction.is_resolved THEN
    RETURN json_build_object('success', false, 'message', 'Prediction is already resolved');
  END IF;

  -- 3. Calculate multiplier before updating pools
  -- Multiplier = Total Prize Pool / Total Winning Stake
  -- Total Prize Pool = current_total_pot + new_bet_amount
  -- Total Winning Stake = current_winning_pool + new_bet_amount
  IF p_currency = 'XP' THEN
    v_total_pot := v_prediction.total_pot_xp + p_amount;
    IF p_choice = 'yes' THEN
      v_winning_pool := v_prediction.yes_pool_xp + p_amount;
    ELSE
      v_winning_pool := v_prediction.no_pool_xp + p_amount;
    END IF;
  ELSE
    v_total_pot := v_prediction.total_pot_xc + p_amount;
    IF p_choice = 'yes' THEN
      v_winning_pool := v_prediction.yes_pool_xc + p_amount;
    ELSE
      v_winning_pool := v_prediction.no_pool_xc + p_amount;
    END IF;
  END IF;

  -- Calculate multiplier: Total Pot / Winning Pool
  IF v_winning_pool > 0 THEN
    v_multiplier := v_total_pot / v_winning_pool;
  ELSE
    -- Edge case: first bet on this side, multiplier is total pot / bet amount
    v_multiplier := v_total_pot / p_amount;
  END IF;

  -- 4. Deduct Balance
  IF p_currency = 'XP' THEN
    UPDATE public.profiles SET balance_xp = balance_xp - p_amount WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles SET balance_xc = balance_xc - p_amount WHERE id = p_user_id;
  END IF;

  -- 5. Insert Bet with multiplier
  INSERT INTO public.bets (user_id, prediction_id, amount, currency, choice, multiplier_at_bet)
  VALUES (p_user_id, p_prediction_id, p_amount, p_currency, p_choice, v_multiplier);

  -- 6. Update Prediction Pools
  IF p_currency = 'XP' THEN
    UPDATE public.predictions 
    SET 
        total_pot_xp = total_pot_xp + p_amount,
        yes_pool_xp = CASE WHEN p_choice = 'yes' THEN yes_pool_xp + p_amount ELSE yes_pool_xp END,
        no_pool_xp = CASE WHEN p_choice = 'no' THEN no_pool_xp + p_amount ELSE no_pool_xp END
    WHERE id = p_prediction_id;
  ELSE
    UPDATE public.predictions 
    SET 
        total_pot_xc = total_pot_xc + p_amount,
        yes_pool_xc = CASE WHEN p_choice = 'yes' THEN yes_pool_xc + p_amount ELSE yes_pool_xc END,
        no_pool_xc = CASE WHEN p_choice = 'no' THEN no_pool_xc + p_amount ELSE no_pool_xc END
    WHERE id = p_prediction_id;
  END IF;

  RETURN json_build_object('success', true, 'message', 'Bet placed successfully', 'multiplier', v_multiplier);
END;
$$;

