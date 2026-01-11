-- =====================================================
-- COMPREHENSIVE ADMIN PANEL DATABASE SCHEMA - ULTRA FIXED
-- =====================================================
-- This migration creates all tables needed for the admin panel
-- Handles ALL existing conflicts gracefully

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CLEAN SLATE - DROP CONFLICTING TABLES
-- =====================================================
-- Drop tables that may have incompatible schemas
DROP TABLE IF EXISTS prediction_resolution_queue CASCADE;
DROP TABLE IF EXISTS admin_user_notes CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS admin_permissions CASCADE;
DROP TABLE IF EXISTS admin_roles CASCADE;

DO $$ BEGIN RAISE NOTICE '🧹 Cleaned up existing admin tables'; END $$;

-- =====================================================
-- ADMIN ROLES TABLE
-- =====================================================
CREATE TABLE admin_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  level INTEGER NOT NULL, -- 1=SuperAdmin, 2=Admin, 3=Moderator, 4=ContentReviewer
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE admin_roles IS 'Hierarchical admin roles for the platform';
COMMENT ON COLUMN admin_roles.level IS '1=Super Admin (full access), 2=Admin (no system settings), 3=Moderator (content), 4=Content Reviewer (read-only approval)';

-- =====================================================
-- ADMIN PERMISSIONS TABLE
-- =====================================================
CREATE TABLE admin_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role_id UUID REFERENCES admin_roles(id) ON DELETE CASCADE,
  resource VARCHAR(50) NOT NULL, -- 'users', 'predictions', 'reports', etc
  can_read BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_update BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_approve BOOLEAN DEFAULT false, -- For KYC/reports/resolutions
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role_id, resource)
);

COMMENT ON TABLE admin_permissions IS 'Granular CRUD+Approve permissions per role per resource';

CREATE INDEX idx_admin_permissions_role ON admin_permissions(role_id);
CREATE INDEX idx_admin_permissions_resource ON admin_permissions(resource);

-- =====================================================
-- AUDIT LOGS TABLE
-- =====================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Complete audit trail of all admin actions';
COMMENT ON COLUMN audit_logs.details IS 'JSON object with action-specific details (before/after values, reasons, etc)';

CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

-- =====================================================
-- SYSTEM SETTINGS TABLE
-- =====================================================
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  category VARCHAR(50), -- 'platform', 'features', 'content', 'notifications'
  data_type VARCHAR(20) DEFAULT 'string', -- 'string', 'number', 'boolean', 'json'
  is_public BOOLEAN DEFAULT false, -- Whether users can see this setting
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE system_settings IS 'Configurable platform settings';
COMMENT ON COLUMN system_settings.is_public IS 'If true, setting is visible to regular users via API';

CREATE INDEX idx_system_settings_category ON system_settings(category);
CREATE INDEX idx_system_settings_public ON system_settings(is_public);

-- =====================================================
-- ADMIN USER NOTES TABLE
-- =====================================================
CREATE TABLE admin_user_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'note', -- 'note', 'warning', 'ban_reason', 'internal'
  is_visible_to_user BOOLEAN DEFAULT false, -- Whether user can see this note
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE admin_user_notes IS 'Admin notes and warnings attached to user accounts';

CREATE INDEX idx_admin_user_notes_user ON admin_user_notes(user_id);
CREATE INDEX idx_admin_user_notes_admin ON admin_user_notes(admin_id);
CREATE INDEX idx_admin_user_notes_created ON admin_user_notes(created_at DESC);

