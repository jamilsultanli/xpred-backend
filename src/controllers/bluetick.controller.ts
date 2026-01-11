import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../config/supabase';
import { NotFoundError, ValidationError, ForbiddenError } from '../utils/errors';
import { z } from 'zod';
import Stripe from 'stripe';
import { config } from '../config/env';

const stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' }) : null;

// Create Blue Tick subscription
const createSubscriptionSchema = z.object({
  price_id: z.string().optional(), // Stripe price ID, defaults to monthly
});

export const createBlueTickSubscription = async (
  req: Request<{}, {}, z.infer<typeof createSubscriptionSchema>>,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    if (!stripe) {
      throw new ValidationError('Stripe is not configured');
    }

    const { price_id } = createSubscriptionSchema.parse(req.body);

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email, blue_tick')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      throw new NotFoundError('User profile');
    }

    // Check if already has active subscription
    const { data: existingSubscription } = await supabaseAdmin
      .from('blue_tick_subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (existingSubscription) {
      throw new ValidationError('You already have an active Blue Tick subscription');
    }

    // Default price ID (should be set in env or config)
    const defaultPriceId = price_id || config.BLUE_TICK_PRICE_ID || 'price_monthly_blue_tick';

    // Create Stripe customer if doesn't exist
    let customerId: string;
    const { data: existingCustomer } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', req.user.id)
      .single();

    if (existingCustomer?.stripe_customer_id) {
      customerId = existingCustomer.stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: profile.email,
        metadata: {
          user_id: req.user.id,
        },
      });
      customerId = customer.id;

      // Save customer ID
      await supabaseAdmin
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', req.user.id);
    }

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: defaultPriceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        user_id: req.user.id,
        type: 'blue_tick',
      },
    });

    // Save subscription to database
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = invoice?.payment_intent as Stripe.PaymentIntent;

    await supabaseAdmin.from('blue_tick_subscriptions').insert({
      user_id: req.user.id,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      status: subscription.status === 'active' ? 'active' : 'past_due',
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: new Date(subscription.current_period_end * 1000),
    });

    // Update profile if subscription is active
    if (subscription.status === 'active') {
      await supabaseAdmin
        .from('profiles')
        .update({
          blue_tick: true,
          blue_tick_subscription_end: new Date(subscription.current_period_end * 1000),
        })
        .eq('id', req.user.id);
    }

    res.json({
      success: true,
      subscription_id: subscription.id,
      client_secret: paymentIntent?.client_secret,
      status: subscription.status,
    });
  } catch (error) {
    next(error);
  }
};

// Cancel Blue Tick subscription
export const cancelBlueTickSubscription = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    if (!stripe) {
      throw new ValidationError('Stripe is not configured');
    }

    // Get active subscription
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('blue_tick_subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      throw new NotFoundError('Active subscription');
    }

    // Cancel in Stripe
    const canceledSub = await stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Update in database
    await supabaseAdmin
      .from('blue_tick_subscriptions')
      .update({
        status: 'canceled',
        canceled_at: new Date(),
      })
      .eq('id', subscription.id);

    res.json({
      success: true,
      message: 'Subscription will be canceled at the end of the billing period',
      cancel_at: canceledSub.cancel_at ? new Date(canceledSub.cancel_at * 1000) : null,
    });
  } catch (error) {
    next(error);
  }
};

// Get Blue Tick subscription status
export const getBlueTickStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ForbiddenError('User not authenticated');
    }

    const { data: subscription } = await supabaseAdmin
      .from('blue_tick_subscriptions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('blue_tick, blue_tick_subscription_end')
      .eq('id', req.user.id)
      .single();

    res.json({
      success: true,
      has_blue_tick: profile?.blue_tick || false,
      subscription: subscription || null,
      subscription_end: profile?.blue_tick_subscription_end || null,
    });
  } catch (error) {
    next(error);
  }
};

// Webhook handler for Stripe subscription events
export const handleStripeWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!stripe) {
      throw new ValidationError('Stripe is not configured');
    }

    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = config.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new ValidationError('Stripe webhook secret not configured');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }

    // Handle subscription events
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;

      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          await handleSubscriptionPayment(invoice.subscription as string);
        }
        break;

      case 'invoice.payment_failed':
        const failedInvoice = event.data.object as Stripe.Invoice;
        if (failedInvoice.subscription) {
          await handleSubscriptionPaymentFailed(failedInvoice.subscription as string);
        }
        break;
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
};

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const { data: dbSub } = await supabaseAdmin
    .from('blue_tick_subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (!dbSub) return;

  const isActive = subscription.status === 'active';
  const periodEnd = new Date(subscription.current_period_end * 1000);

  await supabaseAdmin
    .from('profiles')
    .update({
      blue_tick: isActive,
      blue_tick_subscription_end: isActive ? periodEnd : null,
    })
    .eq('id', dbSub.user_id);

  await supabaseAdmin
    .from('blue_tick_subscriptions')
    .update({
      status: subscription.status === 'active' ? 'active' : subscription.status === 'canceled' ? 'canceled' : 'past_due',
      current_period_start: new Date(subscription.current_period_start * 1000),
      current_period_end: periodEnd,
      canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
    })
    .eq('stripe_subscription_id', subscription.id);
}

async function handleSubscriptionPayment(subscriptionId: string) {
  await handleSubscriptionUpdate(
    await stripe!.subscriptions.retrieve(subscriptionId)
  );
}

async function handleSubscriptionPaymentFailed(subscriptionId: string) {
  const { data: dbSub } = await supabaseAdmin
    .from('blue_tick_subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (dbSub) {
    await supabaseAdmin
      .from('profiles')
      .update({ blue_tick: false })
      .eq('id', dbSub.user_id);
  }
}

