-- Add study plan access to subscription tiers
ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS can_access_study_plan BOOLEAN DEFAULT false;

-- Update default values for existing tiers (only paid tiers can access study plan)
UPDATE subscription_tiers
SET can_access_study_plan = CASE
  WHEN name IN ('student', 'pro') THEN true
  ELSE false
END;

-- Create study_plan_schedules table
CREATE TABLE IF NOT EXISTS study_plan_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  grade_id UUID NOT NULL REFERENCES grade_levels(id) ON DELETE CASCADE,

  -- Study plan configuration
  study_duration_minutes INTEGER NOT NULL, -- Total study duration per session
  sessions_per_week INTEGER NOT NULL DEFAULT 3,
  preferred_times TEXT[], -- Array of preferred times like ['morning', 'afternoon', 'evening']
  start_date DATE NOT NULL,
  end_date DATE, -- Optional end date for the study plan

  -- Metadata
  ai_generated BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one active schedule per user/subject/grade combination
  UNIQUE(user_id, subject_id, grade_id, is_active)
);

-- Create study_plan_events table (individual calendar events)
CREATE TABLE IF NOT EXISTS study_plan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES study_plan_schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,

  -- Topic/chapter association
  chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
  topics TEXT[], -- Array of specific topics to cover

  -- Progress tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  completion_notes TEXT,
  completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Index for efficient querying
  CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_study_plan_schedules_user ON study_plan_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_schedules_subject ON study_plan_schedules(subject_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_schedules_active ON study_plan_schedules(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_study_plan_events_schedule ON study_plan_events(schedule_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_events_user ON study_plan_events(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plan_events_date ON study_plan_events(event_date);
CREATE INDEX IF NOT EXISTS idx_study_plan_events_status ON study_plan_events(user_id, status);
CREATE INDEX IF NOT EXISTS idx_study_plan_events_user_date ON study_plan_events(user_id, event_date);

-- RLS Policies for study_plan_schedules
ALTER TABLE study_plan_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own study plan schedules"
  ON study_plan_schedules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own study plan schedules"
  ON study_plan_schedules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own study plan schedules"
  ON study_plan_schedules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own study plan schedules"
  ON study_plan_schedules FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all study plan schedules"
  ON study_plan_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for study_plan_events
ALTER TABLE study_plan_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own study plan events"
  ON study_plan_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own study plan events"
  ON study_plan_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own study plan events"
  ON study_plan_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own study plan events"
  ON study_plan_events FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all study plan events"
  ON study_plan_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create updated_at trigger for study_plan_schedules
CREATE OR REPLACE FUNCTION update_study_plan_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER study_plan_schedules_updated_at
  BEFORE UPDATE ON study_plan_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_study_plan_schedules_updated_at();

-- Create updated_at trigger for study_plan_events
CREATE OR REPLACE FUNCTION update_study_plan_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER study_plan_events_updated_at
  BEFORE UPDATE ON study_plan_events
  FOR EACH ROW
  EXECUTE FUNCTION update_study_plan_events_updated_at();

-- Add system setting for study plan feature flag (enables/disables feature in production)
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'study_plan_enabled',
  '{"enabled": false}'::jsonb,
  'Enable or disable the study plan feature globally. When disabled, the study plan will be completely hidden from all users including paid tiers.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Function to check if user can access study plan
CREATE OR REPLACE FUNCTION can_user_access_study_plan(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_can_access BOOLEAN;
  v_feature_enabled BOOLEAN;
BEGIN
  -- First check if the feature is globally enabled
  SELECT (setting_value->>'enabled')::boolean INTO v_feature_enabled
  FROM system_settings
  WHERE setting_key = 'study_plan_enabled';

  -- If feature is disabled globally, return false
  IF v_feature_enabled IS FALSE THEN
    RETURN false;
  END IF;

  -- Check if user's tier has access to study plan
  SELECT st.can_access_study_plan INTO v_can_access
  FROM user_subscriptions us
  INNER JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.user_id = p_user_id
  AND us.status = 'active'
  LIMIT 1;

  RETURN COALESCE(v_can_access, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION can_user_access_study_plan(UUID) TO authenticated;
