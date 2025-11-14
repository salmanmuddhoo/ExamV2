import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Lock,
  CheckCircle2,
  Circle,
  PlayCircle,
  SkipForward,
  Settings,
  ArrowLeft,
  Sparkles,
  Clock,
  BookOpen,
  Trash2,
  Eye,
  Grid3x3,
  List,
  X,
  Zap,
  Power,
  PowerOff,
  FileText,
  AlertCircle
} from 'lucide-react';
import { StudyPlanEvent, StudyPlanSchedule } from '../types/studyPlan';
import { StudyPlanWizard } from './StudyPlanWizard';
import { EventDetailModal } from './EventDetailModal';
import { formatTokenCount } from '../lib/formatUtils';
import { AlertModal } from './AlertModal';
import { ConfirmModal } from './ConfirmModal';
import { useFirstTimeHints } from '../contexts/FirstTimeHintsContext';
import { ContextualHint } from './ContextualHint';

interface StudyPlanCalendarProps {
  onBack: () => void;
  onOpenSubscriptions: () => void;
  tokensRemaining?: number;
  tokensLimit?: number | null;
  tokensUsed?: number;
  onRefreshTokens?: () => void;
}

export function StudyPlanCalendar({ onBack, onOpenSubscriptions, tokensRemaining = 0, tokensLimit = null, tokensUsed = 0, onRefreshTokens }: StudyPlanCalendarProps) {
  const { user } = useAuth();
  const { shouldShowHint, markHintAsSeen } = useFirstTimeHints();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [events, setEvents] = useState<StudyPlanEvent[]>([]);
  const [tierName, setTierName] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<StudyPlanEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [schedules, setSchedules] = useState<(StudyPlanSchedule & { subjects?: { name: string }; grade_levels?: { name: string } })[]>([]);
  const [showSchedules, setShowSchedules] = useState(false);
  const [mobileView, setMobileView] = useState<'calendar' | 'list'>('calendar');
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('month');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string | null>(null);
  const [showMobileDateModal, setShowMobileDateModal] = useState(false);
  const [mobileDateModalDate, setMobileDateModalDate] = useState<Date | null>(null);
  const [selectedScheduleFilter, setSelectedScheduleFilter] = useState<string | null>(null);
  const [accessibleSubjectIds, setAccessibleSubjectIds] = useState<string[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  // Progress tracking state
  const [scheduleProgress, setScheduleProgress] = useState<Record<string, { total: number; completed: number; percentage: number }>>({});

  // Alert modal state
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  // Confirm modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Summary modal state
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summarySchedule, setSummarySchedule] = useState<(StudyPlanSchedule & { subjects?: { name: string }; grade_levels?: { name: string } }) | null>(null);
  const [summaryEvents, setSummaryEvents] = useState<StudyPlanEvent[]>([]);

  useEffect(() => {
    checkAccess();
    if (user) {
      fetchAccessibleSubjects();
    }
  }, [user]);

  useEffect(() => {
    if (hasAccess && featureEnabled && accessibleSubjectIds.length >= 0) {
      fetchEvents();
      fetchSchedules();
    }
  }, [user, currentDate, hasAccess, featureEnabled, accessibleSubjectIds]);

  // Ensure selectedDate is always set to today if it becomes null
  useEffect(() => {
    if (!selectedDate) {
      setSelectedDate(new Date());
    }
  }, [selectedDate]);

  const checkAccess = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Check if feature is enabled globally using the helper function
      const { data: settingData, error: settingError } = await supabase
        .rpc('get_system_setting', { p_setting_key: 'study_plan_enabled' });

      if (settingError) throw settingError;

      const enabled = settingData?.enabled || false;
      setFeatureEnabled(enabled);

      if (!enabled) {
        setLoading(false);
        return;
      }

      // Check user's tier access
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
          subscription_tiers!inner(
            name,
            display_name,
            can_access_study_plan
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subError) throw subError;

      const canAccess = subscription?.subscription_tiers?.can_access_study_plan || false;
      const tier = subscription?.subscription_tiers?.name || 'free';

      setHasAccess(canAccess);
      setTierName(tier);
    } catch (error) {
      console.error('Error checking access:', error);
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchAccessibleSubjects = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('get_accessible_subjects_for_user', {
          p_user_id: user.id,
          p_grade_id: null
        });

      if (error) {
        console.error('Error fetching accessible subjects:', error);
        setAccessibleSubjectIds([]);
        return;
      }

      // Extract subject IDs from the returned data
      const subjectIds = (data || []).map((item: any) => item.subject_id);
      setAccessibleSubjectIds(subjectIds);
    } catch (error) {
      console.error('Error fetching accessible subjects:', error);
      setAccessibleSubjectIds([]);
    }
  };

  // Helper function to format date in local timezone (avoids UTC conversion issues)
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fetchEvents = async () => {
    if (!user) return;

    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error} = await supabase
        .from('study_plan_events')
        .select(`
          *,
          study_plan_schedules!inner(
            subjects(name, id),
            grade_levels(name),
            is_active
          )
        `)
        .eq('user_id', user.id)
        .eq('study_plan_schedules.is_active', true)
        .gte('event_date', formatDateLocal(startOfMonth))
        .lte('event_date', formatDateLocal(endOfMonth))
        .order('event_date', { ascending: true });

      if (error) {
        console.error('Error fetching events:', error);
        throw error;
      }

      // For Pro users, show all events without filtering
      // For other tiers, filter events based on accessible subjects
      let filteredData = data || [];
      if (tierName !== 'pro' && accessibleSubjectIds.length > 0) {
        filteredData = filteredData.filter((event: any) => {
          const subjectId = event.study_plan_schedules?.subjects?.id;
          return subjectId && accessibleSubjectIds.includes(subjectId);
        });
      }

      setEvents(filteredData);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  const fetchSchedules = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('study_plan_schedules')
        .select(`
          *,
          subjects(name, id),
          grade_levels(name)
        `)
        .eq('user_id', user.id)
        .is('deleted_at', null) // Only show non-deleted plans
        .order('created_at', { ascending: false });

      if (error) throw error;

      // For Pro users, show all schedules without filtering
      // For other tiers, filter schedules based on accessible subjects
      let filteredData = data || [];
      if (tierName !== 'pro' && accessibleSubjectIds.length > 0) {
        filteredData = filteredData.filter((schedule: any) => {
          const subjectId = schedule.subjects?.id;
          return subjectId && accessibleSubjectIds.includes(subjectId);
        });
      }

      setSchedules(filteredData);

      // Fetch progress for all schedules
      if (filteredData && filteredData.length > 0) {
        fetchScheduleProgress(filteredData.map(s => s.id));
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const fetchScheduleProgress = async (scheduleIds: string[]) => {
    if (!user || scheduleIds.length === 0) return;

    try {
      // Fetch all events for these schedules
      const { data: allEvents, error } = await supabase
        .from('study_plan_events')
        .select('schedule_id, status')
        .eq('user_id', user.id)
        .in('schedule_id', scheduleIds);

      if (error) throw error;

      // Calculate progress for each schedule and identify orphaned schedules
      const progressMap: Record<string, { total: number; completed: number; percentage: number }> = {};
      const orphanedScheduleIds: string[] = [];
      const now = new Date();

      scheduleIds.forEach(scheduleId => {
        const scheduleEvents = allEvents?.filter(e => e.schedule_id === scheduleId) || [];
        const total = scheduleEvents.length;
        const completed = scheduleEvents.filter(e => e.status === 'completed').length;
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        progressMap[scheduleId] = { total, completed, percentage };

        // Track schedules with no events (orphaned from failed AI generation)
        // Only mark as orphaned if created more than 10 minutes ago (to avoid deleting during active generation)
        if (total === 0) {
          const schedule = schedules.find(s => s.id === scheduleId);
          if (schedule) {
            const createdAt = new Date(schedule.created_at);
            const minutesSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60);

            // Only cleanup schedules older than 10 minutes with no events
            if (minutesSinceCreation > 10) {
              orphanedScheduleIds.push(scheduleId);
            }
          }
        }
      });

      setScheduleProgress(progressMap);

      // Clean up old orphaned schedules (schedules with no events created >10 minutes ago)
      if (orphanedScheduleIds.length > 0) {
        console.log('Cleaning up old orphaned schedules (>10 min old):', orphanedScheduleIds);
        const { error: deleteError } = await supabase
          .from('study_plan_schedules')
          .update({ deleted_at: new Date().toISOString() })
          .in('id', orphanedScheduleIds);

        if (deleteError) {
          console.error('Error cleaning up orphaned schedules:', deleteError);
        } else {
          // Refresh schedules after cleanup
          fetchSchedules();
        }
      }
    } catch (error) {
      console.error('Error fetching schedule progress:', error);
    }
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    setConfirmConfig({
      title: 'Delete Study Plan',
      message: 'Are you sure you want to delete this study plan? This will free up a slot for creating new study plans for this subject and grade.',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('study_plan_schedules')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', scheduleId);

          if (error) throw error;

          fetchSchedules();
          fetchEvents();
          setAlertConfig({
            title: 'Success',
            message: 'Study plan deleted successfully',
            type: 'success'
          });
          setShowAlert(true);
        } catch (error) {
          console.error('Error deleting schedule:', error);
          setAlertConfig({
            title: 'Error',
            message: 'Failed to delete study plan',
            type: 'error'
          });
          setShowAlert(true);
        }
      }
    });
    setShowConfirm(true);
  };

  const handleToggleScheduleActive = async (scheduleId: string, currentlyActive: boolean, subjectId: string, gradeId: string, isCompleted?: boolean) => {
    try {
      // Prevent reactivating completed plans
      if (!currentlyActive && isCompleted) {
        setAlertConfig({
          title: 'Cannot Reactivate',
          message: 'A completed study plan cannot be reactivated. Please create a new study plan instead.',
          type: 'warning'
        });
        setShowAlert(true);
        return;
      }

      if (!currentlyActive) {
        // Activating this plan - first deactivate any other active plan for same subject/grade
        const { error: deactivateError } = await supabase
          .from('study_plan_schedules')
          .update({ is_active: false })
          .eq('user_id', user?.id)
          .eq('subject_id', subjectId)
          .eq('grade_id', gradeId)
          .eq('is_active', true);

        if (deactivateError) throw deactivateError;
      }

      // Toggle this plan's active status
      const { error } = await supabase
        .from('study_plan_schedules')
        .update({ is_active: !currentlyActive })
        .eq('id', scheduleId);

      if (error) throw error;

      fetchSchedules();
      fetchEvents();
      setAlertConfig({
        title: 'Success',
        message: `Study plan ${!currentlyActive ? 'activated' : 'deactivated'} successfully`,
        type: 'success'
      });
      setShowAlert(true);
    } catch (error) {
      console.error('Error toggling schedule active status:', error);
      setAlertConfig({
        title: 'Error',
        message: 'Failed to update study plan status',
        type: 'error'
      });
      setShowAlert(true);
    }
  };

  const handleShowSummary = async (schedule: StudyPlanSchedule & { subjects?: { name: string }; grade_levels?: { name: string } }) => {
    if (!user) return;

    try {
      // Fetch all events for this schedule
      const { data, error } = await supabase
        .from('study_plan_events')
        .select(`
          *,
          study_plan_schedules!inner(
            subjects(name, id),
            is_active
          )
        `)
        .eq('user_id', user.id)
        .eq('schedule_id', schedule.id)
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;

      setSummarySchedule(schedule);
      setSummaryEvents(data || []);
      setShowSummaryModal(true);
    } catch (error) {
      console.error('Error fetching summary events:', error);
      setAlertConfig({
        title: 'Error',
        message: 'Failed to load study plan summary',
        type: 'error'
      });
      setShowAlert(true);
    }
  };

  const handleUpdateEventStatus = async (eventId: string, status: StudyPlanEvent['status']) => {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('study_plan_events')
        .update(updateData)
        .eq('id', eventId);

      if (error) throw error;

      // Update local state
      setEvents(prev => prev.map(event =>
        event.id === eventId
          ? { ...event, ...updateData }
          : event
      ));

      // Refresh progress for all schedules to update progress bars
      if (schedules.length > 0) {
        fetchScheduleProgress(schedules.map(s => s.id));
      }
    } catch (error) {
      console.error('Error updating event status:', error);
    }
  };

  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  const getDaysInWeek = () => {
    const startOfWeek = new Date(selectedDate || currentDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day); // Go to Sunday

    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  };

  const getSingleDay = () => {
    return [selectedDate || currentDate];
  };

  const getDisplayDays = () => {
    switch (calendarView) {
      case 'day':
        return getSingleDay();
      case 'week':
        return getDaysInWeek();
      case 'month':
      default:
        return getDaysInMonth();
    }
  };

  const getEventsForDate = (date: Date | null) => {
    if (!date) return [];
    const dateStr = formatDateLocal(date);
    let filteredEvents = events.filter(event => event.event_date === dateStr);

    // Apply subject filter if selected
    if (selectedSubjectFilter) {
      filteredEvents = filteredEvents.filter(event => {
        const subjectId = (event as any).study_plan_schedules?.subjects?.id;
        return subjectId === selectedSubjectFilter;
      });
    }

    // Apply schedule filter if selected
    if (selectedScheduleFilter) {
      filteredEvents = filteredEvents.filter(event => {
        return event.schedule_id === selectedScheduleFilter;
      });
    }

    // Sort by start_time (chronological order)
    filteredEvents.sort((a, b) => {
      const timeA = a.start_time || '';
      const timeB = b.start_time || '';
      return timeA.localeCompare(timeB);
    });

    return filteredEvents;
  };

  const formatTime = (timeStr: string) => {
    // Parse HH:MM or HH:MM:SS format and format according to user's locale
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0]);
      const minutes = parseInt(timeParts[1]);

      // Create a date object with the time (date doesn't matter for formatting)
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);

      // Format using user's locale (automatically uses 12/24 hour based on locale)
      return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: undefined // Let the locale decide
      });
    }
    return timeStr;
  };

  // Format event title to show subject first
  const formatEventTitle = (event: StudyPlanEvent) => {
    const subjectName = (event as any).study_plan_schedules?.subjects?.name;
    if (!subjectName) return event.title;

    // If title already starts with subject, return as is
    if (event.title.startsWith(subjectName)) return event.title;

    // Otherwise, prepend subject to title
    return `${subjectName}: ${event.title}`;
  };

  // Get unique subjects from events
  const getUniqueSubjects = () => {
    const subjectsMap = new Map();
    events.forEach(event => {
      const schedule = (event as any).study_plan_schedules;
      if (schedule?.subjects) {
        subjectsMap.set(schedule.subjects.id, schedule.subjects.name);
      }
    });
    return Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name }));
  };

  // Group schedules by subject
  const getSchedulesBySubject = () => {
    const grouped = new Map<string, typeof schedules>();
    schedules.forEach(schedule => {
      const subjectName = schedule.subjects?.name || 'Unknown Subject';
      if (!grouped.has(subjectName)) {
        grouped.set(subjectName, []);
      }
      grouped.get(subjectName)!.push(schedule);
    });
    return Array.from(grouped.entries()).map(([subject, schedules]) => ({
      subject,
      schedules
    }));
  };

  // Toggle subject expand/collapse state
  const toggleSubjectCollapse = (subject: string) => {
    setExpandedSubjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subject)) {
        newSet.delete(subject);
      } else {
        newSet.add(subject);
      }
      return newSet;
    });
  };

  // Filter events by subject and schedule
  const getFilteredEvents = () => {
    let filteredEvents = events;

    // Filter by subject
    if (selectedSubjectFilter) {
      filteredEvents = filteredEvents.filter(event => {
        const subjectId = (event as any).study_plan_schedules?.subjects?.id;
        return subjectId === selectedSubjectFilter;
      });
    }

    // Filter by schedule
    if (selectedScheduleFilter) {
      filteredEvents = filteredEvents.filter(event => {
        return event.schedule_id === selectedScheduleFilter;
      });
    }

    return filteredEvents;
  };

  // Group events by subject
  const getEventsBySubject = () => {
    const grouped = new Map<string, { name: string; events: StudyPlanEvent[] }>();

    events.forEach(event => {
      const schedule = (event as any).study_plan_schedules;
      if (schedule?.subjects) {
        const subjectId = schedule.subjects.id;
        const subjectName = schedule.subjects.name;

        if (!grouped.has(subjectId)) {
          grouped.set(subjectId, { name: subjectName, events: [] });
        }
        grouped.get(subjectId)!.events.push(event);
      }
    });

    return Array.from(grouped.values());
  };

  // Helper function to parse date string in local timezone
  const parseDateLocal = (dateStr: string): Date => {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Check if an event is overdue
  const isEventOverdue = (event: StudyPlanEvent) => {
    if (event.status === 'completed' || event.status === 'skipped') {
      return false; // Completed and skipped events are never overdue
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const eventDate = parseDateLocal(event.event_date);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate < today;
  };

  const getStatusIcon = (status: StudyPlanEvent['status'], isOverdue = false) => {
    if (isOverdue) {
      return <AlertCircle className="w-4 h-4 text-red-600" />;
    }
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'in_progress':
        return <PlayCircle className="w-4 h-4 text-blue-600" />;
      case 'skipped':
        return <SkipForward className="w-4 h-4 text-gray-400" />;
      default:
        return <Circle className="w-4 h-4 text-gray-300" />;
    }
  };

  const getStatusColor = (status: StudyPlanEvent['status'], isOverdue = false) => {
    if (isOverdue) {
      return 'bg-red-100 border-red-400 text-red-900';
    }
    switch (status) {
      case 'completed':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'skipped':
        return 'bg-gray-100 border-gray-300 text-gray-600';
      default:
        return 'bg-white border-gray-200 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
          <p className="text-gray-600">Loading study plan...</p>
        </div>
      </div>
    );
  }

  if (!featureEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-black" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Feature Not Available</h2>
          <p className="text-gray-600 mb-6">
            The Study Plan feature is currently under development and not available at this time.
          </p>
          <button
            onClick={onBack}
            className="w-full px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Go Back</span>
          </button>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-black" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Upgrade to Access Study Plans</h2>
          <p className="text-gray-600 mb-6">
            AI-powered study plans are available for Student and Pro tier subscribers. Upgrade your plan to create personalized study schedules.
          </p>
          <div className="space-y-3">
            <button
              onClick={onOpenSubscriptions}
              className="w-full px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-all flex items-center justify-center space-x-2"
            >
              <Sparkles className="w-5 h-5" />
              <span>Upgrade Now</span>
            </button>
            <button
              onClick={onBack}
              className="w-full px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center space-x-2"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Go Back</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const days = getDisplayDays();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="min-h-screen bg-gray-50 overflow-x-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Study Plan</h1>
                <p className="hidden md:block text-sm text-gray-600">AI-powered personalized schedule</p>
              </div>
              {/* AI Tokens Display */}
              <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
                <Zap className="w-4 h-4 text-purple-600" />
                <div className="text-xs">
                  <span className="text-gray-600">AI Tokens: </span>
                  <span className="font-semibold text-gray-900">
                    {tokensLimit === null
                      ? `Unlimited`
                      : `${formatTokenCount(tokensUsed)} / ${formatTokenCount(tokensLimit)}`
                    }
                  </span>
                </div>
              </div>
            </div>
            <button
              data-hint="create-plan-button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Create Plan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mobile: Show/Hide button and Filter on same line */}
        {schedules.length > 0 && schedules.filter(s => s.is_active).length > 0 && (
          <div className="md:hidden mb-4 flex gap-2">
            {/* Show/Hide Toggle Button */}
            <button
              onClick={() => setShowSchedules(!showSchedules)}
              className="flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white rounded-lg shadow-sm border border-gray-200 whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5 flex-shrink-0" />
              <span>{showSchedules ? 'Hide' : 'Show'} Plans</span>
            </button>

            {/* Filter Dropdown */}
            <select
              data-hint="plan-filter"
              value={selectedSubjectFilter || ''}
              onChange={(e) => {
                setSelectedSubjectFilter(e.target.value || null);
                setSelectedScheduleFilter(null);
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent bg-white"
            >
              <option value="">All Subjects</option>
              {getUniqueSubjects().map(subject => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Desktop: Original layout for Show/Hide button */}
        {schedules.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowSchedules(!showSchedules)}
              className="hidden md:flex items-center space-x-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-3"
            >
              <Eye className="w-4 h-4" />
              <span>{showSchedules ? 'Hide' : 'Show'} Active Study Plans ({schedules.length})</span>
            </button>

            {showSchedules && (
              <div className="space-y-4 mb-6">
                {getSchedulesBySubject().map(({ subject, schedules: subjectSchedules }) => (
                  <div key={subject} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    {/* Subject Header - Clickable to expand/collapse */}
                    <button
                      onClick={() => toggleSubjectCollapse(subject)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 hover:from-blue-100 hover:to-blue-150 transition-colors"
                    >
                      <div className="flex items-center space-x-2">
                        <BookOpen className="w-5 h-5 text-blue-700" />
                        <h3 className="text-base font-bold text-gray-900">{subject}</h3>
                        <span className="text-sm text-gray-600">({subjectSchedules.length} plan{subjectSchedules.length > 1 ? 's' : ''})</span>
                      </div>
                      <ChevronDown
                        className={`w-5 h-5 text-blue-700 transition-transform ${
                          expandedSubjects.has(subject) ? '' : '-rotate-90'
                        }`}
                      />
                    </button>

                    {/* Study Plans Table - Scrollable with max height */}
                    {expandedSubjects.has(subject) && (
                      <div className="max-h-96 overflow-y-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-2 md:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Plan
                            </th>
                            <th className="hidden sm:table-cell px-2 md:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Grade
                            </th>
                            <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Duration
                            </th>
                            <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Sessions/Week
                            </th>
                            <th className="px-2 md:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Period
                            </th>
                            <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Times
                            </th>
                            <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Created
                            </th>
                            <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Progress
                            </th>
                            <th className="px-2 md:px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {subjectSchedules.map((schedule, idx) => (
                            <tr key={schedule.id} className={`hover:bg-gray-50 transition-colors ${schedule.is_completed ? 'bg-blue-50 md:bg-white' : ''}`}>
                              <td className="px-2 md:px-4 py-3 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    Plan #{idx + 1}
                                  </span>
                                  {schedule.is_completed && (
                                    <span className="md:hidden inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                                      <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />
                                      Done
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="hidden sm:table-cell px-2 md:px-4 py-3 whitespace-nowrap">
                                <span className="text-sm text-gray-700">
                                  {schedule.grade_levels?.name || 'N/A'}
                                </span>
                              </td>
                              <td className="hidden lg:table-cell px-4 py-3 whitespace-nowrap">
                                <span className="text-sm text-gray-700">
                                  {schedule.study_duration_minutes} min
                                </span>
                              </td>
                              <td className="hidden lg:table-cell px-4 py-3 whitespace-nowrap">
                                <span className="text-sm text-gray-700">
                                  {schedule.sessions_per_week}
                                </span>
                              </td>
                              <td className="px-2 md:px-4 py-3 whitespace-nowrap">
                                <span className="text-xs md:text-sm text-gray-700">
                                  {new Date(schedule.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                                  {schedule.end_date && ` - ${new Date(schedule.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}`}
                                </span>
                              </td>
                              <td className="hidden lg:table-cell px-4 py-3">
                                {schedule.preferred_times && schedule.preferred_times.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {schedule.preferred_times.map((time, tidx) => (
                                      <span
                                        key={tidx}
                                        className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                      >
                                        {time}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                              <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap">
                                {schedule.is_completed ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    <CheckCircle2 className="w-3 h-3 mr-1.5" />
                                    Completed
                                  </span>
                                ) : schedule.is_active ? (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-600 mr-1.5"></span>
                                    Active
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5"></span>
                                    Inactive
                                  </span>
                                )}
                              </td>
                              <td className="hidden lg:table-cell px-4 py-3 whitespace-nowrap">
                                <span className="text-xs text-gray-600">
                                  {new Date(schedule.created_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              </td>
                              <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap">
                                {(() => {
                                  const progress = scheduleProgress[schedule.id];
                                  if (!progress || progress.total === 0) {
                                    return <span className="text-sm text-gray-400">No sessions</span>;
                                  }

                                  const isCompleted = progress.percentage === 100;

                                  return (
                                    <div className="flex items-center space-x-2">
                                      <div className="flex-1 min-w-[100px]">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs font-medium text-gray-700">
                                            {progress.completed}/{progress.total}
                                          </span>
                                          <span className={`text-xs font-semibold ${
                                            isCompleted ? 'text-green-600' : 'text-gray-600'
                                          }`}>
                                            {progress.percentage}%
                                          </span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                          <div
                                            className={`h-full transition-all duration-300 ${
                                              isCompleted
                                                ? 'bg-green-500'
                                                : progress.percentage >= 75
                                                ? 'bg-blue-500'
                                                : progress.percentage >= 50
                                                ? 'bg-yellow-500'
                                                : 'bg-orange-500'
                                            }`}
                                            style={{ width: `${progress.percentage}%` }}
                                          />
                                        </div>
                                      </div>
                                      {isCompleted && (
                                        <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="px-2 md:px-4 py-3 whitespace-nowrap text-right">
                                <div className="flex items-center justify-end space-x-1 md:space-x-2">
                                  <button
                                    onClick={() => handleToggleScheduleActive(schedule.id, schedule.is_active, schedule.subject_id, schedule.grade_id, schedule.is_completed)}
                                    className={`p-1 md:p-1.5 rounded transition-colors ${
                                      schedule.is_completed
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : schedule.is_active
                                        ? 'bg-green-100 hover:bg-green-200 text-green-700'
                                        : 'bg-red-100 hover:bg-red-200 text-red-700'
                                    }`}
                                    title={schedule.is_completed ? 'Completed - Cannot reactivate' : schedule.is_active ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
                                    disabled={schedule.is_completed}
                                  >
                                    {schedule.is_active ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    ) : (
                                      <PlayCircle className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleShowSummary(schedule)}
                                    className="p-1 md:p-1.5 hover:bg-blue-50 rounded transition-colors"
                                    title="View summary of all sessions"
                                  >
                                    <FileText className="w-3.5 h-3.5 md:w-4 md:h-4 text-blue-600" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                    className="p-1 md:p-1.5 hover:bg-red-50 rounded transition-colors"
                                    title="Delete study plan"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-red-600" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Footer with count */}
                      {subjectSchedules.length > 5 && (
                        <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600 text-center">
                          Showing {subjectSchedules.length} plan{subjectSchedules.length > 1 ? 's' : ''} • Scroll to view all
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Desktop: Filters */}
        {schedules.filter(s => s.is_active).length > 0 && (
          <div className="hidden md:block mb-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-3">Filter by Study Plan</label>

            {/* Subject Dropdown */}
            <div className="mb-3">
              <select
                value={selectedSubjectFilter || ''}
                onChange={(e) => {
                  setSelectedSubjectFilter(e.target.value || null);
                  setSelectedScheduleFilter(null); // Reset plan filter when subject changes
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
              >
                <option value="">All Subjects</option>
                {getUniqueSubjects().map(subject => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Active Plans for Selected Subject */}
            {selectedSubjectFilter && schedules.filter(s => s.is_active && s.subject_id === selectedSubjectFilter).length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Select Plan</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedScheduleFilter(null)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      !selectedScheduleFilter
                        ? 'bg-black text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All Plans
                  </button>
                  {schedules.filter(s => s.is_active && s.subject_id === selectedSubjectFilter).map((schedule, idx) => (
                    <button
                      key={schedule.id}
                      onClick={() => setSelectedScheduleFilter(schedule.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        selectedScheduleFilter === schedule.id
                          ? 'bg-black text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Plan #{idx + 1} ({schedule.grade_levels?.name})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile: Plan Selection Buttons */}
        {selectedSubjectFilter && schedules.filter(s => s.is_active && s.subject_id === selectedSubjectFilter).length > 1 && (
          <div className="md:hidden mb-4 bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <label className="block text-xs font-medium text-gray-600 mb-2">Select Plan</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedScheduleFilter(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  !selectedScheduleFilter
                    ? 'bg-black text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Plans
              </button>
              {schedules.filter(s => s.is_active && s.subject_id === selectedSubjectFilter).map((schedule, idx) => (
                <button
                  key={schedule.id}
                  onClick={() => setSelectedScheduleFilter(schedule.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedScheduleFilter === schedule.id
                      ? 'bg-black text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Plan #{idx + 1} ({schedule.grade_levels?.name})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Calendar Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden max-w-full">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative">
                <h2 className="text-lg font-semibold text-gray-900">
                  {calendarView === 'day'
                    ? (selectedDate || currentDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                    : calendarView === 'week'
                    ? `Week of ${getDaysInWeek()[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
                  }
                </h2>
                {/* Calendar Task Viewing Hint */}
                <ContextualHint
                  show={shouldShowHint('calendarTaskViewing') && events.length > 0 && !loading}
                  onDismiss={() => markHintAsSeen('calendarTaskViewing')}
                  title="View Your Study Sessions"
                  message="Click on any study session to view details, mark it as in-progress, or complete it. Track your progress!"
                  position="bottom"
                  arrowAlign="left"
                />
              </div>

              {/* View Toggle - Desktop */}
              <div className="hidden md:flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setCalendarView('day')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    calendarView === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Day
                </button>
                <button
                  onClick={() => setCalendarView('week')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    calendarView === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setCalendarView('month')}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    calendarView === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Month
                </button>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    if (calendarView === 'day') {
                      const newDate = new Date(selectedDate || currentDate);
                      newDate.setDate(newDate.getDate() - 1);
                      setSelectedDate(newDate);
                      setCurrentDate(newDate);
                    } else if (calendarView === 'week') {
                      const newDate = new Date(selectedDate || currentDate);
                      newDate.setDate(newDate.getDate() - 7);
                      setSelectedDate(newDate);
                      setCurrentDate(newDate);
                    } else {
                      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
                    }
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <button
                  onClick={() => {
                    const today = new Date();
                    setCurrentDate(today);
                    setSelectedDate(today);
                  }}
                  className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    if (calendarView === 'day') {
                      const newDate = new Date(selectedDate || currentDate);
                      newDate.setDate(newDate.getDate() + 1);
                      setSelectedDate(newDate);
                      setCurrentDate(newDate);
                    } else if (calendarView === 'week') {
                      const newDate = new Date(selectedDate || currentDate);
                      newDate.setDate(newDate.getDate() + 7);
                      setSelectedDate(newDate);
                      setCurrentDate(newDate);
                    } else {
                      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
                    }
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* View Toggle - Mobile */}
            <div className="flex md:hidden items-center justify-center space-x-1 mt-3 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setCalendarView('day')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-1 ${
                  calendarView === 'day' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setCalendarView('week')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-1 ${
                  calendarView === 'week' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setCalendarView('month')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-1 ${
                  calendarView === 'month' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                }`}
              >
                Month
              </button>
            </div>

            {/* Mobile View Toggle (Calendar/List) */}
            <div className="flex md:hidden items-center justify-center space-x-2 mt-2 bg-gray-50 p-1 rounded-lg">
              <button
                onClick={() => setMobileView('calendar')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-all flex-1 justify-center ${
                  mobileView === 'calendar'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                <Grid3x3 className="w-4 h-4" />
                <span className="text-sm font-medium">Calendar</span>
              </button>
              <button
                onClick={() => setMobileView('list')}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-all flex-1 justify-center ${
                  mobileView === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                <List className="w-4 h-4" />
                <span className="text-sm font-medium">List</span>
              </button>
            </div>
          </div>

          {/* Desktop Calendar Grid with Right Panel */}
          <div className="hidden md:flex p-6 gap-6 max-w-full overflow-x-hidden" data-hint="calendar-view">
            {/* Calendar Grid */}
            <div className="w-2/3 transition-all min-w-0">
              {calendarView === 'month' && (
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {dayNames.map(day => (
                    <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
                      {day}
                    </div>
                  ))}
                </div>
              )}
              {calendarView === 'week' && (
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {getDaysInWeek().map((day, idx) => (
                    <div key={idx} className="text-center text-sm font-semibold text-gray-600 py-2">
                      <div>{dayNames[day.getDay()]}</div>
                      <div className="text-xs text-gray-500">{day.getDate()}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`grid ${calendarView === 'day' ? 'grid-cols-1' : 'grid-cols-7'} gap-2`}>
                {days.map((day, index) => {
                  const dayEvents = getEventsForDate(day);
                  const isToday = day && day.toDateString() === new Date().toDateString();
                  const isSelected = day && selectedDate && day.toDateString() === selectedDate.toDateString();

                  return (
                    <div
                      key={index}
                      className={`${calendarView === 'month' ? 'min-h-[80px]' : calendarView === 'week' ? 'min-h-[200px]' : 'min-h-[400px]'} p-2 border rounded-lg transition-all ${
                        day
                          ? 'bg-white hover:bg-gray-50 cursor-pointer border-gray-200'
                          : 'bg-gray-50 border-gray-100'
                      } ${isToday ? 'ring-2 ring-black' : ''} ${isSelected ? 'ring-2 ring-gray-700 bg-gray-50' : ''}`}
                      onClick={() => day && setSelectedDate(day)}
                    >
                      {day && (
                        <>
                          <div className={`text-sm font-semibold mb-2 ${
                            isToday ? 'text-black font-bold' : isSelected ? 'text-gray-900 font-bold' : 'text-gray-900'
                          }`}>
                            {calendarView === 'day' ? day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : day.getDate()}
                          </div>
                          <div className="space-y-1 overflow-y-auto" style={{ maxHeight: calendarView === 'month' ? '60px' : 'calc(100% - 40px)' }}>
                            {dayEvents.slice(0, calendarView === 'month' ? 2 : calendarView === 'week' ? 8 : 20).map(event => (
                              <div
                                key={event.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEvent(event);
                                  setShowEventModal(true);
                                }}
                                className={`text-xs p-1 rounded border ${getStatusColor(event.status, isEventOverdue(event))} truncate cursor-pointer hover:shadow-md transition-shadow`}
                              >
                                <div className="flex items-center space-x-1">
                                  {getStatusIcon(event.status, isEventOverdue(event))}
                                  <span className="truncate">{formatEventTitle(event)}</span>
                                </div>
                              </div>
                            ))}
                            {dayEvents.length > (calendarView === 'month' ? 2 : calendarView === 'week' ? 8 : 20) && (
                              <div className="text-xs text-center font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                +{dayEvents.length - (calendarView === 'month' ? 2 : calendarView === 'week' ? 8 : 20)}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Daily Tasks */}
            {(() => {
              if (!selectedDate) return null;

              const dateEvents = getEventsForDate(selectedDate);

              return (
                <div className="w-1/3 border-l border-gray-200 pl-6 min-h-[400px]">
                  <div className="sticky top-24">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {selectedDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {selectedDate.toLocaleDateString(undefined, { weekday: 'long' })}
                        </p>
                      </div>
                    </div>

                    {dateEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Calendar className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-sm font-medium text-gray-900 mb-2">No tasks scheduled</p>
                      <p className="text-xs text-gray-600 mb-4">
                        {events.length === 0
                          ? 'Create your first study plan to get started'
                          : 'Select a different date or create a new study plan'}
                      </p>
                      {events.length === 0 && (
                        <button
                          onClick={() => setShowCreateModal(true)}
                          className="inline-flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create Study Plan</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[calc(100vh-16rem)] overflow-y-auto pr-2">
                      {dateEvents.map(event => {
                        const subjectName = (event as any).study_plan_schedules?.subjects?.name;
                        return (
                          <div
                            key={event.id}
                            onClick={() => {
                              setSelectedEvent(event);
                              setShowEventModal(true);
                            }}
                            className={`p-4 rounded-lg border ${getStatusColor(event.status, isEventOverdue(event))} cursor-pointer hover:shadow-lg transition-all`}
                          >
                            {/* Subject Badge - Prominent at top */}
                            {subjectName && (
                              <div className="mb-3">
                                <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm">
                                  <BookOpen className="w-4 h-4 mr-1.5" />
                                  {subjectName}
                                </span>
                              </div>
                            )}

                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2 flex-1">
                                {getStatusIcon(event.status, isEventOverdue(event))}
                                <span className="font-semibold text-sm">{formatEventTitle(event)}</span>
                              </div>
                            </div>

                            {event.description && (
                              <p className="text-sm text-gray-700 mb-2 line-clamp-2">{event.description}</p>
                            )}

                            <div className="flex items-center space-x-4 text-xs text-gray-600">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3" />
                                <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                              </div>
                            </div>

                            {event.topics && event.topics.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {event.topics.slice(0, 3).map((topic, idx) => (
                                  <span
                                    key={idx}
                                    className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                  >
                                    {topic}
                                  </span>
                                ))}
                                {event.topics.length > 3 && (
                                  <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                    +{event.topics.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Mobile Calendar Grid */}
          {mobileView === 'calendar' && (
            <div className="md:hidden p-4 max-w-full overflow-x-hidden">
              {calendarView === 'month' && (
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                    <div key={idx} className="text-center text-xs font-semibold text-gray-600 py-2">
                      {day}
                    </div>
                  ))}
                </div>
              )}
              {calendarView === 'week' && (
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {getDaysInWeek().map((day, idx) => (
                    <div key={idx} className="text-center text-xs font-semibold text-gray-600 py-2">
                      <div>{['S', 'M', 'T', 'W', 'T', 'F', 'S'][day.getDay()]}</div>
                      <div className="text-[10px] text-gray-500">{day.getDate()}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`grid ${calendarView === 'day' ? 'grid-cols-1' : 'grid-cols-7'} gap-1`}>
                {days.map((day, index) => {
                  const dayEvents = getEventsForDate(day);
                  const isToday = day && day.toDateString() === new Date().toDateString();
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <div
                      key={index}
                      onClick={() => {
                        if (day) {
                          setMobileDateModalDate(day);
                          setShowMobileDateModal(true);
                        }
                      }}
                      className={`${calendarView === 'month' ? 'min-h-[60px]' : calendarView === 'week' ? 'min-h-[120px]' : 'min-h-[300px]'} p-1 border rounded transition-all ${
                        day
                          ? hasEvents
                            ? 'bg-white hover:bg-gray-50 cursor-pointer border-gray-200'
                            : 'bg-white border-gray-100'
                          : 'bg-gray-50 border-gray-100'
                      } ${isToday ? 'ring-2 ring-black' : ''}`}
                    >
                      {day && (
                        <>
                          <div className={`text-xs font-semibold mb-0.5 ${
                            isToday ? 'text-black font-bold' : 'text-gray-900'
                          }`}>
                            {calendarView === 'day' ? day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : day.getDate()}
                          </div>
                          {hasEvents && (
                            <div className="space-y-0.5 overflow-hidden">
                              {calendarView === 'month' ? (
                                <>
                                  {dayEvents.slice(0, 2).map((event) => (
                                    <div
                                      key={event.id}
                                      className={`w-full h-1.5 rounded-full ${
                                        isEventOverdue(event) ? 'bg-red-500' :
                                        event.status === 'completed' ? 'bg-green-500' :
                                        event.status === 'in_progress' ? 'bg-blue-500' :
                                        event.status === 'skipped' ? 'bg-gray-300' :
                                        'bg-gray-700'
                                      }`}
                                    />
                                  ))}
                                  {dayEvents.length > 2 && (
                                    <div className="text-[11px] text-center font-bold text-blue-700 bg-blue-100 px-1 py-0.5 rounded mt-0.5">
                                      +{dayEvents.length - 2}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  {dayEvents.slice(0, calendarView === 'week' ? 5 : 15).map((event) => (
                                    <div
                                      key={event.id}
                                      className={`text-[10px] p-0.5 rounded border ${getStatusColor(event.status, isEventOverdue(event))}`}
                                    >
                                      <div className="flex items-center space-x-0.5">
                                        {getStatusIcon(event.status, isEventOverdue(event))}
                                        <span className="truncate text-[9px]">{formatEventTitle(event)}</span>
                                      </div>
                                    </div>
                                  ))}
                                  {dayEvents.length > (calendarView === 'week' ? 5 : 15) && (
                                    <div className="text-[10px] text-gray-500 text-center font-medium">
                                      +{dayEvents.length - (calendarView === 'week' ? 5 : 15)}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mobile Calendar List */}
          {mobileView === 'list' && (
            <div className="md:hidden p-4 space-y-3">
            {getFilteredEvents().length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BookOpen className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Study Plans Yet</h3>
                <p className="text-gray-600 mb-4">Create your first AI-powered study plan to get started</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-all flex items-center justify-center space-x-2 mx-auto"
                >
                  <Plus className="w-5 h-5" />
                  <span>Create Study Plan</span>
                </button>
              </div>
            ) : (
              getFilteredEvents().map(event => (
                <div
                  key={event.id}
                  onClick={() => {
                    setSelectedEvent(event);
                    setShowEventModal(true);
                  }}
                  className={`p-4 rounded-lg border ${getStatusColor(event.status, isEventOverdue(event))} cursor-pointer hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(event.status, isEventOverdue(event))}
                      <span className="font-semibold">{formatEventTitle(event)}</span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {new Date(event.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-sm text-gray-700 mb-2 line-clamp-2">{event.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      {event.status !== 'completed' && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateEventStatus(event.id, 'in_progress');
                            }}
                            className="p-1 hover:bg-blue-200 rounded transition-colors"
                            title="Mark In Progress"
                          >
                            <PlayCircle className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateEventStatus(event.id, 'completed');
                            }}
                            className="p-1 hover:bg-green-200 rounded transition-colors"
                            title="Mark Completed"
                          >
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            </div>
          )}
        </div>

        {/* Empty State */}
        {getFilteredEvents().length === 0 && (
          <div className="hidden md:block mt-8 bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-10 h-10 text-black" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Study Plans Yet</h3>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Create your first AI-powered study plan to organize your learning schedule and track your progress
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-all flex items-center justify-center space-x-2 mx-auto"
            >
              <Plus className="w-5 h-5" />
              <span>Create Study Plan</span>
            </button>
          </div>
        )}
      </div>

      {/* Study Plan Wizard */}
      <StudyPlanWizard
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchEvents();
          fetchSchedules();  // Also fetch schedules to show the newly created plan
          setShowCreateModal(false);
          // Show success message
          setAlertConfig({
            title: 'Success',
            message: 'Study plan created successfully! Your personalized schedule is ready.',
            type: 'success'
          });
          setShowAlert(true);
          // Refresh token balance after plan generation
          if (onRefreshTokens) {
            onRefreshTokens();
          }
        }}
        tokensRemaining={tokensRemaining}
        tokensLimit={tokensLimit}
        tokensUsed={tokensUsed}
      />

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setSelectedEvent(null);
        }}
        onUpdate={async () => {
          await fetchEvents();
          // After fetching, update selectedEvent with latest data
          if (selectedEvent) {
            // Re-fetch the specific event to get the latest data
            const { data: updatedEventData, error } = await supabase
              .from('study_plan_events')
              .select(`
                *,
                study_plan_schedules!inner(
                  subjects(name, id)
                )
              `)
              .eq('id', selectedEvent.id)
              .single();

            if (!error && updatedEventData) {
              setSelectedEvent(updatedEventData);
            } else {
              // Event might have been deleted or moved out of view
              setShowEventModal(false);
              setSelectedEvent(null);
            }
          }
        }}
        onDelete={() => {
          fetchEvents();
          setShowEventModal(false);
          setSelectedEvent(null);
        }}
      />

      {/* Mobile Date Tasks Modal */}
      {showMobileDateModal && mobileDateModalDate && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black bg-opacity-50"
            onClick={() => setShowMobileDateModal(false)}
          />

          {/* Modal */}
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {mobileDateModalDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                </h3>
                <p className="text-sm text-gray-600">
                  {mobileDateModalDate.toLocaleDateString(undefined, { weekday: 'long' })}
                </p>
              </div>
              <button
                onClick={() => setShowMobileDateModal(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Tasks List */}
            <div className="flex-1 overflow-y-auto p-4">
              {getEventsForDate(mobileDateModalDate).length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-sm font-medium text-gray-900 mb-1">No tasks scheduled</p>
                  <p className="text-xs text-gray-600">
                    {events.length === 0
                      ? 'Create your first study plan'
                      : 'No tasks for this date'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {getEventsForDate(mobileDateModalDate).map(event => {
                    const subjectName = (event as any).study_plan_schedules?.subjects?.name;
                    return (
                      <div
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowEventModal(true);
                          setShowMobileDateModal(false);
                        }}
                        className={`p-3 rounded-lg border ${getStatusColor(event.status, isEventOverdue(event))} cursor-pointer active:scale-95 transition-all`}
                      >
                        {/* Subject Badge - Prominent at top */}
                        {subjectName && (
                          <div className="mb-2">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm">
                              <BookOpen className="w-3.5 h-3.5 mr-1" />
                              {subjectName}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center space-x-3">
                          {/* Status Icon */}
                          <div className="flex-shrink-0">
                            {getStatusIcon(event.status, isEventOverdue(event))}
                          </div>

                          {/* Task Info */}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900 truncate">{formatEventTitle(event)}</p>
                            <div className="flex items-center space-x-1 text-xs text-gray-600 mt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
                            </div>
                          </div>

                          {/* Arrow Icon */}
                          <div className="flex-shrink-0">
                            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type="danger"
        confirmText="Delete"
      />

      {/* Summary Modal */}
      {showSummaryModal && summarySchedule && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Study Plan Summary</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {summarySchedule.subjects?.name || 'Study Plan'} - {summarySchedule.grade_levels?.name || 'Grade'}
                  </p>
                </div>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Plan Details */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 text-sm">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                  <div>
                    <span className="text-gray-600">Duration: </span>
                    <span className="font-semibold text-gray-900">{summarySchedule.study_duration_minutes} min</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Sessions/Week: </span>
                    <span className="font-semibold text-gray-900">{summarySchedule.sessions_per_week}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Period: </span>
                    <span className="font-semibold text-gray-900">
                      {new Date(summarySchedule.start_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {summarySchedule.end_date && ` - ${new Date(summarySchedule.end_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                {summarySchedule.is_active ? (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-600 mr-1.5"></span>
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1.5"></span>
                    Inactive
                  </span>
                )}
                </div>
              </div>
            </div>

            {/* Sessions Table */}
            <div className="flex-1 overflow-y-auto">
              {summaryEvents.length === 0 ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">No sessions found for this study plan</p>
                  </div>
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 md:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        #
                      </th>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Time
                      </th>
                      <th className="px-2 md:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="hidden lg:table-cell px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Topics
                      </th>
                      <th className="px-2 md:px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {summaryEvents.map((event, idx) => (
                      <tr key={event.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-2 md:px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {idx + 1}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {new Date(event.event_date).toLocaleDateString(undefined, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </td>
                        <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                          {formatTime(event.start_time)} - {formatTime(event.end_time)}
                        </td>
                        <td className="px-2 md:px-4 py-3 text-sm text-gray-900">
                          <div className="max-w-xs">
                            <div className="font-medium">{event.title}</div>
                            {event.description && (
                              <div className="text-xs text-gray-500 mt-1 line-clamp-1">{event.description}</div>
                            )}
                            {/* Mobile: Show date and time below title */}
                            <div className="md:hidden text-xs text-gray-600 mt-1.5 space-y-0.5">
                              <div>
                                {new Date(event.event_date).toLocaleDateString(undefined, {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </div>
                              <div>
                                {formatTime(event.start_time)} - {formatTime(event.end_time)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="hidden lg:table-cell px-4 py-3 text-sm text-gray-700">
                          {event.topics && event.topics.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {event.topics.slice(0, 2).map((topic, tidx) => (
                                <span
                                  key={tidx}
                                  className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                                >
                                  {topic}
                                </span>
                              ))}
                              {event.topics.length > 2 && (
                                <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                  +{event.topics.length - 2}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-2 md:px-4 py-3 whitespace-nowrap">
                          {event.status === 'completed' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              <span className="hidden sm:inline">Completed</span>
                            </span>
                          ) : event.status === 'in_progress' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <PlayCircle className="w-3 h-3 mr-1" />
                              <span className="hidden sm:inline">In Progress</span>
                            </span>
                          ) : event.status === 'skipped' ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              <SkipForward className="w-3 h-3 mr-1" />
                              <span className="hidden sm:inline">Skipped</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              <Circle className="w-3 h-3 mr-1" />
                              <span className="hidden sm:inline">Pending</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{summaryEvents.length}</span> total sessions
                {summaryEvents.length > 0 && (
                  <>
                    {' • '}
                    <span className="font-semibold text-green-700">
                      {summaryEvents.filter(e => e.status === 'completed').length}
                    </span> completed
                    {' • '}
                    <span className="font-semibold text-gray-700">
                      {summaryEvents.filter(e => e.status === 'pending').length}
                    </span> pending
                  </>
                )}
              </div>
              <button
                onClick={() => setShowSummaryModal(false)}
                className="px-4 py-2 text-sm font-medium bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