-- =====================================================
-- PREDICTION RESOLUTION QUEUE TABLE
-- =====================================================
CREATE TABLE prediction_resolution_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prediction_id UUID REFERENCES predictions(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  proof_url TEXT,
  proof_image TEXT,
  proposed_outcome BOOLEAN NOT NULL,
  submission_notes TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'more_info_needed'
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

COMMENT ON TABLE prediction_resolution_queue IS 'User submissions for resolving predictions with proof';
COMMENT ON COLUMN prediction_resolution_queue.proposed_outcome IS 'true = YES, false = NO';

CREATE INDEX idx_resolution_queue_prediction ON prediction_resolution_queue(prediction_id);
CREATE INDEX idx_resolution_queue_status ON prediction_resolution_queue(status);
CREATE INDEX idx_resolution_queue_submitted_by ON prediction_resolution_queue(submitted_by);
CREATE INDEX idx_resolution_queue_created ON prediction_resolution_queue(created_at DESC);

DO $$ BEGIN RAISE NOTICE '✅ All admin tables created successfully'; END $$;

-- =====================================================
-- INSERT DEFAULT ADMIN ROLES
-- =====================================================
INSERT INTO admin_roles (name, display_name, description, level) VALUES
  ('super_admin', 'Super Admin', 'Full system access including settings and user promotion', 1),
  ('admin', 'Admin', 'Full admin access except system settings', 2),
  ('moderator', 'Moderator', 'Content moderation and user management', 3),
  ('content_reviewer', 'Content Reviewer', 'Review reports and predictions only', 4);

DO $$ BEGIN RAISE NOTICE '✅ Default admin roles created'; END $$;

-- =====================================================
-- INSERT DEFAULT PERMISSIONS
-- =====================================================

-- SUPER ADMIN - Full access to everything
INSERT INTO admin_permissions (role_id, resource, can_read, can_create, can_update, can_delete, can_approve)
SELECT id, resource, true, true, true, true, true
FROM admin_roles, (VALUES 
  ('users'), 
  ('predictions'), 
  ('reports'), 
  ('settings'), 
  ('finance'), 
  ('support'), 
  ('kyc'), 
  ('analytics'), 
  ('audit_logs'),
  ('broadcast'),
  ('admins')
) AS resources(resource)
WHERE name = 'super_admin';

-- ADMIN - Full access except system settings
INSERT INTO admin_permissions (role_id, resource, can_read, can_create, can_update, can_delete, can_approve)
SELECT ar.id, r.resource, true, true, true, (r.resource != 'settings' AND r.resource != 'admins'), true
FROM admin_roles ar, (VALUES 
  ('users'), 
  ('predictions'), 
  ('reports'), 
  ('finance'), 
  ('support'), 
  ('kyc'), 
  ('analytics'), 
  ('audit_logs'),
  ('broadcast')
) AS r(resource)
WHERE ar.name = 'admin';

-- MODERATOR - Content and user management, no finance or settings
INSERT INTO admin_permissions (role_id, resource, can_read, can_create, can_update, can_delete, can_approve)
SELECT ar.id, r.resource, true, (r.resource IN ('reports', 'support')), true, false, true
FROM admin_roles ar, (VALUES 
  ('users'), 
  ('predictions'), 
  ('reports'), 
  ('support'),
  ('analytics')
) AS r(resource)
WHERE ar.name = 'moderator';

-- CONTENT REVIEWER - Read and approve predictions/reports only
INSERT INTO admin_permissions (role_id, resource, can_read, can_create, can_update, can_delete, can_approve)
SELECT ar.id, r.resource, true, false, false, false, true
FROM admin_roles ar, (VALUES 
  ('predictions'), 
  ('reports')
) AS r(resource)
WHERE ar.name = 'content_reviewer';

DO $$ BEGIN RAISE NOTICE '✅ Default permissions created'; END $$;

-- =====================================================
-- ADD ADMIN ROLE COLUMN TO PROFILES
-- =====================================================
DO $$ 
BEGIN
  -- Add column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'admin_role_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN admin_role_id UUID REFERENCES admin_roles(id);
    RAISE NOTICE '✅ Added admin_role_id column to profiles';
  ELSE
    RAISE NOTICE 'ℹ️  admin_role_id column already exists in profiles';
  END IF;
END $$;

-- Create index
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_profiles_admin_role') THEN
    CREATE INDEX idx_profiles_admin_role ON profiles(admin_role_id);
  END IF;
END $$;

-- =====================================================
-- UPDATE EXISTING ADMINS
-- =====================================================
-- Promote existing admins to super_admin role
UPDATE profiles 
SET admin_role_id = (SELECT id FROM admin_roles WHERE name = 'super_admin')
WHERE role = 'admin' AND admin_role_id IS NULL;

-- Assign moderator role to existing moderators
UPDATE profiles 
SET admin_role_id = (SELECT id FROM admin_roles WHERE name = 'moderator')
WHERE role = 'moderator' AND admin_role_id IS NULL;

DO $$ BEGIN RAISE NOTICE '✅ Existing admin users updated'; END $$;

-- =====================================================
-- INSERT DEFAULT SYSTEM SETTINGS
-- =====================================================
INSERT INTO system_settings (key, value, description, category, data_type, is_public) VALUES
  -- Platform settings
  ('platform_fee_xp', '0.05', 'Platform fee percentage for XP bets (0.05 = 5%)', 'platform', 'number', false),
  ('platform_fee_xc', '0.05', 'Platform fee percentage for XC bets (0.05 = 5%)', 'platform', 'number', false),
  ('min_bet_xp', '10', 'Minimum bet amount in XP', 'platform', 'number', true),
  ('min_bet_xc', '1', 'Minimum bet amount in XC', 'platform', 'number', true),
  ('max_bet_xp', '100000', 'Maximum bet amount in XP', 'platform', 'number', true),
  ('max_bet_xc', '10000', 'Maximum bet amount in XC', 'platform', 'number', true),
  ('new_user_bonus_xp', '1000', 'Welcome bonus XP for new users', 'platform', 'number', true),
  
  -- Feature flags
  ('feature_predictions', 'true', 'Enable/disable predictions feature', 'features', 'boolean', false),
  ('feature_communities', 'true', 'Enable/disable communities feature', 'features', 'boolean', false),
  ('feature_leaderboard', 'true', 'Enable/disable leaderboard', 'features', 'boolean', false),
  ('feature_kyc', 'true', 'Enable/disable KYC verification', 'features', 'boolean', false),
  ('feature_blue_tick', 'true', 'Enable/disable blue tick subscriptions', 'features', 'boolean', false),
  
  -- Content moderation
  ('auto_moderate_content', 'true', 'Use AI for automatic content moderation', 'content', 'boolean', false),
  ('require_prediction_review', 'false', 'All predictions must be reviewed by admin', 'content', 'boolean', false),
  ('min_prediction_duration_hours', '1', 'Minimum prediction duration in hours', 'content', 'number', true),
  ('max_prediction_duration_days', '365', 'Maximum prediction duration in days', 'content', 'number', true),
  
  -- Notifications
  ('notify_admin_new_report', 'true', 'Notify admins of new reports', 'notifications', 'boolean', false),
  ('notify_admin_new_kyc', 'true', 'Notify admins of new KYC requests', 'notifications', 'boolean', false),
  ('notify_admin_new_support', 'true', 'Notify admins of new support tickets', 'notifications', 'boolean', false),
  
  -- Broadcast
  ('latest_broadcast', '', 'Current global announcement banner', 'broadcast', 'string', true),
  ('broadcast_active', 'false', 'Whether broadcast banner is active', 'broadcast', 'boolean', true);

DO $$ BEGIN RAISE NOTICE '✅ Default system settings inserted'; END $$;

-- =====================================================
-- CREATE HELPER FUNCTIONS
-- =====================================================

-- Function to check if user has specific admin permission
CREATE OR REPLACE FUNCTION has_admin_permission(
  p_user_id UUID,
  p_resource VARCHAR,
  p_action VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_admin_role_id UUID;
  v_permission RECORD;
BEGIN
  -- Get user's admin role
  SELECT admin_role_id INTO v_admin_role_id
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_admin_role_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if super admin (level 1) - always return true
  IF EXISTS (SELECT 1 FROM admin_roles WHERE id = v_admin_role_id AND level = 1) THEN
    RETURN true;
  END IF;
  
  -- Check specific permission
  SELECT * INTO v_permission
  FROM admin_permissions
  WHERE role_id = v_admin_role_id
    AND resource = p_resource;
  
  IF v_permission IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check the specific action
  CASE p_action
    WHEN 'read' THEN RETURN v_permission.can_read;
    WHEN 'create' THEN RETURN v_permission.can_create;
    WHEN 'update' THEN RETURN v_permission.can_update;
    WHEN 'delete' THEN RETURN v_permission.can_delete;
    WHEN 'approve' THEN RETURN v_permission.can_approve;
    ELSE RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION has_admin_permission IS 'Check if a user has a specific admin permission';

DO $$ BEGIN RAISE NOTICE '✅ Helper function created'; END $$;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on admin tables
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_user_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_resolution_queue ENABLE ROW LEVEL SECURITY;

-- Admin roles: Only admins can read
CREATE POLICY admin_roles_read ON admin_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.admin_role_id IS NOT NULL
    )
  );

