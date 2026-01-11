-- Create a function to create user profiles (bypasses RLS)
-- This function should be run in your Supabase SQL editor

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

-- Grant execute permission to authenticated users (though service role bypasses this)
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile(uuid, text, text, text, text) TO service_role;

