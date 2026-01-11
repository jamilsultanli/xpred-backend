import Stripe from 'stripe';
import { config } from '../config/env';
import { ValidationError } from '../utils/errors';

export class PaymentService {
  private stripe: Stripe | null = null;

  constructor() {
    if (config.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(config.STRIPE_SECRET_KEY, {
        apiVersion: '2023-10-16',
      });
    }
  }

  async createPaymentIntent(amount: number, currency: string = 'usd', metadata?: Record<string, string>): Promise<Stripe.PaymentIntent> {
    if (!this.stripe) {
      throw new ValidationError('Stripe is not configured');
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      metadata: metadata || {},
      automatic_payment_methods: {
        enabled: true,
      },
    });

    return paymentIntent;
  }

  async confirmPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    if (!this.stripe) {
      throw new ValidationError('Stripe is not configured');
    }

    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new ValidationError(`Payment not completed. Status: ${paymentIntent.status}`);
    }

    return paymentIntent;
  }

  async verifyWebhookSignature(payload: string | Buffer, signature: string): Promise<Stripe.Event> {
    if (!this.stripe || !config.STRIPE_WEBHOOK_SECRET) {
      throw new ValidationError('Stripe webhook is not configured');
    }

    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      config.STRIPE_WEBHOOK_SECRET
    );

    return event;
  }

  isConfigured(): boolean {
    return !!this.stripe;
  }
}

export const paymentService = new PaymentService();

