-- Add prediction_id column to likes table to support likes on predictions
ALTER TABLE public.likes 
ADD COLUMN IF NOT EXISTS prediction_id uuid REFERENCES public.predictions(id);

-- Make post_id nullable since likes can now be on either posts or predictions
ALTER TABLE public.likes
ALTER COLUMN post_id DROP NOT NULL;

-- Drop existing unique constraint if it exists
ALTER TABLE public.likes
DROP CONSTRAINT IF EXISTS likes_user_id_post_id_key;

-- Add constraint to ensure either post_id or prediction_id is set (but not both)
ALTER TABLE public.likes
DROP CONSTRAINT IF EXISTS likes_entity_check;

ALTER TABLE public.likes
ADD CONSTRAINT likes_entity_check 
CHECK (
  (post_id IS NOT NULL AND prediction_id IS NULL) OR 
  (post_id IS NULL AND prediction_id IS NOT NULL)
);

-- Add unique constraint for user_id + post_id
ALTER TABLE public.likes
ADD CONSTRAINT likes_user_post_unique 
UNIQUE (user_id, post_id) 
WHERE post_id IS NOT NULL;

-- Add unique constraint for user_id + prediction_id
ALTER TABLE public.likes
ADD CONSTRAINT likes_user_prediction_unique 
UNIQUE (user_id, prediction_id) 
WHERE prediction_id IS NOT NULL;

-- Add index for prediction_id
CREATE INDEX IF NOT EXISTS idx_likes_prediction_id ON public.likes(prediction_id);

