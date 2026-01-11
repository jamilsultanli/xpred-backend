-- Add is_featured column to communities table for Best Communities
ALTER TABLE public.communities 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

-- Add featured_at timestamp for sorting featured communities
ALTER TABLE public.communities 
ADD COLUMN IF NOT EXISTS featured_at TIMESTAMP WITH TIME ZONE;

-- Add index for featured communities
CREATE INDEX IF NOT EXISTS idx_communities_is_featured ON public.communities(is_featured, featured_at DESC NULLS LAST);

-- Add member_count and prediction_count columns for better performance
ALTER TABLE public.communities 
ADD COLUMN IF NOT EXISTS member_count INTEGER DEFAULT 0;

ALTER TABLE public.communities 
ADD COLUMN IF NOT EXISTS prediction_count INTEGER DEFAULT 0;

-- Create function to update community stats
CREATE OR REPLACE FUNCTION update_community_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Update member count when someone joins
    IF TG_TABLE_NAME = 'community_members' THEN
      UPDATE communities 
      SET member_count = (
        SELECT COUNT(*) 
        FROM community_members 
        WHERE community_id = NEW.community_id
      )
      WHERE id = NEW.community_id;
    END IF;
    
    -- Update prediction count when a prediction is created
    IF TG_TABLE_NAME = 'predictions' THEN
      UPDATE communities 
      SET prediction_count = (
        SELECT COUNT(*) 
        FROM predictions 
        WHERE category = (SELECT name FROM communities WHERE id = NEW.community_id)
      )
      WHERE name = NEW.category;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    -- Update member count when someone leaves
    IF TG_TABLE_NAME = 'community_members' THEN
      UPDATE communities 
      SET member_count = (
        SELECT COUNT(*) 
        FROM community_members 
        WHERE community_id = OLD.community_id
      )
      WHERE id = OLD.community_id;
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic stats updates
DROP TRIGGER IF EXISTS trigger_update_community_member_count ON community_members;
CREATE TRIGGER trigger_update_community_member_count
  AFTER INSERT OR DELETE ON community_members
  FOR EACH ROW
  EXECUTE FUNCTION update_community_stats();

-- Update existing communities with current stats
UPDATE communities c
SET 
  member_count = (
    SELECT COUNT(*) 
    FROM community_members cm 
    WHERE cm.community_id = c.id
  ),
  prediction_count = (
    SELECT COUNT(*) 
    FROM predictions p 
    WHERE p.category = c.name
  );

