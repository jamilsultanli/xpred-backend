import { supabaseAdmin } from '../config/supabase';

type InteractionType = 'view' | 'like' | 'comment' | 'bet' | 'share';

const INTERACTION_WEIGHTS = {
  view: 1,
  like: 2,
  comment: 3,
  share: 4,
  bet: 5,
};

export class RecommendationService {
  /**
   * Track user interaction with a prediction
   */
  async trackInteraction(
    userId: string,
    predictionId: string,
    interactionType: InteractionType,
    category?: string
  ): Promise<void> {
    try {
      // Get category if not provided
      let finalCategory = category;
      if (!finalCategory) {
        const { data: prediction } = await supabaseAdmin
          .from('predictions')
          .select('category')
          .eq('id', predictionId)
          .single();
        finalCategory = prediction?.category || 'World';
      }

      await supabaseAdmin.from('user_interactions').insert({
        user_id: userId,
        prediction_id: predictionId,
        interaction_type: interactionType,
        interaction_value: INTERACTION_WEIGHTS[interactionType],
        category: finalCategory,
      });

      console.log(`📊 Tracked ${interactionType} for user ${userId.substring(0, 8)}... in category ${finalCategory}`);
    } catch (error) {
      console.error('Failed to track interaction:', error);
      // Don't throw - tracking failures shouldn't break the app
    }
  }

  /**
   * Get personalized "For You" feed (TikTok/Instagram style)
   */
  async getPersonalizedFeed(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<string[]> {
    try {
      const offset = (page - 1) * limit;
      
      const { data, error } = await supabaseAdmin.rpc('get_personalized_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Error getting personalized feed:', error);
        return await this.getFallbackFeed(limit, offset);
      }

      console.log(`🎯 Generated personalized feed for user ${userId.substring(0, 8)}...: ${data?.length || 0} predictions`);
      return data?.map((item: any) => item.prediction_id) || [];
    } catch (error) {
      console.error('Failed to get personalized feed:', error);
      return await this.getFallbackFeed(limit, page * limit);
    }
  }

  /**
   * Get explore feed (trending + discovery)
   */
  async getExploreFeed(
    userId: string | null,
    page: number = 1,
    limit: number = 20
  ): Promise<string[]> {
    try {
      const offset = (page - 1) * limit;

      if (userId) {
        const { data, error } = await supabaseAdmin.rpc('get_explore_feed', {
          p_user_id: userId,
          p_limit: limit,
          p_offset: offset,
        });

        if (!error && data) {
          console.log(`🔥 Generated explore feed for user ${userId.substring(0, 8)}...: ${data.length} predictions`);
          return data.map((item: any) => item.prediction_id);
        }
      }

      // Fallback to trending for non-authenticated users
      return await this.getTrendingFeed(limit, offset);
    } catch (error) {
      console.error('Failed to get explore feed:', error);
      return await this.getTrendingFeed(limit, page * limit);
    }
  }

  /**
   * Get user's category preferences
   */
  async getUserPreferences(userId: string): Promise<{ category: string; score: number }[]> {
    try {
      const { data } = await supabaseAdmin
        .from('user_category_scores')
        .select('category, score')
        .eq('user_id', userId)
        .order('score', { ascending: false })
        .limit(5);

      return data || [];
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      return [];
    }
  }

  /**
   * Fallback feed when RPC functions fail
   */
  private async getFallbackFeed(limit: number, offset: number): Promise<string[]> {
    const { data } = await supabaseAdmin
      .from('predictions')
      .select('id')
      .eq('is_resolved', false)
      .gt('deadline', new Date().toISOString())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    return data?.map(p => p.id) || [];
  }

  /**
   * Trending feed (public, no personalization)
   */
  private async getTrendingFeed(limit: number, offset: number): Promise<string[]> {
    const { data } = await supabaseAdmin
      .from('predictions')
      .select('id, total_pot_xp, created_at')
      .eq('is_resolved', false)
      .gt('deadline', new Date().toISOString())
      .gt('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('total_pot_xp', { ascending: false })
      .range(offset, offset + limit - 1);

    return data?.map(p => p.id) || [];
  }
}

export const recommendationService = new RecommendationService();

