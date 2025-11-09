-- Add is_completed field to study_plan_schedules
ALTER TABLE study_plan_schedules
ADD COLUMN IF NOT EXISTS is_completed BOOLEAN DEFAULT false;

-- Add completion_date to track when the plan was completed
ALTER TABLE study_plan_schedules
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Create badges table for gamification
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL CHECK (badge_type IN ('study_plan_completed', 'streak_7', 'streak_30', 'perfectionist')),
  badge_name TEXT NOT NULL,
  badge_description TEXT,
  badge_icon TEXT, -- emoji or icon identifier

  -- Reference to the achievement
  study_plan_id UUID REFERENCES study_plan_schedules(id) ON DELETE SET NULL,

  -- Metadata
  earned_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate badges for the same achievement
  UNIQUE(user_id, badge_type, study_plan_id)
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_earned ON user_badges(user_id, earned_at DESC);

-- Enable RLS
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own badges" ON user_badges;
DROP POLICY IF EXISTS "System can insert badges" ON user_badges;

-- RLS policies for user_badges
CREATE POLICY "Users can view their own badges"
  ON user_badges
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert badges"
  ON user_badges
  FOR INSERT
  WITH CHECK (true);

-- Function to automatically mark study plan as completed when all events are completed
CREATE OR REPLACE FUNCTION check_study_plan_completion()
RETURNS TRIGGER AS $$
DECLARE
  total_events INTEGER;
  completed_events INTEGER;
  plan_id UUID;
BEGIN
  -- Get the schedule_id from the event
  plan_id := NEW.schedule_id;

  -- Count total events for this schedule
  SELECT COUNT(*) INTO total_events
  FROM study_plan_events
  WHERE schedule_id = plan_id;

  -- Count completed events for this schedule
  SELECT COUNT(*) INTO completed_events
  FROM study_plan_events
  WHERE schedule_id = plan_id
    AND status = 'completed';

  -- If all events are completed, mark the schedule as completed and inactive
  IF total_events > 0 AND total_events = completed_events THEN
    UPDATE study_plan_schedules
    SET is_completed = true,
        is_active = false,
        completed_at = NOW()
    WHERE id = plan_id;

    -- Award badge for completing study plan
    INSERT INTO user_badges (user_id, badge_type, badge_name, badge_description, badge_icon, study_plan_id)
    SELECT
      s.user_id,
      'study_plan_completed',
      'Study Plan Champion',
      'Completed an entire study plan',
      '🏆',
      plan_id
    FROM study_plan_schedules s
    WHERE s.id = plan_id
    ON CONFLICT (user_id, badge_type, study_plan_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to check completion after each event status update
CREATE TRIGGER trigger_check_study_plan_completion
AFTER UPDATE OF status ON study_plan_events
FOR EACH ROW
WHEN (NEW.status = 'completed')
EXECUTE FUNCTION check_study_plan_completion();

COMMENT ON TABLE user_badges IS 'Stores gamification badges earned by users for completing study plans and other achievements';
COMMENT ON COLUMN study_plan_schedules.is_completed IS 'Whether all events in this study plan have been completed';
COMMENT ON FUNCTION check_study_plan_completion IS 'Automatically marks a study plan as completed when all events are done and awards a badge';
