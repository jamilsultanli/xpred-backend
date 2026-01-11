import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, ForbiddenError, ValidationError, KYCRequiredError, InsufficientFundsError } from '../utils/errors';
import { PurchaseBundleDto, ExchangeDto, WithdrawalRequestDto } from '../models/wallet.types';
import { paymentService } from '../services/payment.service';

// Predefined bundles
const BUNDLES: Record<string, { cost: number; xp: number; xc: number }> = {
  b1: { cost: 4.99, xp: 5000, xc: 5 },
  b2: { cost: 9.99, xp: 12000, xc: 15 },
  b3: { cost: 19.99, xp: 25000, xc: 35 },
  b4: { cost: 49.99, xp: 75000, xc: 100 },
};

export const getBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, balance_xc')
      .eq('id', req.user.id)
      .single();

    if (error || !profile) {
      throw new NotFoundError('User profile');
    }

    res.json({
      success: true,
      balance: {
        balance_xp: profile.balance_xp,
        balance_xc: profile.balance_xc,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getTransactions = async (
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
    const type = req.query.type as string;
    const currency = req.query.currency as string;
    const startDate = req.query.start_date as string;
    const endDate = req.query.end_date as string;

    let query = supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    // Apply filters
    if (type && type !== 'all') {
      query = query.eq('type', type);
    }

    if (currency && (currency === 'XP' || currency === 'XC')) {
      query = query.eq('currency', currency);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: transactions, error, count } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      transactions: transactions || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const purchaseBundle = async (
  req: Request<{}, {}, PurchaseBundleDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { bundle_id, payment_method, payment_token, payment_intent_id } = req.body;

    // Get bundle
    const bundle = BUNDLES[bundle_id];
    if (!bundle) {
      throw new NotFoundError('Bundle');
    }

    // Verify payment
    if (payment_method === 'stripe') {
      if (!paymentService.isConfigured()) {
        throw new ValidationError('Stripe payment is not configured');
      }

      if (payment_intent_id) {
        // Confirm payment intent
        const paymentIntent = await paymentService.confirmPaymentIntent(payment_intent_id);
        
        if (paymentIntent.status !== 'succeeded') {
          throw new ValidationError('Payment not completed');
        }

        // Verify amount matches bundle cost
        const paidAmount = paymentIntent.amount / 100; // Convert from cents
        if (Math.abs(paidAmount - bundle.cost) > 0.01) {
          throw new ValidationError('Payment amount does not match bundle cost');
        }
      } else {
        throw new ValidationError('Payment intent ID is required for Stripe');
      }
    } else {
      // PayPal or other payment methods would be handled here
      throw new ValidationError('Payment method not yet implemented');
    }

    // Add funds to user account
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, balance_xc')
      .eq('id', req.user.id)
      .single();

    if (!profile) {
      throw new NotFoundError('User profile');
    }

    // Update balances
    await supabaseAdmin
      .from('profiles')
      .update({
        balance_xp: profile.balance_xp + bundle.xp,
        balance_xc: profile.balance_xc + bundle.xc,
      })
      .eq('id', req.user.id);

    // Create transaction records
    await supabaseAdmin.from('transactions').insert([
      {
        user_id: req.user.id,
        amount: bundle.xp,
        currency: 'XP',
        type: 'deposit',
        description: `Bundle purchase: ${bundle.xp.toLocaleString()} XP + ${bundle.xc} XC Bonus`,
      },
      {
        user_id: req.user.id,
        amount: bundle.xc,
        currency: 'XC',
        type: 'bonus',
        description: `Bundle bonus: ${bundle.xc} XC`,
      },
    ]);

    // Get updated balance
    const { data: updatedProfile } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, balance_xc')
      .eq('id', req.user.id)
      .single();

    res.json({
      success: true,
      message: 'Bundle purchased successfully',
      transaction: {
        xp_added: bundle.xp,
        xc_added: bundle.xc,
        cost: bundle.cost,
      },
      updated_balance: {
        balance_xp: updatedProfile?.balance_xp || 0,
        balance_xc: updatedProfile?.balance_xc || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createPaymentIntent = async (
  req: Request<{}, {}, { bundle_id: string }>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { bundle_id } = req.body;

    const bundle = BUNDLES[bundle_id];
    if (!bundle) {
      throw new NotFoundError('Bundle');
    }

    if (!paymentService.isConfigured()) {
      throw new ValidationError('Stripe payment is not configured');
    }

    const paymentIntent = await paymentService.createPaymentIntent(
      bundle.cost,
      'usd',
      {
        user_id: req.user.id,
        bundle_id: bundle_id,
        xp_amount: bundle.xp.toString(),
        xc_amount: bundle.xc.toString(),
      }
    );

    res.json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: bundle.cost,
    });
  } catch (error) {
    next(error);
  }
};

export const exchangeXPtoXC = async (
  req: Request<{}, {}, ExchangeDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { amount_xp, exchange_rate } = req.body;

    if (amount_xp <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    // Default exchange rate: 100 XP = 1 XC
    const rate = exchange_rate || 100;
    const xc_received = amount_xp / rate;

    // Check user balance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, balance_xc')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      throw new NotFoundError('User profile');
    }

    if (profile.balance_xp < amount_xp) {
      throw new InsufficientFundsError('XP');
    }

    // Update balances
    await supabaseAdmin
      .from('profiles')
      .update({
        balance_xp: profile.balance_xp - amount_xp,
        balance_xc: profile.balance_xc + xc_received,
      })
      .eq('id', req.user.id);

    // Create transaction records
    await supabaseAdmin.from('transactions').insert([
      {
        user_id: req.user.id,
        amount: amount_xp,
        currency: 'XP',
        type: 'withdrawal',
        description: `Exchanged ${amount_xp} XP for ${xc_received.toFixed(2)} XC`,
      },
      {
        user_id: req.user.id,
        amount: xc_received,
        currency: 'XC',
        type: 'deposit',
        description: `Received ${xc_received.toFixed(2)} XC from XP exchange`,
      },
    ]);

    // Get updated balance
    const { data: updatedProfile } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, balance_xc')
      .eq('id', req.user.id)
      .single();

    res.json({
      success: true,
      exchanged: {
        xp_spent: amount_xp,
        xc_received: xc_received,
        exchange_rate: rate,
      },
      updated_balance: {
        balance_xp: updatedProfile?.balance_xp || 0,
        balance_xc: updatedProfile?.balance_xc || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const requestWithdrawal = async (
  req: Request<{}, {}, WithdrawalRequestDto>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { amount, currency, withdrawal_method, account_details } = req.body;

    if (currency !== 'XC') {
      throw new ValidationError('Only XC can be withdrawn');
    }

    if (amount <= 0) {
      throw new ValidationError('Amount must be greater than 0');
    }

    // Check if user is verified (KYC)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('balance_xc, is_verified')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      throw new NotFoundError('User profile');
    }

    if (!profile.is_verified) {
      throw new KYCRequiredError();
    }

    if (profile.balance_xc < amount) {
      throw new InsufficientFundsError('XC');
    }

    // For now, we'll just create a transaction record with type 'withdrawal'
    // In a full implementation, this would create a withdrawal request table entry
    // and hold the funds until admin approval

    // Create withdrawal transaction (pending)
    await supabaseAdmin.from('transactions').insert({
      user_id: req.user.id,
      amount: amount,
      currency: 'XC',
      type: 'withdrawal',
      description: `Withdrawal request via ${withdrawal_method} - Pending admin approval`,
    });

    // Note: In production, you would:
    // 1. Create a withdrawal_requests table entry
    // 2. Hold the funds (deduct from balance but mark as pending)
    // 3. Require admin approval before processing

    res.json({
      success: true,
      message: 'Withdrawal request submitted for review',
      withdrawal: {
        amount: amount,
        currency: currency,
        method: withdrawal_method,
        status: 'pending',
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getBundles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const bundles = Object.entries(BUNDLES).map(([id, bundle]) => ({
      id,
      ...bundle,
      active: true,
    }));

    res.json({
      success: true,
      bundles,
    });
  } catch (error) {
    next(error);
  }
};


