import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { paymentService } from '../services/payment.service';
import { UnauthorizedError, ValidationError, ForbiddenError } from '../utils/errors';
import { z } from 'zod';

const createPaymentIntentSchema = z.object({
  amount: z.number().min(1, 'Amount must be at least $1'),
  currency: z.string().default('usd'),
  bundle_id: z.string().optional(),
});

export const createPaymentIntent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { amount, currency, bundle_id } = createPaymentIntentSchema.parse(req.body);

    // Create payment intent with Stripe
    const paymentIntent = await paymentService.createPaymentIntent(
      amount,
      currency,
      {
        user_id: req.user.id,
        bundle_id: bundle_id || '',
      }
    );

    res.json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    next(error);
  }
};

export const confirmPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    const { id: paymentIntentId } = req.params;

    // Verify payment intent
    const paymentIntent = await paymentService.confirmPaymentIntent(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new ValidationError('Payment was not completed');
    }

    // Get metadata to determine what to credit
    const metadata = paymentIntent.metadata;
    const amount = paymentIntent.amount / 100; // Convert from cents

    // Calculate XP and XC based on amount (1 USD = 1000 XP, bonus XC)
    const xpAmount = Math.floor(amount * 1000);
    const xcBonus = Math.floor(amount * 1.4); // 1.4 XC per dollar

    // Update user balance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('balance_xp, balance_xc')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      throw new ValidationError('User profile not found');
    }

    // Update balances
    await supabaseAdmin
      .from('profiles')
      .update({
        balance_xp: (profile.balance_xp || 0) + xpAmount,
        balance_xc: (profile.balance_xc || 0) + xcBonus,
      })
      .eq('id', req.user.id);

    // Create transaction record
    await supabaseAdmin.from('transactions').insert([
      {
        user_id: req.user.id,
        amount: xpAmount,
        currency: 'XP',
        type: 'deposit',
        description: `Top-up: $${amount.toFixed(2)} - ${xpAmount} XP`,
      },
      {
        user_id: req.user.id,
        amount: xcBonus,
        currency: 'XC',
        type: 'deposit',
        description: `Top-up bonus: ${xcBonus} XC`,
      },
    ]);

    res.json({
      success: true,
      message: 'Payment confirmed and funds added to account',
      amount: {
        xp: xpAmount,
        xc: xcBonus,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const handleStripeWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }

    const event = await paymentService.verifyWebhookSignature(
      req.body,
      signature
    );

    // Handle payment succeeded event
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as any;
      const userId = paymentIntent.metadata?.user_id;

      if (userId) {
        const amount = paymentIntent.amount / 100;
        const xpAmount = Math.floor(amount * 1000);
        const xcBonus = Math.floor(amount * 1.4);

        // Update balances
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('balance_xp, balance_xc')
          .eq('id', userId)
          .single();

        if (profile) {
          await supabaseAdmin
            .from('profiles')
            .update({
              balance_xp: (profile.balance_xp || 0) + xpAmount,
              balance_xc: (profile.balance_xc || 0) + xcBonus,
            })
            .eq('id', userId);

          // Create transaction records
          await supabaseAdmin.from('transactions').insert([
            {
              user_id: userId,
              amount: xpAmount,
              currency: 'XP',
              type: 'deposit',
              description: `Top-up: $${amount.toFixed(2)} - ${xpAmount} XP`,
            },
            {
              user_id: userId,
              amount: xcBonus,
              currency: 'XC',
              type: 'deposit',
              description: `Top-up bonus: ${xcBonus} XC`,
            },
          ]);
        }
      }
    }

    res.json({ received: true });
    return;
  } catch (error) {
    next(error);
    return;
  }
};

