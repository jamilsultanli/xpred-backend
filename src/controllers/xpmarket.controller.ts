import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, ValidationError, InsufficientFundsError, ForbiddenError } from '../utils/errors';
import { z } from 'zod';

// Get all XP Market items
export const getMarketItems = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type } = req.query;

    let query = supabaseAdmin
      .from('xp_market_items')
      .select('*')
      .eq('is_active', true)
      .order('cost_xp', { ascending: true });

    if (type && typeof type === 'string') {
      query = query.eq('type', type);
    }

    const { data: items, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      items: items || [],
    });
  } catch (error) {
    next(error);
  }
};

// Purchase an item from XP Market
const purchaseItemSchema = z.object({
  item_id: z.string().uuid(),
});

export const purchaseItem = async (
  req: Request<{}, {}, z.infer<typeof purchaseItemSchema>>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { item_id } = purchaseItemSchema.parse(req.body);

    // Get item details
    const { data: item, error: itemError } = await supabaseAdmin
      .from('xp_market_items')
      .select('*')
      .eq('id', item_id)
      .eq('is_active', true)
      .single();

    if (itemError || !item) {
      throw new NotFoundError('Market item');
    }

    // Get user profile with balance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, title, grey_tick, avatar_frame')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      throw new NotFoundError('User profile');
    }

    // Check if user already owns this item
    const { data: existingPurchase } = await supabaseAdmin
      .from('user_purchases')
      .select('id')
      .eq('user_id', req.user.id)
      .eq('item_id', item_id)
      .maybeSingle();

    if (existingPurchase) {
      throw new ValidationError('You already own this item');
    }

    // Check balance
    if (profile.balance_xp < item.cost_xp) {
      throw new InsufficientFundsError('XP');
    }

    // Start transaction
    const newBalance = profile.balance_xp - item.cost_xp;
    const updates: any = { balance_xp: newBalance };

    // Apply item based on type
    if (item.type === 'title') {
      updates.title = item.name;
    } else if (item.type === 'grey_tick') {
      updates.grey_tick = true;
    } else if (item.type === 'avatar_frame') {
      updates.avatar_frame = item.metadata?.frame_type || item.name.toLowerCase().replace(' ', '_');
    }

    // Update profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id);

    if (updateError) {
      throw updateError;
    }

    // Record purchase
    const { error: purchaseError } = await supabaseAdmin
      .from('user_purchases')
      .insert({
        user_id: req.user.id,
        item_id: item.id,
        item_type: item.type,
        cost_xp: item.cost_xp,
      });

    if (purchaseError) {
      throw purchaseError;
    }

    // Create transaction record
    await supabaseAdmin.from('transactions').insert({
      user_id: req.user.id,
      amount: -item.cost_xp,
      currency: 'XP',
      type: 'purchase',
      description: `Purchased ${item.name} from XP Market`,
    });

    res.json({
      success: true,
      message: `Successfully purchased ${item.name}`,
      new_balance_xp: newBalance,
    });
  } catch (error) {
    next(error);
  }
};

// Get user's purchased items
export const getUserPurchases = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: purchases, error } = await supabaseAdmin
      .from('user_purchases')
      .select(`
        *,
        xp_market_items (*)
      `)
      .eq('user_id', req.user.id)
      .order('purchased_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      purchases: purchases || [],
    });
  } catch (error) {
    next(error);
  }
};

// Auto-assign titles based on user stats
export const assignAutoTitles = async (
  userId: string
): Promise<void> => {
  try {
    // Get user stats - we need to calculate predictions_count and win_rate
    const { data: predictions } = await supabaseAdmin
      .from('predictions')
      .select('id, outcome')
      .eq('creator_id', userId);

    const predictionsCount = predictions?.length || 0;
    const wonPredictions = predictions?.filter(p => p.outcome === 'yes' || p.outcome === 'no').length || 0;
    const winRate = predictionsCount > 0 ? wonPredictions / predictionsCount : 0;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, title')
      .eq('id', userId)
      .single();

    if (!profile || profile.title) {
      return; // Already has a title or profile not found
    }

    // Auto-assign titles based on stats
    let assignedTitle: string | null = null;

    if (winRate >= 0.8 && predictionsCount >= 50) {
      assignedTitle = 'Top Predictor';
    } else if (profile.balance_xp >= 100000) {
      assignedTitle = 'Prediction Pro';
    } else if (predictionsCount >= 100) {
      assignedTitle = 'Future Seer';
    } else if (winRate >= 0.7 && predictionsCount >= 20) {
      assignedTitle = 'Market Master';
    } else if (predictionsCount >= 50) {
      assignedTitle = 'Data Wizard';
    } else if (profile.balance_xp >= 50000) {
      assignedTitle = 'Crypto Guru';
    }

    if (assignedTitle) {
      await supabaseAdmin
        .from('profiles')
        .update({ title: assignedTitle })
        .eq('id', userId);
    }
  } catch (error) {
    console.error('Error assigning auto title:', error);
  }
};

