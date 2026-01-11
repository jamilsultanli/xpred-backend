import { supabaseAdmin } from '../config/supabase';

/**
 * Creates a user profile using a database function to bypass RLS
 * This is more reliable than direct inserts when using service role key
 */
export async function createUserProfile(userId: string, email: string, metadata?: any) {
  try {
    // First, try to get existing profile
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (existing) {
      return { success: true, profile: existing };
    }

    // Generate a unique username
    const baseUsername = email?.split('@')[0] || `user_${userId.substring(0, 8)}`;
    let username = baseUsername;
    let attempts = 0;

    // Check if username is taken and generate a unique one
    while (attempts < 10) {
      const { data: existingUsername } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', username)
        .single();

      if (!existingUsername) break;
      username = `${baseUsername}_${attempts + 1}`;
      attempts++;
    }

    // Try using RPC function first (more reliable, bypasses RLS)
    try {
      const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('create_user_profile', {
        p_user_id: userId,
        p_email: email || '',
        p_username: username,
        p_full_name: metadata?.full_name || email?.split('@')[0] || '',
        p_avatar_url: metadata?.avatar_url || null,
      });

      if (!rpcError && rpcData) {
        console.log('[PROFILE HELPER] Profile created via RPC function');
        // RPC returns JSON, parse it if it's a string
        const profile = typeof rpcData === 'string' ? JSON.parse(rpcData) : rpcData;
        return { success: true, profile };
      }
      
      // If RPC doesn't exist or fails, fall back to direct insert
      if (rpcError) {
        console.log('[PROFILE HELPER] RPC function not available or failed, trying direct insert:', rpcError.message);
      }
    } catch (rpcErr: any) {
      console.log('[PROFILE HELPER] RPC function call failed, trying direct insert:', rpcErr?.message || rpcErr);
    }

    // Fallback: Try direct insert (service role should bypass RLS)
    const { data: newProfile, error: createError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        email: email || '',
        username: username,
        full_name: metadata?.full_name || email?.split('@')[0] || '',
        avatar_url: metadata?.avatar_url || null,
        balance_xp: 1000,
        balance_xc: 0.00,
        role: 'user',
        is_banned: false,
      })
      .select('*')
      .single();

    if (createError) {
      // Log detailed error information
      console.error('[PROFILE HELPER] Direct insert failed:', {
        code: createError.code,
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
        userId,
        username,
      });
      throw new Error(`Failed to create profile: ${createError.message || 'Unknown error'}. Code: ${createError.code || 'N/A'}. Details: ${createError.details || 'N/A'}`);
    }

    if (!newProfile) {
      // If insert succeeded but no profile returned, wait a bit and try fetching it
      console.log('[PROFILE HELPER] Insert succeeded but no profile returned, waiting and fetching...');
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for consistency
      
      const { data: fetchedProfile, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (fetchError || !fetchedProfile) {
        console.error('[PROFILE HELPER] Failed to fetch created profile:', {
          error: fetchError,
          code: fetchError?.code,
          message: fetchError?.message,
          userId,
        });
        throw new Error(`Profile was created but could not be retrieved: ${fetchError?.message || 'Not found'}`);
      }
      
      console.log('[PROFILE HELPER] Profile fetched successfully after insert');
      return { success: true, profile: fetchedProfile };
    }

    console.log('[PROFILE HELPER] Profile created and returned successfully');
    return { success: true, profile: newProfile };
  } catch (error: any) {
    console.error('[PROFILE HELPER] Error creating profile:', error);
    throw error;
  }
}

