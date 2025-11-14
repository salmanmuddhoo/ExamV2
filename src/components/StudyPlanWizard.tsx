import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Calendar, Clock, BookOpen, Sparkles, ChevronRight, ChevronLeft, Loader, Zap } from 'lucide-react';
import { formatTokenCount } from '../lib/formatUtils';
import { AlertModal } from './AlertModal';
import { useFirstTimeHints } from '../contexts/FirstTimeHintsContext';
import { ContextualHint } from './ContextualHint';

interface Subject {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  name: string;
}

interface Syllabus {
  id: string;
  title: string | null;
  description: string | null;
  academic_year: string | null;
  region: string | null;
}

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  chapter_description: string | null;
}

interface StudyPlanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tokensRemaining?: number;
  tokensLimit?: number | null;
  tokensUsed?: number;
}

export function StudyPlanWizard({ isOpen, onClose, onSuccess, tokensRemaining = 0, tokensLimit = null, tokensUsed = 0 }: StudyPlanWizardProps) {
  const { user } = useAuth();
  const { shouldShowHint, markHintAsSeen } = useFirstTimeHints();

  // Configuration constants
  const MAX_CHAPTERS = 2; // Maximum number of chapters that can be selected

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [generating, setGenerating] = useState(false);

  // Alert modal state
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  // Form state
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSyllabus, setSelectedSyllabus] = useState('');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [studyDuration, setStudyDuration] = useState(60);
  const [selectedDays, setSelectedDays] = useState<string[]>([]); // No default selection - user must choose
  const [preferredTimes, setPreferredTimes] = useState<string[]>(['evening']);
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    return threeMonths.toISOString().split('T')[0];
  });
  const [checkingConflicts, setCheckingConflicts] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [studyPlanCount, setStudyPlanCount] = useState<number>(0);
  const [studyPlanLimit, setStudyPlanLimit] = useState<number | null>(null);
  const [loadingPlanInfo, setLoadingPlanInfo] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchSubjects();
      fetchGrades();
      fetchStudyPlanUsage();
    }
  }, [isOpen]);

  // Fetch study plan usage information
  const fetchStudyPlanUsage = async () => {
    if (!user) return;

    try {
      setLoadingPlanInfo(true);

      // Get user's tier limit
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
          subscription_tiers!inner(
            max_study_plans
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subError) {
        console.error('Error fetching subscription:', subError);
        setStudyPlanLimit(null);
      } else {
        const tierLimit = subscription?.subscription_tiers?.max_study_plans;
        setStudyPlanLimit(tierLimit ?? null);
      }

      // Count ALL study plans created by this user
      const { count, error: countError } = await supabase
        .from('study_plan_schedules')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      if (countError) {
        console.error('Error counting study plans:', countError);
        setStudyPlanCount(0);
      } else {
        setStudyPlanCount(count || 0);
      }
    } catch (error) {
      console.error('Error fetching study plan usage:', error);
    } finally {
      setLoadingPlanInfo(false);
    }
  };

  // Check study plan limit early when subject and grade are selected
  useEffect(() => {
    const checkStudyPlanLimit = async () => {
      if (!user || !selectedSubject || !selectedGrade) return;

      try {
        // First, get the user's tier max_study_plans limit
        const { data: subscription, error: subError } = await supabase
          .from('user_subscriptions')
          .select(`
            subscription_tiers!inner(
              max_study_plans
            )
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .single();

        if (subError) {
          console.error('Error fetching subscription:', subError);
          return;
        }

        const tierLimit = subscription?.subscription_tiers?.max_study_plans;

        // If no limit (null), user can create unlimited plans
        if (tierLimit === null || tierLimit === undefined) {
          return;
        }

        // Count ALL study plans ever created by this user (not filtered by subject/grade)
        // This includes active, completed, and inactive plans
        // Deleted plans are already removed from the database, so they won't be counted
        const { data: existingPlans, error } = await supabase
          .from('study_plan_schedules')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (error) {
          console.error('Error checking study plan limit:', error);
          return;
        }

        const totalPlansCreated = existingPlans || 0;

        if (totalPlansCreated >= tierLimit) {
          setAlertConfig({
            title: 'Study Plan Limit Reached',
            message: `You have reached your tier's limit of ${tierLimit} study plan${tierLimit > 1 ? 's' : ''}. You cannot create more study plans with your current subscription. Please upgrade your plan to create more.`,
            type: 'warning'
          });
          setShowAlert(true);
          // Don't proceed - user needs to upgrade
        }
      } catch (error) {
        console.error('Error checking study plan limit:', error);
      }
    };

    checkStudyPlanLimit();
  }, [user, selectedSubject, selectedGrade]);

  // Validate date range - maximum 4 months
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Calculate 4 months from start date
      const maxEnd = new Date(start);
      maxEnd.setMonth(maxEnd.getMonth() + 4);

      if (end > maxEnd) {
        setDateRangeError('Study plan duration cannot exceed 4 months. Please select an earlier end date.');
      } else {
        setDateRangeError(null);
      }
    }
  }, [startDate, endDate]);

  // Auto-select grade if only one is available (non-pro users)
  useEffect(() => {
    if (grades.length === 1 && !selectedGrade) {
      setSelectedGrade(grades[0].id);
    }
  }, [grades]);

  const fetchSubjects = async () => {
    if (!user) return;

    try {
      // Use RPC function to get only accessible subjects based on subscription
      const { data, error } = await supabase
        .rpc('get_accessible_subjects_for_user', {
          p_user_id: user.id,
          p_grade_id: null
        });

      if (error) throw error;

      // Map the returned data to match expected format
      const formattedSubjects = (data || []).map((item: any) => ({
        id: item.subject_id,
        name: item.subject_name
      }));

      setSubjects(formattedSubjects);
    } catch (error) {
      console.error('Error fetching accessible subjects:', error);
    }
  };

  const fetchGrades = async () => {
    if (!user) return;

    try {
      // Use RPC function to get only accessible grades based on subscription
      const { data, error } = await supabase
        .rpc('get_accessible_grades_for_user', {
          p_user_id: user.id
        });

      if (error) throw error;

      // Map the returned data to match expected format
      const formattedGrades = (data || []).map((item: any) => ({
        id: item.grade_id,
        name: item.grade_name
      }));

      setGrades(formattedGrades);
    } catch (error) {
      console.error('Error fetching accessible grades:', error);
    }
  };

  const fetchSyllabi = async (subjectId: string, gradeId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('syllabus')
        .select('id, title, description, academic_year, region')
        .eq('subject_id', subjectId)
        .eq('grade_id', gradeId)
        .eq('processing_status', 'completed')
        .order('region', { ascending: true });

      if (error) {
        console.error('Error fetching syllabi:', error);
        setSyllabi([]);
        setSelectedSyllabus('');
      } else {
        setSyllabi(data || []);
        // Auto-select the first syllabus automatically (no user selection needed)
        if (data && data.length > 0) {
          setSelectedSyllabus(data[0].id);
        } else {
          setSelectedSyllabus('');
        }
      }
    } catch (error) {
      console.error('Error fetching syllabi:', error);
      setSyllabi([]);
      setSelectedSyllabus('');
    } finally {
      setLoading(false);
    }
  };

  const fetchChapters = async (syllabusId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title, chapter_description')
        .eq('syllabus_id', syllabusId)
        .order('display_order');

      if (error) {
        console.error('Error fetching chapters:', error);
        setChapters([]);
      } else {
        setChapters(data || []);
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleChapter = (chapterId: string) => {
    if (selectedChapters.includes(chapterId)) {
      setSelectedChapters(selectedChapters.filter(id => id !== chapterId));
    } else {
      // Limit to maximum chapters
      if (selectedChapters.length >= MAX_CHAPTERS) {
        setAlertConfig({
          title: 'Chapter Limit Reached',
          message: `You can select a maximum of ${MAX_CHAPTERS} chapters per study plan. Deselect a chapter to select a different one.`,
          type: 'warning'
        });
        setShowAlert(true);
        return;
      }
      setSelectedChapters([...selectedChapters, chapterId]);
    }
  };

  const togglePreferredTime = (time: string) => {
    if (preferredTimes.includes(time)) {
      setPreferredTimes(preferredTimes.filter(t => t !== time));
    } else {
      setPreferredTimes([...preferredTimes, time]);
    }
  };

  // Fetch syllabi when both subject and grade are selected
  useEffect(() => {
    if (selectedSubject && selectedGrade) {
      fetchSyllabi(selectedSubject, selectedGrade);
    } else {
      setSyllabi([]);
      setSelectedSyllabus('');
      setChapters([]);
      setSelectedChapters([]);
    }
  }, [selectedSubject, selectedGrade]);

  // Fetch chapters when a syllabus is selected
  useEffect(() => {
    if (selectedSyllabus) {
      fetchChapters(selectedSyllabus);
    } else {
      setChapters([]);
      setSelectedChapters([]);
    }
  }, [selectedSyllabus]);

  const handleGenerateStudyPlan = async () => {
    if (!user || !selectedSubject || !selectedGrade) return;

    let scheduleId: string | null = null;

    try {
      setGenerating(true);

      // Re-check tier limit before creating (in case it changed)
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
          subscription_tiers!inner(
            max_study_plans
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subError) {
        console.error('Error fetching subscription:', subError);
        throw new Error('Failed to verify subscription');
      }

      const tierLimit = subscription?.subscription_tiers?.max_study_plans;

      // If there's a limit, check it
      if (tierLimit !== null && tierLimit !== undefined) {
        // Count ALL study plans created by this user
        const { count, error: countError } = await supabase
          .from('study_plan_schedules')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);

        if (countError) {
          console.error('Error checking existing plans:', countError);
          throw new Error('Failed to check existing study plans');
        }

        if (count !== null && count >= tierLimit) {
          setAlertConfig({
            title: 'Study Plan Limit Reached',
            message: `You have reached your tier's limit of ${tierLimit} study plan${tierLimit > 1 ? 's' : ''}. You cannot create more study plans with your current subscription. Please upgrade your plan to create more.`,
            type: 'warning'
          });
          setShowAlert(true);
          setGenerating(false);
          return;
        }
      }

      // Deactivate any existing active plans for the same subject/grade
      const { error: deactivateError } = await supabase
        .from('study_plan_schedules')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('subject_id', selectedSubject)
        .eq('grade_id', selectedGrade)
        .eq('is_active', true);

      if (deactivateError) {
        console.error('Error deactivating existing plans:', deactivateError);
        // Don't throw - continue with creation even if deactivation fails
      }

      // Create the schedule (new plans are active by default)
      const { data: schedule, error: scheduleError } = await supabase
        .from('study_plan_schedules')
        .insert({
          user_id: user.id,
          subject_id: selectedSubject,
          grade_id: selectedGrade,
          study_duration_minutes: studyDuration,
          sessions_per_week: selectedDays.length,
          preferred_times: preferredTimes,
          start_date: startDate,
          end_date: endDate,
          ai_generated: true,
          is_active: true  // New plans are active by default
        })
        .select()
        .single();

      if (scheduleError) throw scheduleError;

      // Store schedule ID for cleanup if AI generation fails
      scheduleId = schedule.id;

      // Generate events using AI via Supabase Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-study-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          schedule_id: schedule.id,
          user_id: user.id,
          subject_id: selectedSubject,
          grade_id: selectedGrade,
          syllabus_id: selectedSyllabus || undefined, // Optional syllabus
          chapter_ids: selectedChapters.length > 0 ? selectedChapters : undefined,
          study_duration_minutes: studyDuration,
          selected_days: selectedDays, // Selected days of the week
          preferred_times: preferredTimes,
          start_date: startDate,
          end_date: endDate
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate study plan');
      }

      // Reset form
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error generating study plan:', error);

      // Clean up the orphaned schedule if it was created but AI generation failed
      if (scheduleId) {
        try {
          await supabase
            .from('study_plan_schedules')
            .delete()
            .eq('id', scheduleId);
          console.log('Cleaned up orphaned schedule:', scheduleId);
        } catch (cleanupError) {
          console.error('Failed to clean up orphaned schedule:', cleanupError);
        }
      }

      setAlertConfig({
        title: 'Error',
        message: 'Failed to generate study plan. Please try again.',
        type: 'error'
      });
      setShowAlert(true);
    } finally {
      setGenerating(false);
    }
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      } else {
        return [...prev, day];
      }
    });
    setConflictWarning(null); // Clear warning when days change
  };

  const checkTimeConflicts = async () => {
    if (!user || selectedDays.length === 0) return;

    setCheckingConflicts(true);
    setConflictWarning(null);

    try {
      // Fetch all existing events for the user
      const { data: existingEvents, error } = await supabase
        .from('study_plan_events')
        .select('event_date, start_time, end_time, study_plan_schedules!inner(is_active)')
        .eq('user_id', user.id)
        .eq('study_plan_schedules.is_active', true);

      if (error) throw error;

      // Convert selected days to day numbers (0 = Sunday, 1 = Monday, etc.)
      const dayMap: { [key: string]: number } = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6
      };
      const selectedDayNumbers = selectedDays.map(day => dayMap[day.toLowerCase()]);

      // Check if any of the selected days have conflicting events
      const conflicts: string[] = [];
      const eventsGroupedByDay: { [key: string]: number } = {};

      existingEvents?.forEach((event: any) => {
        const eventDate = new Date(event.event_date);
        const dayOfWeek = eventDate.getDay();
        const dayName = Object.keys(dayMap).find(key => dayMap[key] === dayOfWeek);

        if (dayName && selectedDayNumbers.includes(dayOfWeek)) {
          if (!eventsGroupedByDay[dayName]) {
            eventsGroupedByDay[dayName] = 0;
          }
          eventsGroupedByDay[dayName]++;
        }
      });

      // Check if any day has too many events (>3 per day considered full)
      Object.entries(eventsGroupedByDay).forEach(([day, count]) => {
        if (count >= 3) {
          conflicts.push(day.charAt(0).toUpperCase() + day.slice(1));
        }
      });

      if (conflicts.length > 0) {
        setConflictWarning(
          `Some days may have scheduling conflicts: ${conflicts.join(', ')}. The AI will try to find available time slots, but some sessions might be scheduled at different times than your preference.`
        );
      }
    } catch (error) {
      console.error('Error checking conflicts:', error);
    } finally {
      setCheckingConflicts(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedGrade('');
    setSelectedSubject('');
    setSelectedSyllabus('');
    setSyllabi([]);
    setSelectedChapters([]);
    setChapters([]);
    setStudyDuration(60);
    setSelectedDays([]); // No default selection
    setPreferredTimes(['evening']);
    setConflictWarning(null);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setStartDate(tomorrow.toISOString().split('T')[0]);
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    setEndDate(threeMonths.toISOString().split('T')[0]);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        // Check if study plan limit is reached
        if (studyPlanLimit !== null && studyPlanCount >= studyPlanLimit) {
          return false;
        }
        // Syllabus and chapters are required (1-3 chapters mandatory)
        return selectedSubject && selectedGrade && selectedSyllabus && selectedChapters.length > 0 && selectedChapters.length <= 3;
      case 2:
        return studyDuration > 0 && selectedDays.length > 0;
      case 3:
        return preferredTimes.length > 0 && startDate && endDate && !dateRangeError;
      default:
        return false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3 relative">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-black" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Create Study Plan</h2>
                <p className="text-sm text-gray-600">AI-powered personalized schedule</p>
              </div>
              {/* Study Plan Creation Hint */}
              <ContextualHint
                show={shouldShowHint('studyPlanCreation') && !loading && !generating}
                onDismiss={() => markHintAsSeen('studyPlanCreation')}
                title="Create Your Study Plan"
                message="Fill in your subject, grade, and preferences. Our AI will create a personalized study schedule just for you!"
                position="bottom"
                arrowAlign="left"
              />
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          {/* AI Tokens Display */}
          <div className="px-3 py-2 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-purple-600 flex-shrink-0" />
              <div className="text-xs flex-1">
                <span className="text-gray-600">AI Tokens: </span>
                <span className="font-semibold text-gray-900">
                  {tokensLimit === null
                    ? `Unlimited`
                    : `${formatTokenCount(tokensUsed)} / ${formatTokenCount(tokensLimit)}`
                  }
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-600 mt-1.5 ml-6">
              Tokens will be used to generate your study plan
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className={`flex items-center space-x-2 ${step >= 1 ? 'text-black' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 1 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                1
              </div>
              <span className="text-sm font-medium hidden sm:inline">Grade & Subject</span>
            </div>
            <div className={`flex-1 h-1 mx-2 ${step >= 2 ? 'bg-black' : 'bg-gray-200'}`} />
            <div className={`flex items-center space-x-2 ${step >= 2 ? 'text-black' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 2 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                2
              </div>
              <span className="text-sm font-medium hidden sm:inline">Duration</span>
            </div>
            <div className={`flex-1 h-1 mx-2 ${step >= 3 ? 'bg-black' : 'bg-gray-200'}`} />
            <div className={`flex items-center space-x-2 ${step >= 3 ? 'text-black' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 3 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                3
              </div>
              <span className="text-sm font-medium hidden sm:inline">Schedule</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Grade, Subject, Syllabus & Chapters */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Study Plan Usage Display */}
              <div className={`px-3 py-2 rounded-lg border ${
                studyPlanLimit !== null && studyPlanCount >= studyPlanLimit
                  ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-300'
                  : studyPlanLimit !== null && studyPlanCount >= studyPlanLimit * 0.8
                  ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300'
                  : 'bg-gradient-to-r from-green-50 to-blue-50 border-green-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <BookOpen className={`w-4 h-4 flex-shrink-0 ${
                    studyPlanLimit !== null && studyPlanCount >= studyPlanLimit
                      ? 'text-red-600'
                      : studyPlanLimit !== null && studyPlanCount >= studyPlanLimit * 0.8
                      ? 'text-yellow-600'
                      : 'text-green-600'
                  }`} />
                  <div className="text-xs flex-1">
                    <span className="text-gray-600">Study Plans: </span>
                    <span className="font-semibold text-gray-900">
                      {loadingPlanInfo ? (
                        'Loading...'
                      ) : studyPlanLimit === null ? (
                        `${studyPlanCount} created (Unlimited)`
                      ) : (
                        `${Math.min(studyPlanCount, studyPlanLimit)} / ${studyPlanLimit}`
                      )}
                    </span>
                  </div>
                </div>
                {!loadingPlanInfo && studyPlanLimit !== null && (
                  <div className="text-xs mt-1.5 ml-6">
                    {studyPlanCount >= studyPlanLimit ? (
                      <span className="text-red-700 font-medium">
                        Limit reached. Please upgrade to create more study plans.
                      </span>
                    ) : studyPlanCount >= studyPlanLimit * 0.8 ? (
                      <span className="text-yellow-700">
                        {studyPlanLimit - studyPlanCount} study plan{studyPlanLimit - studyPlanCount > 1 ? 's' : ''} remaining
                      </span>
                    ) : (
                      <span className="text-gray-600">
                        {studyPlanLimit - studyPlanCount} study plan{studyPlanLimit - studyPlanCount > 1 ? 's' : ''} remaining
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Select Grade Level
                </label>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors text-gray-900 font-medium disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={grades.length === 1}
                >
                  <option value="">Choose a grade level...</option>
                  {grades.map(grade => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name}
                    </option>
                  ))}
                </select>
                {grades.length === 1 && (
                  <p className="text-xs text-gray-500 mt-2">This grade is assigned to your subscription</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Select Subject
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors text-gray-900 font-medium"
                  disabled={!selectedGrade}
                >
                  <option value="">Choose a subject...</option>
                  {subjects.map(subject => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                {!selectedGrade && (
                  <p className="text-xs text-gray-500 mt-2">Please select a grade level first</p>
                )}
              </div>

              {selectedSubject && selectedGrade && loading && (
                <div className="border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-center">
                    <Loader className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                    <span className="text-gray-600 text-sm">Loading chapters...</span>
                  </div>
                </div>
              )}

              {selectedSubject && selectedGrade && !loading && syllabi.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-900">
                    <strong>⚠️ No chapters available:</strong> Chapters are required to create a study plan.
                  </p>
                </div>
              )}

              {selectedSyllabus && !loading && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Select Chapters (1-{MAX_CHAPTERS} required) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-600 mb-3">
                    Select 1 to {MAX_CHAPTERS} chapters to focus on. Selected: {selectedChapters.length}/{MAX_CHAPTERS}
                  </p>
                  {loading ? (
                    <div className="border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center justify-center py-8">
                        <Loader className="w-6 h-6 animate-spin text-gray-400" />
                        <span className="ml-3 text-gray-600">Loading chapters...</span>
                      </div>
                    </div>
                  ) : chapters.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 space-y-2">
                      {chapters.map(chapter => (
                        <button
                          key={chapter.id}
                          onClick={() => toggleChapter(chapter.id)}
                          className={`w-full p-3 border-2 rounded-lg transition-all text-left ${
                            selectedChapters.includes(chapter.id)
                              ? 'border-black bg-gray-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                              selectedChapters.includes(chapter.id)
                                ? 'border-black bg-black'
                                : 'border-gray-300'
                            }`}>
                              {selectedChapters.includes(chapter.id) && (
                                <span className="text-white text-xs">✓</span>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className={`font-medium ${
                                selectedChapters.includes(chapter.id) ? 'text-black' : 'text-gray-900'
                              }`}>
                                Chapter {chapter.chapter_number}: {chapter.chapter_title}
                              </div>
                              {chapter.chapter_description && (
                                <div className="text-xs text-gray-600 mt-1">
                                  {chapter.chapter_description}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg p-6 text-center">
                      <div className="text-gray-500 text-sm">
                        <p className="mb-2">No chapters detected for the subject.</p>
                        <p className="text-xs">The AI will generate a study plan based on the subject curriculum.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Duration & Sessions */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Study Duration per Session
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="15"
                    max="180"
                    step="15"
                    value={studyDuration}
                    onChange={(e) => setStudyDuration(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-black"
                  />
                  <div className="flex items-center space-x-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-300">
                    <Clock className="w-5 h-5 text-black" />
                    <span className="font-bold text-black min-w-[4rem]">{studyDuration} min</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>15 min</span>
                  <span>3 hours</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Select Study Days
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                    <button
                      key={day}
                      onClick={() => toggleDay(day)}
                      className={`p-3 border-2 rounded-lg transition-all ${
                        selectedDays.includes(day)
                          ? 'border-black bg-gray-50 text-black'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-bold text-xs sm:text-sm">{day.slice(0, 3).toUpperCase()}</div>
                        <div className="text-xs hidden sm:block">{day.charAt(0).toUpperCase() + day.slice(1)}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Selected {selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''} per week
                </p>
                <button
                  onClick={checkTimeConflicts}
                  disabled={checkingConflicts || selectedDays.length === 0}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline disabled:opacity-50"
                >
                  {checkingConflicts ? 'Checking conflicts...' : 'Check for time conflicts'}
                </button>
                {conflictWarning && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-900">{conflictWarning}</p>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Recommendation:</strong> For optimal learning, we recommend 3-5 study sessions per week,
                  each lasting 45-90 minutes with regular breaks.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Schedule & Dates */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Preferred Study Times
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: 'morning', label: 'Morning', time: '6 AM - 12 PM', icon: '🌅' },
                    { value: 'afternoon', label: 'Afternoon', time: '12 PM - 6 PM', icon: '☀️' },
                    { value: 'evening', label: 'Evening', time: '6 PM - 11 PM', icon: '🌙' }
                  ].map(timeSlot => (
                    <button
                      key={timeSlot.value}
                      onClick={() => togglePreferredTime(timeSlot.value)}
                      className={`p-4 border-2 rounded-lg transition-all text-left ${
                        preferredTimes.includes(timeSlot.value)
                          ? 'border-black bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 mb-1">
                        <span className="text-2xl">{timeSlot.icon}</span>
                        <span className={`font-semibold ${
                          preferredTimes.includes(timeSlot.value) ? 'text-black' : 'text-gray-900'
                        }`}>
                          {timeSlot.label}
                        </span>
                      </div>
                      <span className="text-xs text-gray-600">{timeSlot.time}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">Select one or more preferred times</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    max={(() => {
                      const maxEndDate = new Date(startDate);
                      maxEndDate.setMonth(maxEndDate.getMonth() + 4);
                      return maxEndDate.toISOString().split('T')[0];
                    })()}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent ${
                      dateRangeError ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                  {dateRangeError && (
                    <p className="text-xs text-red-600 mt-1">{dateRangeError}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">Maximum 4 months from start date</p>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Sparkles className="w-5 h-5 text-black mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-black mb-1">AI Will Generate:</h4>
                    <ul className="text-sm text-gray-900 space-y-1">
                      <li>• Personalized study schedule based on your preferences</li>
                      <li>• Optimal topic distribution across sessions</li>
                      <li>• Progress tracking for all your study sessions</li>
                      <li>• Adaptive scheduling based on your pace</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-4 md:px-6 py-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="order-2 sm:order-1">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                disabled={generating}
                className="flex items-center justify-center space-x-2 px-4 py-2.5 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50 w-full sm:w-auto"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 order-1 sm:order-2">
            {/* Cancel button - hidden on mobile since there's an X button at the top */}
            <button
              onClick={onClose}
              disabled={generating}
              className="hidden md:block px-4 py-2.5 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-initial"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleGenerateStudyPlan}
                disabled={!canProceed() || generating}
                className="flex items-center justify-center space-x-2 px-6 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex-1 sm:flex-initial"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Study Plan</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CSS for slider */}
      <style>{`
        .slider-black::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #000000;
          cursor: pointer;
        }
        .slider-black::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #000000;
          cursor: pointer;
          border: none;
        }
      `}</style>

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />
    </div>
  );
}
