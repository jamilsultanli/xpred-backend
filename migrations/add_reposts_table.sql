`-- Create reposts table
CREATE TABLE IF NOT EXISTS public.reposts (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  prediction_id uuid REFERENCES public.predictions(id) ON DELETE CASCADE NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, prediction_id)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON public.reposts(user_id);
CREATE INDEX IF NOT EXISTS idx_reposts_prediction_id ON public.reposts(prediction_id);
CREATE INDEX IF NOT EXISTS idx_reposts_created_at ON public.reposts(created_at DESC);

-- Enable RLS
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view reposts" ON public.reposts
  FOR SELECT USING (true);

CREATE POLICY "Users can create their own reposts" ON public.reposts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reposts" ON public.reposts
  FOR DELETE USING (auth.uid() = user_id);

`