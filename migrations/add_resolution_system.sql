-- Add resolution system columns to predictions table
ALTER TABLE predictions
ADD COLUMN IF NOT EXISTS resolution_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS proposed_outcome BOOLEAN,
ADD COLUMN IF NOT EXISTS resolution_proof_url TEXT,
ADD COLUMN IF NOT EXISTS resolution_proof_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
ADD COLUMN IF NOT EXISTS resolution_submitted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES profiles(id);

-- Add index for querying pending resolutions
CREATE INDEX IF NOT EXISTS idx_predictions_resolution_status ON predictions(resolution_status);
CREATE INDEX IF NOT EXISTS idx_predictions_deadline ON predictions(deadline);
CREATE INDEX IF NOT EXISTS idx_predictions_creator_resolved ON predictions(creator_id, is_resolved);

-- Add check constraint for resolution_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'predictions_resolution_status_check'
  ) THEN
    ALTER TABLE predictions
    ADD CONSTRAINT predictions_resolution_status_check
    CHECK (resolution_status IN ('pending', 'submitted', 'under_review', 'approved', 'rejected'));
  END IF;
END $$;

COMMENT ON COLUMN predictions.resolution_status IS 'Status: pending (default), submitted (user submitted resolution), under_review (admin reviewing), approved (admin approved), rejected (admin rejected)';
COMMENT ON COLUMN predictions.proposed_outcome IS 'User proposed outcome: TRUE for Yes, FALSE for No';
COMMENT ON COLUMN predictions.resolution_proof_url IS 'URL or image URL as proof for resolution';
COMMENT ON COLUMN predictions.resolution_proof_type IS 'Type: url or image';
COMMENT ON COLUMN predictions.resolution_notes IS 'Additional notes from creator about resolution';
COMMENT ON COLUMN predictions.resolution_submitted_at IS 'When creator submitted resolution proposal';
COMMENT ON COLUMN predictions.resolved_at IS 'When admin finalized the resolution';
COMMENT ON COLUMN predictions.resolved_by IS 'Admin who resolved the prediction';