-- Admin permissions: Only admins can read
CREATE POLICY admin_permissions_read ON admin_permissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.admin_role_id IS NOT NULL
    )
  );

-- Audit logs: Only admins can read
CREATE POLICY audit_logs_read ON audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.admin_role_id IS NOT NULL
    )
  );

-- System settings: Admins can read all, users can read public ones
CREATE POLICY system_settings_read ON system_settings
  FOR SELECT
  USING (
    is_public = true 
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.admin_role_id IS NOT NULL
    )
  );

-- Admin user notes: Only admins can read
CREATE POLICY admin_user_notes_read ON admin_user_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.admin_role_id IS NOT NULL
    )
  );

-- Prediction resolution queue: Users can read their own, admins can read all
CREATE POLICY resolution_queue_read ON prediction_resolution_queue
  FOR SELECT
  USING (
    submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.admin_role_id IS NOT NULL
    )
  );

-- Prediction resolution queue: Users can insert their own submissions
CREATE POLICY resolution_queue_insert ON prediction_resolution_queue
  FOR INSERT
  WITH CHECK (submitted_by = auth.uid());

DO $$ BEGIN RAISE NOTICE '✅ RLS policies created'; END $$;

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================
DO $$ 
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '🎉 ADMIN PANEL MIGRATION COMPLETED SUCCESSFULLY!';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Tables Created:';
  RAISE NOTICE '   ✓ admin_roles';
  RAISE NOTICE '   ✓ admin_permissions';
  RAISE NOTICE '   ✓ audit_logs';
  RAISE NOTICE '   ✓ system_settings';
  RAISE NOTICE '   ✓ admin_user_notes';
  RAISE NOTICE '   ✓ prediction_resolution_queue';
  RAISE NOTICE '';
  RAISE NOTICE '👥 Default Roles: super_admin, admin, moderator, content_reviewer';
  RAISE NOTICE '🔒 RLS Policies: Enabled on all admin tables';
  RAISE NOTICE '⚡ Helper Function: has_admin_permission(user_id, resource, action)';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '🚀 NEXT STEP: PROMOTE YOUR FIRST ADMIN';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE 'Run this SQL (replace with your email):';
  RAISE NOTICE '';
  RAISE NOTICE '  UPDATE profiles';
  RAISE NOTICE '  SET role = ''admin'',';
  RAISE NOTICE '      admin_role_id = (SELECT id FROM admin_roles WHERE name = ''super_admin'')';
  RAISE NOTICE '  WHERE email = ''your@email.com'';';
  RAISE NOTICE '';
  RAISE NOTICE 'Then access admin panel at: /admin';
  RAISE NOTICE '';
  RAISE NOTICE '═══════════════════════════════════════════════════════';
END $$;

