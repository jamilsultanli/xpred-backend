export interface Bet {
  id: string;
  user_id: string;
  prediction_id: string;
  amount: number;
  currency: 'XP' | 'XC';
  choice: 'yes' | 'no';
  potential_payout: number | null;
  multiplier_at_bet: number | null;
  created_at: string;
}

export interface PlaceBetDto {
  prediction_id: string;
  amount: number;
  currency: 'XP' | 'XC';
  choice: 'yes' | 'no';
}

export interface BetStats {
  total_bets: number;
  active_bets: number;
  won_bets: number;
  lost_bets: number;
  total_winnings: number;
  total_wagered: number;
}


