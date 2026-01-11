export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  currency: 'XP' | 'XC';
  type: 'deposit' | 'withdrawal' | 'bet_placed' | 'bet_won' | 'bonus';
  description: string | null;
  created_at: string;
}

export interface PurchaseBundleDto {
  bundle_id: string;
  payment_method: 'stripe' | 'paypal';
  payment_token?: string;
  payment_intent_id?: string;
}

export interface ExchangeDto {
  amount_xp: number;
  exchange_rate?: number;
}

export interface WithdrawalRequestDto {
  amount: number;
  currency: 'XC';
  withdrawal_method: 'bank_transfer' | 'paypal';
  account_details?: Record<string, any>;
}

export interface Bundle {
  id: string;
  cost: number;
  xp: number;
  xc: number;
  active: boolean;
}


