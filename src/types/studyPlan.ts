export interface StudyPlanSchedule {
  id: string;
  user_id: string;
  subject_id: string;
  grade_id: string;
  study_duration_minutes: number;
  sessions_per_week: number;
  preferred_times: string[];
  start_date: string;
  end_date: string | null;
  ai_generated: boolean;
  is_active: boolean;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyPlanEvent {
  id: string;
  schedule_id: string;
  user_id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  chapter_id: string | null;
  topics: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  completion_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyPlanCreateRequest {
  subject_id: string;
  grade_id: string;
  study_duration_minutes: number;
  sessions_per_week: number;
  preferred_times: string[];
  start_date: string;
  end_date?: string;
}

export interface StudyPlanAccessCheck {
  has_access: boolean;
  tier_name: string | null;
  feature_enabled: boolean;
}
