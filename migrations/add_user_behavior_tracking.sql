-- Track user interactions for personalized recommendations
CREATE TABLE IF NOT EXISTS user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  prediction_id UUID REFERENCES predictions(id) ON DELETE CASCADE,
  interaction_type VARCHAR(50) NOT NULL, -- 'view', 'like', 'comment', 'bet', 'share'
  interaction_value INTEGER DEFAULT 1, -- Weight: view=1, like=2, comment=3, bet=5, share=4
  category VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  INDEX idx_user_interactions_user (user_id, created_at DESC),
  INDEX idx_user_interactions_prediction (prediction_id),
  INDEX idx_user_interactions_category (user_id, category, created_at DESC)
);

-- Track category preferences
CREATE TABLE IF NOT EXISTS user_category_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL,
  score DECIMAL(10, 2) DEFAULT 0,
  interaction_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, category),
  INDEX idx_user_category_scores_user (user_id, score DESC)
);

-- Function to update category scores based on interactions
CREATE OR REPLACE FUNCTION update_user_category_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert or update category score
  INSERT INTO user_category_scores (user_id, category, score, interaction_count, last_updated)
  VALUES (NEW.user_id, NEW.category, NEW.interaction_value, 1, NOW())
  ON CONFLICT (user_id, category)
  DO UPDATE SET
    score = user_category_scores.score + NEW.interaction_value,
    interaction_count = user_category_scores.interaction_count + 1,
    last_updated = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update scores
CREATE TRIGGER trg_update_category_score
AFTER INSERT ON user_interactions
FOR EACH ROW
EXECUTE FUNCTION update_user_category_score();

-- Function to get personalized feed (TikTok/Instagram style)
CREATE OR REPLACE FUNCTION get_personalized_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  prediction_id UUID,
  relevance_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH user_preferences AS (
    -- Get user's top 3 categories
    SELECT category, score
    FROM user_category_scores
    WHERE user_id = p_user_id
    ORDER BY score DESC
    LIMIT 3
  ),
  recent_views AS (
    -- Get recently viewed predictions to avoid showing them again soon
    SELECT DISTINCT prediction_id
    FROM user_interactions
    WHERE user_id = p_user_id
      AND interaction_type = 'view'
      AND created_at > NOW() - INTERVAL '2 hours'
  ),
  scored_predictions AS (
    SELECT
      p.id as prediction_id,
      -- Calculate relevance score
      (
        -- Category match bonus (highest weight)
        COALESCE((SELECT up.score FROM user_preferences up WHERE up.category = p.category), 0) * 3 +
        
        -- Engagement score (likes, comments, bets)
        (COALESCE(p.likes_count, 0) * 0.5) +
        (COALESCE(p.comments_count, 0) * 0.8) +
        ((p.yes_pool_xp + p.no_pool_xp) / 1000.0) +
        
        -- Recency bonus (newer = better)
        CASE
          WHEN p.created_at > NOW() - INTERVAL '1 hour' THEN 50
          WHEN p.created_at > NOW() - INTERVAL '6 hours' THEN 30
          WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN 15
          ELSE 5
        END +
        
        -- Creator reputation bonus
        CASE WHEN EXISTS (
          SELECT 1 FROM profiles pr
          WHERE pr.id = p.creator_id AND pr.is_verified = true
        ) THEN 10 ELSE 0 END +
        
        -- Diversity bonus (show different categories)
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM user_interactions ui
            WHERE ui.user_id = p_user_id
              AND ui.category = p.category
              AND ui.created_at > NOW() - INTERVAL '10 minutes'
          ) THEN 20
          ELSE 0
        END
      ) as relevance_score
    FROM predictions p
    WHERE p.is_resolved = false
      AND p.deadline > NOW()
      AND p.id NOT IN (SELECT prediction_id FROM recent_views)
  )
  SELECT sp.prediction_id, sp.relevance_score
  FROM scored_predictions sp
  ORDER BY sp.relevance_score DESC, RANDOM()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function for Explore page (trending + personalized)
CREATE OR REPLACE FUNCTION get_explore_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  prediction_id UUID,
  relevance_score DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH trending_predictions AS (
    -- Get predictions trending in last 24 hours
    SELECT
      p.id as prediction_id,
      (
        (COALESCE(p.likes_count, 0) * 2) +
        (COALESCE(p.comments_count, 0) * 3) +
        ((p.yes_pool_xp + p.no_pool_xp) / 500.0) +
        (
          SELECT COUNT(*)::DECIMAL
          FROM user_interactions ui
          WHERE ui.prediction_id = p.id
            AND ui.created_at > NOW() - INTERVAL '24 hours'
        ) * 5
      ) as relevance_score
    FROM predictions p
    WHERE p.is_resolved = false
      AND p.created_at > NOW() - INTERVAL '7 days'
      AND p.deadline > NOW()
  )
  SELECT tp.prediction_id, tp.relevance_score
  FROM trending_predictions tp
  ORDER BY tp.relevance_score DESC, RANDOM()
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

