import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
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
  List
} from 'lucide-react';
import { StudyPlanEvent, StudyPlanSchedule } from '../types/studyPlan';
import { StudyPlanWizard } from './StudyPlanWizard';
import { EventDetailModal } from './EventDetailModal';

interface StudyPlanCalendarProps {
  onBack: () => void;
  onOpenSubscriptions: () => void;
}

export function StudyPlanCalendar({ onBack, onOpenSubscriptions }: StudyPlanCalendarProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [events, setEvents] = useState<StudyPlanEvent[]>([]);
  const [tierName, setTierName] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<StudyPlanEvent | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [schedules, setSchedules] = useState<(StudyPlanSchedule & { subjects?: { name: string }; grade_levels?: { name: string } })[]>([]);
  const [showSchedules, setShowSchedules] = useState(false);
  const [mobileView, setMobileView] = useState<'calendar' | 'list'>('calendar');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string | null>(null);

  useEffect(() => {
    checkAccess();
  }, [user]);

  useEffect(() => {
    if (hasAccess && featureEnabled) {
      fetchEvents();
      fetchSchedules();
    }
  }, [user, currentDate, hasAccess, featureEnabled]);

  // Auto-select today's date if it has events (but only once on initial load)
  useEffect(() => {
    if (events.length > 0 && !selectedDate) {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const todayEvents = events.filter(event => event.event_date === todayStr);

      // Only auto-select today if it's in the current month and has events
      if (todayEvents.length > 0) {
        const isCurrentMonth =
          currentDate.getMonth() === today.getMonth() &&
          currentDate.getFullYear() === today.getFullYear();

        if (isCurrentMonth) {
          console.log('Auto-selecting today with', todayEvents.length, 'events');
          setSelectedDate(today);
        }
      }
    }
  }, [events]);

  const checkAccess = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Check if feature is enabled globally
      const { data: settingData, error: settingError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'study_plan_enabled')
        .single();

      if (settingError) throw settingError;

      const enabled = settingData?.setting_value?.enabled || false;
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

  const fetchEvents = async () => {
    if (!user) return;

    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('study_plan_events')
        .select(`
          *,
          study_plan_schedules!inner(
            subjects(name, id)
          )
        `)
        .eq('user_id', user.id)
        .gte('event_date', startOfMonth.toISOString().split('T')[0])
        .lte('event_date', endOfMonth.toISOString().split('T')[0])
        .order('event_date', { ascending: true });

      if (error) {
        console.error('Error fetching events:', error);
        throw error;
      }

      console.log('Fetched events:', data);
      setEvents(data || []);
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
          subjects(name),
          grade_levels(name)
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSchedules(data || []);
    } catch (error) {
      console.error('Error fetching schedules:', error);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm('Are you sure you want to delete this study plan? All associated events will be deleted.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('study_plan_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      fetchSchedules();
      fetchEvents();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Failed to delete study plan');
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

  const getEventsForDate = (date: Date | null) => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    let filteredEvents = events.filter(event => event.event_date === dateStr);

    // Apply subject filter if selected
    if (selectedSubjectFilter) {
      filteredEvents = filteredEvents.filter(event => {
        const subjectId = (event as any).study_plan_schedules?.subjects?.id;
        return subjectId === selectedSubjectFilter;
      });
    }

    return filteredEvents;
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

  // Filter events by subject
  const getFilteredEvents = () => {
    if (!selectedSubjectFilter) return events;
    return events.filter(event => {
      const subjectId = (event as any).study_plan_schedules?.subjects?.id;
      return subjectId === selectedSubjectFilter;
    });
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

  const getStatusIcon = (status: StudyPlanEvent['status']) => {
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

  const getStatusColor = (status: StudyPlanEvent['status']) => {
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

  const days = getDaysInMonth();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={onBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Calendar className="w-6 h-6 text-black" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Study Plan</h1>
                  <p className="text-sm text-gray-600">AI-powered personalized schedule</p>
                </div>
              </div>
            </div>
            <button
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
        {/* Active Schedules Section */}
        {schedules.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShowSchedules(!showSchedules)}
              className="flex items-center space-x-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-3"
            >
              <Eye className="w-4 h-4" />
              <span>{showSchedules ? 'Hide' : 'Show'} Active Study Plans ({schedules.length})</span>
            </button>

            {showSchedules && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {schedules.map(schedule => (
                  <div
                    key={schedule.id}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <BookOpen className="w-5 h-5 text-black" />
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {schedule.subjects?.name || 'Subject'}
                          </h3>
                          <p className="text-xs text-gray-600">
                            {schedule.grade_levels?.name || 'Grade'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteSchedule(schedule.id)}
                        className="p-1 hover:bg-red-50 rounded transition-colors"
                        title="Delete study plan"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between text-gray-600">
                        <span>Duration:</span>
                        <span className="font-medium text-gray-900">{schedule.study_duration_minutes} min</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-600">
                        <span>Sessions/week:</span>
                        <span className="font-medium text-gray-900">{schedule.sessions_per_week}</span>
                      </div>
                      <div className="flex items-center justify-between text-gray-600">
                        <span>Period:</span>
                        <span className="font-medium text-gray-900">
                          {new Date(schedule.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {schedule.end_date && ` - ${new Date(schedule.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                        </span>
                      </div>
                      {schedule.preferred_times && schedule.preferred_times.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {schedule.preferred_times.map((time, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-gray-50 text-gray-700 rounded-full text-xs border border-gray-200"
                            >
                              {time}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subject Filter */}
        {getUniqueSubjects().length > 1 && (
          <div className="mb-4 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Filter by Subject</label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedSubjectFilter(null)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  !selectedSubjectFilter
                    ? 'bg-black text-white shadow-md'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All Subjects
              </button>
              {getUniqueSubjects().map(subject => (
                <button
                  key={subject.id}
                  onClick={() => setSelectedSubjectFilter(subject.id)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    selectedSubjectFilter === subject.id
                      ? 'bg-black text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {subject.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Calendar Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3 md:mb-0">
              <h2 className="text-lg font-semibold text-gray-900">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h2>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>

            {/* Mobile View Toggle */}
            <div className="flex md:hidden items-center justify-center space-x-2 mt-3 bg-gray-100 p-1 rounded-lg">
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
          <div className="hidden md:flex p-6 gap-6">
            {/* Calendar Grid */}
            <div className={`transition-all ${selectedDate ? 'w-2/3' : 'w-full'}`}>
              <div className="grid grid-cols-7 gap-2 mb-2">
                {dayNames.map(day => (
                  <div key={day} className="text-center text-sm font-semibold text-gray-600 py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {days.map((day, index) => {
                  const dayEvents = getEventsForDate(day);
                  const isToday = day && day.toDateString() === new Date().toDateString();
                  const isSelected = day && selectedDate && day.toDateString() === selectedDate.toDateString();

                  return (
                    <div
                      key={index}
                      className={`min-h-[120px] p-2 border rounded-lg transition-all ${
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
                            {day.getDate()}
                          </div>
                          <div className="space-y-1">
                            {dayEvents.slice(0, 3).map(event => (
                              <div
                                key={event.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEvent(event);
                                  setShowEventModal(true);
                                }}
                                className={`text-xs p-1 rounded border ${getStatusColor(event.status)} truncate cursor-pointer hover:shadow-md transition-shadow`}
                              >
                                <div className="flex items-center space-x-1">
                                  {getStatusIcon(event.status)}
                                  <span className="truncate">{event.title}</span>
                                </div>
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <div className="text-xs text-gray-500 text-center">
                                +{dayEvents.length - 3} more
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
            {selectedDate && (() => {
              const dateEvents = getEventsForDate(selectedDate);
              console.log('Right panel rendering for date:', selectedDate.toISOString().split('T')[0]);
              console.log('Events for this date:', dateEvents.length);
              return (
                <div className="w-1/3 border-l border-gray-200 pl-6 min-h-[400px]">
                  <div className="sticky top-24">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedDate(null)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Close panel"
                      >
                        <X className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>

                    {dateEvents.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Calendar className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-sm text-gray-600">No tasks scheduled for this day</p>
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
                            className={`p-4 rounded-lg border ${getStatusColor(event.status)} cursor-pointer hover:shadow-lg transition-all`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center space-x-2 flex-1">
                                {getStatusIcon(event.status)}
                                <span className="font-semibold text-sm">{event.title}</span>
                              </div>
                            </div>

                            {subjectName && (
                              <div className="mb-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                                  <BookOpen className="w-3 h-3 mr-1" />
                                  {subjectName}
                                </span>
                              </div>
                            )}

                            {event.description && (
                              <p className="text-sm text-gray-700 mb-2 line-clamp-2">{event.description}</p>
                            )}

                            <div className="flex items-center space-x-4 text-xs text-gray-600">
                              <div className="flex items-center space-x-1">
                                <Clock className="w-3 h-3" />
                                <span>{event.start_time} - {event.end_time}</span>
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
            <div className="md:hidden p-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                  <div key={idx} className="text-center text-xs font-semibold text-gray-600 py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => {
                  const dayEvents = getEventsForDate(day);
                  const isToday = day && day.toDateString() === new Date().toDateString();
                  const hasEvents = dayEvents.length > 0;

                  return (
                    <div
                      key={index}
                      onClick={() => {
                        if (day && hasEvents) {
                          setSelectedDate(day);
                        }
                      }}
                      className={`min-h-[60px] p-1 border rounded transition-all ${
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
                            {day.getDate()}
                          </div>
                          {hasEvents && (
                            <div className="space-y-0.5">
                              {dayEvents.slice(0, 2).map((event) => (
                                <div
                                  key={event.id}
                                  className={`w-full h-1.5 rounded-full ${
                                    event.status === 'completed' ? 'bg-green-500' :
                                    event.status === 'in_progress' ? 'bg-blue-500' :
                                    event.status === 'skipped' ? 'bg-gray-300' :
                                    'bg-gray-700'
                                  }`}
                                />
                              ))}
                              {dayEvents.length > 2 && (
                                <div className="text-[10px] text-gray-500 text-center font-medium">
                                  +{dayEvents.length - 2}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Selected Date Events (Mobile) */}
              {selectedDate && getEventsForDate(selectedDate).length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </h3>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="text-sm text-black font-medium"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-2">
                    {getEventsForDate(selectedDate).map(event => (
                      <div
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowEventModal(true);
                        }}
                        className={`p-3 rounded-lg border ${getStatusColor(event.status)} cursor-pointer hover:shadow-md transition-shadow`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center space-x-2">
                            {getStatusIcon(event.status)}
                            <span className="font-semibold text-sm">{event.title}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 text-xs text-gray-600">
                          <Clock className="w-3 h-3" />
                          <span>{event.start_time} - {event.end_time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                  className={`p-4 rounded-lg border ${getStatusColor(event.status)} cursor-pointer hover:shadow-md transition-shadow`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(event.status)}
                      <span className="font-semibold">{event.title}</span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-sm text-gray-700 mb-2 line-clamp-2">{event.description}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <Clock className="w-4 h-4" />
                      <span>{event.start_time} - {event.end_time}</span>
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
          setShowCreateModal(false);
        }}
      />

      {/* Event Detail Modal */}
      <EventDetailModal
        event={selectedEvent}
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setSelectedEvent(null);
        }}
        onUpdate={() => {
          fetchEvents();
          // Update selectedEvent with latest data
          if (selectedEvent) {
            const updatedEvent = events.find(e => e.id === selectedEvent.id);
            if (updatedEvent) {
              setSelectedEvent(updatedEvent);
            }
          }
        }}
        onDelete={() => {
          fetchEvents();
          setShowEventModal(false);
          setSelectedEvent(null);
        }}
      />
    </div>
  );
}
