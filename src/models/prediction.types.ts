export interface Prediction {
  id: string;
  question: string;
  description: string | null;
  deadline: string;
  creator_id: string;
  category: string;
  total_pot_xp: number;
  total_pot_xc: number;
  yes_pool_xp: number;
  no_pool_xp: number;
  yes_pool_xc: number;
  no_pool_xc: number;
  is_resolved: boolean;
  outcome: boolean | null;
  resolution_status: 'pending' | 'submitted' | 'resolved';
  proposed_outcome: boolean | null;
  market_image: string | null;
  market_video: string | null;
  is_featured: boolean;
  created_at: string;
}

export interface CreatePredictionDto {
  question: string;
  description?: string;
  deadline: string;
  initial_pot_xp?: number;
  market_image?: string;
  market_video?: string;
  category?: string;
}

export interface UpdatePredictionDto {
  description?: string;
  market_image?: string;
}

export interface ResolvePredictionDto {
  outcome: boolean;
  reason?: string;
}

export interface ProposeResolutionDto {
  proposed_outcome: boolean;
  evidence?: string;
}

export interface PredictionStats {
  total_bets: number;
  unique_bettors: number;
  yes_percentage: number;
  no_percentage: number;
}


