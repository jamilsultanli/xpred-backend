import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import {
  NotFoundError,
  ForbiddenError,
  InsufficientFundsError,
  PredictionResolvedError,
  ValidationError,
} from '../utils/errors';
import { PlaceBetDto } from '../models/bet.types';

export const placeBet = async (
  req: Request<{}, {}, PlaceBetDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { prediction_id, amount, currency, choice } = req.body;

    // Import config for bet limits
    const { config } = await import('../config/env');

    // Validate amount
    if (amount <= 0) {
      throw new ValidationError('Bet amount must be greater than 0');
    }

    // Validate min/max bet amounts
    const minAmount = currency === 'XP' ? config.MIN_BET_AMOUNT_XP : config.MIN_BET_AMOUNT_XC;
    const maxAmount = currency === 'XP' ? config.MAX_BET_AMOUNT_XP : config.MAX_BET_AMOUNT_XC;

    if (amount < minAmount) {
      throw new ValidationError(`Bet amount must be at least ${minAmount} ${currency}`);
    }

    if (amount > maxAmount) {
      throw new ValidationError(`Bet amount cannot exceed ${maxAmount} ${currency}`);
    }

    // Check if prediction exists and is active
    const { data: prediction, error: predError } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('id', prediction_id)
      .single();

    if (predError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    if (prediction.is_resolved) {
      throw new PredictionResolvedError();
    }

    // Check if deadline has passed
    if (new Date(prediction.deadline) < new Date()) {
      throw new ValidationError('Cannot place bet after deadline');
    }

    // Check user balance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`balance_${currency.toLowerCase()}`)
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      throw new NotFoundError('User profile');
    }

    const balance = currency === 'XP' ? (profile as any).balance_xp : (profile as any).balance_xc;
    if (balance < amount) {
      throw new InsufficientFundsError(currency);
    }

    // Use RPC function to place bet (atomic operation)
    // Note: RPC function needs user_id parameter since auth.uid() is null when called from backend
    const { data: betResult, error: betError } = await supabaseAdmin.rpc('place_bet', {
      p_user_id: req.user.id,
      p_prediction_id: prediction_id,
      p_amount: amount,
      p_currency: currency,
      p_choice: choice,
    });

    if (betError) {
      throw new ValidationError(`Failed to place bet: ${betError.message}`);
    }

    if (!betResult || !betResult.success) {
      throw new ValidationError(betResult?.message || 'Failed to place bet');
    }

    // Get the created bet
    const { data: bet } = await supabaseAdmin
      .from('bets')
      .select('*')
      .eq('prediction_id', prediction_id)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Create transaction record
    await supabaseAdmin.from('transactions').insert({
      user_id: req.user.id,
      amount: amount,
      currency: currency,
      type: 'bet_placed',
      description: `Bet on prediction: ${prediction.question.substring(0, 50)}...`,
    });

    // Get updated balance
    const { data: updatedProfile } = await supabaseAdmin
      .from('profiles')
      .select(`balance_${currency.toLowerCase()}` as any)
      .eq('id', req.user.id)
      .single();

    // Get multiplier from RPC result or bet record
    // RPC function returns multiplier in the result
    let multiplier = 0;
    if (betResult.multiplier) {
      multiplier = betResult.multiplier;
    } else if (bet?.multiplier_at_bet) {
      multiplier = bet.multiplier_at_bet;
    } else {
      // Calculate multiplier from current pools if not available
      const currencyLower = currency.toLowerCase();
      const totalPot = currencyLower === 'xp' ? (prediction.total_pot_xp || 0) : (prediction.total_pot_xc || 0);
      const winningPool = choice === 'yes' 
        ? (currencyLower === 'xp' ? (prediction.yes_pool_xp || 0) : (prediction.yes_pool_xc || 0))
        : (currencyLower === 'xp' ? (prediction.no_pool_xp || 0) : (prediction.no_pool_xc || 0));
      
      // Multiplier = Total Pot / Winning Pool (after adding this bet)
      const newWinningPool = winningPool + amount;
      multiplier = newWinningPool > 0 ? (totalPot + amount) / newWinningPool : 1.5;
    }
    
    // Calculate payout using multiplier
    const potentialPayout = amount * multiplier;
    
    // Calculate platform fee and user receives
    const platformFee = potentialPayout * config.PLATFORM_FEE_RATE;
    const youReceive = potentialPayout - platformFee;

    res.status(201).json({
      success: true,
      bet: {
        ...bet,
        potential_payout: potentialPayout,
      },
      multiplier: multiplier,
      potential_payout: potentialPayout,
      platform_fee: platformFee,
      you_receive: youReceive,
      updated_balance: {
        [`balance_${currency.toLowerCase()}`]: currency === 'XP'
          ? (updatedProfile as any)?.balance_xp
          : (updatedProfile as any)?.balance_xc,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getBets = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = (req.query.status as string) || 'all';
    const currency = req.query.currency as string;

    let query = supabaseAdmin
      .from('bets')
      .select(`
        *,
        prediction:predictions!prediction_id(
          id,
          question,
          deadline,
          is_resolved,
          outcome
        )
      `, { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    // Apply currency filter
    if (currency && (currency === 'XP' || currency === 'XC')) {
      query = query.eq('currency', currency);
    }

    const { data: bets, error, count } = await query;

    if (error) {
      throw error;
    }

    // Filter by status and calculate stats
    let filteredBets = bets || [];
    if (status !== 'all') {
      filteredBets = filteredBets.filter((bet: any) => {
        const pred = bet.prediction;
        if (!pred) return false;

        if (status === 'active') {
          return !pred.is_resolved;
        } else if (status === 'won') {
          return pred.is_resolved && pred.outcome === (bet.choice === 'yes');
        } else if (status === 'lost') {
          return pred.is_resolved && pred.outcome !== (bet.choice === 'yes');
        } else if (status === 'pending') {
          return !pred.is_resolved;
        }
        return true;
      });
    }

    // Calculate stats
    const allBets = bets || [];
    const activeBets = allBets.filter((b: any) => !b.prediction?.is_resolved).length;
    const wonBets = allBets.filter((b: any) => 
      b.prediction?.is_resolved && b.prediction.outcome === (b.choice === 'yes')
    ).length;
    const lostBets = allBets.filter((b: any) => 
      b.prediction?.is_resolved && b.prediction.outcome !== (b.choice === 'yes')
    ).length;

    // Calculate total winnings and wagered
    const { data: allUserBets } = await supabaseAdmin
      .from('bets')
      .select('amount, currency, choice, prediction:predictions!prediction_id(is_resolved, outcome)')
      .eq('user_id', req.user.id);

    let totalWinnings = 0;
    let totalWagered = 0;

    (allUserBets || []).forEach((bet: any) => {
      totalWagered += bet.amount;
      if (bet.prediction?.is_resolved && bet.prediction.outcome === (bet.choice === 'yes')) {
        // Estimate winnings (simplified - actual would need payout calculation)
        totalWinnings += bet.amount * 1.5; // Rough estimate
      }
    });

    res.json({
      success: true,
      bets: filteredBets,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
      stats: {
        total_bets: allBets.length,
        active_bets: activeBets,
        won_bets: wonBets,
        lost_bets: lostBets,
        total_winnings: totalWinnings,
        total_wagered: totalWagered,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getBet = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    const { data: bet, error } = await supabaseAdmin
      .from('bets')
      .select(`
        *,
        prediction:predictions!prediction_id(*)
      `)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !bet) {
      throw new NotFoundError('Bet');
    }

    res.json({
      success: true,
      bet,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelBet = async (
  req: Request<{ id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { id } = req.params;

    // Get bet
    const { data: bet, error: betError } = await supabaseAdmin
      .from('bets')
      .select(`
        *,
        prediction:predictions!prediction_id(deadline, is_resolved)
      `)
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (betError || !bet) {
      throw new NotFoundError('Bet');
    }

    // Check if bet can be cancelled
    if (bet.prediction?.is_resolved) {
      throw new ValidationError('Cannot cancel bet on resolved prediction');
    }

    // Check if deadline has passed (allow cancellation within a window)
    const deadline = new Date(bet.prediction?.deadline || '');
    const now = new Date();
    const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilDeadline < 1) {
      throw new ValidationError('Cannot cancel bet less than 1 hour before deadline');
    }

    // Refund bet amount
    const balanceField = bet.currency === 'XP' ? 'balance_xp' : 'balance_xc';
    
    // Get current balance and update
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(balanceField)
      .eq('id', req.user.id)
      .single();

    const currentBalance = (profile as any)?.[balanceField] || 0;
    await supabaseAdmin
      .from('profiles')
      .update({ [balanceField]: currentBalance + bet.amount })
      .eq('id', req.user.id);

    // Update prediction pools
    const poolField = bet.choice === 'yes'
      ? (bet.currency === 'XP' ? 'yes_pool_xp' : 'yes_pool_xc')
      : (bet.currency === 'XP' ? 'no_pool_xp' : 'no_pool_xc');
    const totalPotField = bet.currency === 'XP' ? 'total_pot_xp' : 'total_pot_xc';

    const { data: prediction } = await supabaseAdmin
      .from('predictions')
      .select(poolField + ',' + totalPotField)
      .eq('id', bet.prediction_id)
      .single();

    if (prediction) {
      await supabaseAdmin
        .from('predictions')
        .update({
          [poolField]: Math.max(0, ((prediction as any)[poolField] || 0) - bet.amount),
          [totalPotField]: Math.max(0, ((prediction as any)[totalPotField] || 0) - bet.amount),
        })
        .eq('id', bet.prediction_id);
    }

    // Delete bet
    await supabaseAdmin.from('bets').delete().eq('id', id);

    // Create transaction record
    await supabaseAdmin.from('transactions').insert({
      user_id: req.user.id,
      amount: bet.amount,
      currency: bet.currency,
      type: 'deposit',
      description: `Bet cancellation refund`,
    });

    res.json({
      success: true,
      message: 'Bet cancelled and refunded',
      refunded_amount: bet.amount,
    });
  } catch (error) {
    next(error);
  }
};

export const getActiveBets = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    // Get all user bets
    const { data: allBets, error: allBetsError } = await supabaseAdmin
      .from('bets')
      .select(`
        *,
        prediction:predictions!prediction_id(
          id,
          question,
          deadline,
          is_resolved,
          outcome,
          total_pot_xp,
          yes_pool_xp,
          no_pool_xp,
          total_pot_xc,
          yes_pool_xc,
          no_pool_xc
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (allBetsError) {
      throw allBetsError;
    }

    // Filter to only active bets (unresolved predictions)
    const activeBets = (allBets || []).filter((bet: any) => 
      bet.prediction && !bet.prediction.is_resolved
    );

    // Calculate current multipliers and potential payout for each bet
    const betsWithDetails = activeBets.map((bet: any) => {
      const pred = bet.prediction;
      const currency = bet.currency.toLowerCase();
      
      // Get current pools based on currency
      const totalPot = currency === 'xp' 
        ? (pred.total_pot_xp || 0) 
        : (pred.total_pot_xc || 0);
      const yesPool = currency === 'xp' 
        ? (pred.yes_pool_xp || 0) 
        : (pred.yes_pool_xc || 0);
      const noPool = currency === 'xp' 
        ? (pred.no_pool_xp || 0) 
        : (pred.no_pool_xc || 0);
      
      // Calculate current multipliers
      const calculateMultiplier = (winningPool: number): number => {
        if (winningPool > 0) {
          return totalPot / winningPool;
        }
        return totalPot + 1; // If no bets on this side
      };
      
      const currentMultiplier = bet.choice === 'yes' 
        ? calculateMultiplier(yesPool)
        : calculateMultiplier(noPool);
      
      // Potential payout = bet amount * multiplier at bet time
      const potentialPayout = bet.amount * (bet.multiplier_at_bet || 1);
      
      // Calculate current odds percentages
      const totalPool = yesPool + noPool;
      const yesPercent = totalPool > 0 ? (yesPool / totalPool) * 100 : 50;
      const noPercent = totalPool > 0 ? (noPool / totalPool) * 100 : 50;
      
      return {
        ...bet,
        currentMultiplier,
        potentialPayout,
        currentOdds: {
          yes: Math.round(yesPercent),
          no: Math.round(noPercent),
        },
      };
    });

    res.json({
      success: true,
      bets: betsWithDetails,
      count: betsWithDetails.length,
    });
  } catch (error) {
    next(error);
  }
};

export const getMultipliers = async (
  req: Request<{ predictionId: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    const { predictionId } = req.params;

    // Get prediction with current pools
    const { data: prediction, error: predError } = await supabaseAdmin
      .from('predictions')
      .select('*')
      .eq('id', predictionId)
      .single();

    if (predError || !prediction) {
      throw new NotFoundError('Prediction');
    }

    // Calculate multipliers for both sides
    // Multiplier = Total Pot / (Winning Pool + 1) for display purposes
    // Using 1 as placeholder for a hypothetical bet
    const calculateMultiplier = (totalPot: number, winningPool: number): number => {
      if (winningPool + 1 > 0) {
        return (totalPot + 1) / (winningPool + 1);
      }
      return totalPot + 1; // If no one has bet on this side yet
    };

    const multipliers = {
      xp: {
        yes: calculateMultiplier(prediction.total_pot_xp || 0, prediction.yes_pool_xp || 0),
        no: calculateMultiplier(prediction.total_pot_xp || 0, prediction.no_pool_xp || 0),
      },
      xc: {
        yes: calculateMultiplier(prediction.total_pot_xc || 0, prediction.yes_pool_xc || 0),
        no: calculateMultiplier(prediction.total_pot_xc || 0, prediction.no_pool_xc || 0),
      },
    };

    res.json({
      success: true,
      multipliers,
    });
  } catch (error) {
    next(error);
  }
};

