import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare, Trash2, Plus, BookOpen, FileText, Crown, Calendar, ChevronDown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFirstTimeHints } from '../contexts/FirstTimeHintsContext';
import { PaperSelectionModal } from './PaperSelectionModal';
import { Modal } from './Modal';
import { UserProfileModal } from './UserProfileModal';
import { SubscriptionManager } from './SubscriptionManager';
import { WelcomeModal } from './WelcomeModal';
import { ContextualHint } from './ContextualHint';
import { EventDetailModal } from './EventDetailModal';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface ConversationWithPaper {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  exam_paper_id: string;
  practice_mode: 'year' | 'chapter';
  chapter_id?: string | null;
  exam_papers: {
    title: string;
    year: number;
    month: number | null;
    subjects: { name: string };
    grade_levels: { name: string };
  };
  syllabus_chapters?: {
    chapter_number: number;
    chapter_title: string;
  } | null;
}

interface GroupedConversations {
  [gradeName: string]: {
    [subjectName: string]: {
      year: ConversationWithPaper[];
      chapter: ConversationWithPaper[];
    };
  };
}

interface Props {
  onSelectConversation: (conversationId: string, paperId: string) => void;
  onSelectPaper: (paperId: string) => void;
  onSelectMode?: (mode: 'year' | 'chapter', gradeId: string, subjectId: string) => void;
  onNavigateHome: () => void;
  onNavigateStudyPlan?: () => void;
  showWelcomeModal?: boolean;
  tokensRemaining?: number;
  papersRemaining?: number;
  onCloseWelcomeModal?: () => void;
  onOpenSubscriptions?: () => void;
  showProfileModal?: boolean;
  onCloseProfileModal?: () => void;
}

export function ChatHub({
  onSelectConversation,
  onSelectPaper,
  onSelectMode,
  onNavigateHome,
  onNavigateStudyPlan,
  showWelcomeModal = false,
  tokensRemaining = 0,
  papersRemaining = 0,
  onCloseWelcomeModal,
  onOpenSubscriptions,
  showProfileModal: externalShowProfileModal = false,
  onCloseProfileModal
}: Props) {
  const { user, signOut } = useAuth();
  const { shouldShowHint, markHintAsSeen } = useFirstTimeHints();
  const [conversations, setConversations] = useState<ConversationWithPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [showPaperModal, setShowPaperModal] = useState(false);
  const [showSubscription, setShowSubscription] = useState(() => {
    // Persist subscription modal state across page navigation
    return sessionStorage.getItem('showSubscriptionModal') === 'true';
  });
  const [internalShowProfileModal, setInternalShowProfileModal] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<'general' | 'subscription' | 'payment-history' | 'settings'>('general');

  // Use external prop or internal state for showing profile modal
  const showProfileModalState = externalShowProfileModal || internalShowProfileModal;
  const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(new Set()); // Format: "grade:subject"
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set()); // Format: "grade:subject:mode"
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; conversationId: string | null }>({
    show: false,
    conversationId: null,
  });
  const [userTier, setUserTier] = useState<string>('');
  const [canAccessStudyPlan, setCanAccessStudyPlan] = useState<boolean>(false);
  const [showBlinkAnimation, setShowBlinkAnimation] = useState(true);
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [loadingTodayEvents, setLoadingTodayEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [todayPlanCollapsed, setTodayPlanCollapsed] = useState(true); // Closed by default
  const [accessibleSubjectIds, setAccessibleSubjectIds] = useState<string[]>([]);

  // Disable blink animation after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowBlinkAnimation(false);
    }, 10000); // 10 seconds

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user) {
      fetchConversations();
      fetchUserTier();
      fetchAccessibleSubjects();
      fetchTodayEvents();
    }
  }, [user]);

  // Persist subscription modal state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('showSubscriptionModal', showSubscription.toString());
  }, [showSubscription]);

  const fetchUserTier = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('subscription_tiers(name, can_access_study_plan)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        // No subscription found - try to create one
        try {
          const { data: ensureData, error: ensureError } = await supabase
            .rpc('ensure_user_has_subscription', { p_user_id: user.id });

          if (ensureError) {
          } else if (ensureData && ensureData[0]?.success) {
            // Retry fetching the tier
            const { data: retryData } = await supabase
              .from('user_subscriptions')
              .select('subscription_tiers(name, can_access_study_plan)')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .single();

            if (retryData && retryData.subscription_tiers) {
              setUserTier((retryData.subscription_tiers as any).name);
              setCanAccessStudyPlan((retryData.subscription_tiers as any).can_access_study_plan || false);
            }
          }
        } catch (err) {
        }
        return;
      }

      if (data && data.subscription_tiers) {
        setUserTier((data.subscription_tiers as any).name);
        setCanAccessStudyPlan((data.subscription_tiers as any).can_access_study_plan || false);
      }
    } catch (error) {
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

  const fetchTodayEvents = async () => {
    if (!user) return;

    try {
      setLoadingTodayEvents(true);
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('study_plan_events')
        .select(`
          *,
          study_plan_schedules!inner(
            subjects(name, id)
          )
        `)
        .eq('user_id', user.id)
        .eq('event_date', today)
        .order('start_time', { ascending: true });

      if (error) {
        console.error('Error fetching today events:', error);
        setTodayEvents([]);
        return;
      }

      setTodayEvents(data || []);
    } catch (error) {
      console.error('Error fetching today events:', error);
      setTodayEvents([]);
    } finally {
      setLoadingTodayEvents(false);
    }
  };

  // Filter today's events based on subscription tier configuration and accessible subjects
  const getFilteredTodayEvents = () => {
    // Users without study plan access should not see study plans
    if (!canAccessStudyPlan) {
      return [];
    }

    // Filter events to only include those for accessible subjects
    return todayEvents.filter(event => {
      const subjectId = (event as any).study_plan_schedules?.subjects?.id;
      return subjectId && accessibleSubjectIds.includes(subjectId);
    });
  };

  const filteredTodayEvents = getFilteredTodayEvents();

  const formatTime = (timeStr: string) => {
    // Remove seconds if present (HH:MM:SS -> HH:MM)
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0]);
      const minutes = timeParts[1];
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes} ${period}`;
    }
    return timeStr;
  };

  const fetchConversations = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          id,
          title,
          created_at,
          updated_at,
          exam_paper_id,
          practice_mode,
          chapter_id,
          exam_papers (
            title,
            year,
            month,
            subjects (name),
            grade_levels (name)
          ),
          syllabus_chapters (
            chapter_number,
            chapter_title
          )
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);

      // On initial load, collapse all grades, subjects, and folders
      if (isInitialLoad && data && data.length > 0) {
        const grades = new Set(data.map(conv => conv.exam_papers.grade_levels.name));
        setCollapsedGrades(grades);

        const subjects = new Set<string>();
        const folders = new Set<string>();

        data.forEach(conv => {
          const gradeName = conv.exam_papers.grade_levels.name;
          const subjectName = conv.exam_papers.subjects.name;
          subjects.add(`${gradeName}:${subjectName}`);
          folders.add(`${gradeName}:${subjectName}:year`);
          folders.add(`${gradeName}:${subjectName}:chapter`);
        });

        setCollapsedSubjects(subjects);
        setCollapsedFolders(folders);

        setIsInitialLoad(false);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const toggleGrade = (gradeName: string) => {
    setCollapsedGrades(prev => {
      const newSet = new Set(prev);
      if (newSet.has(gradeName)) {
        newSet.delete(gradeName);
      } else {
        newSet.add(gradeName);
      }
      return newSet;
    });
  };

  const toggleSubject = (subjectKey: string) => {
    setCollapsedSubjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subjectKey)) {
        newSet.delete(subjectKey);
      } else {
        newSet.add(subjectKey);
      }
      return newSet;
    });
  };

  const toggleFolder = (folderKey: string) => {
    setCollapsedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderKey)) {
        newSet.delete(folderKey);
      } else {
        newSet.add(folderKey);
      }
      return newSet;
    });
  };

  const handleOpenSubscriptions = () => {
    if (onOpenSubscriptions) {
      onOpenSubscriptions();
    }
  };

  const deleteConversation = async (conversationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteModal({ show: true, conversationId });
  };

  const confirmDelete = async () => {
    if (!deleteModal.conversationId) return;

    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', deleteModal.conversationId);

      if (error) throw error;

      if (selectedConversation === deleteModal.conversationId) {
        setSelectedConversation(null);
      }

      await fetchConversations();
      setDeleteModal({ show: false, conversationId: null });
    } catch (error) {
      setDeleteModal({ show: false, conversationId: null });
    }
  };

  const groupConversationsByGradeAndSubject = (): GroupedConversations => {
    const grouped: GroupedConversations = {};

    conversations.forEach((conv) => {
      const gradeName = conv.exam_papers.grade_levels.name;
      const subjectName = conv.exam_papers.subjects.name;

      if (!grouped[gradeName]) {
        grouped[gradeName] = {};
      }

      if (!grouped[gradeName][subjectName]) {
        grouped[gradeName][subjectName] = {
          year: [],
          chapter: []
        };
      }

      if (conv.practice_mode === 'year') {
        grouped[gradeName][subjectName].year.push(conv);
      } else {
        grouped[gradeName][subjectName].chapter.push(conv);
      }
    });

    return grouped;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      onNavigateHome();
    } catch (error) {
    }
  };

  const handleNewConversation = () => {
    setShowPaperModal(true);
  };

  const handlePaperSelected = (paperId: string) => {
    setShowPaperModal(false);
    // Allow user to view the paper - chat access will be checked in ExamViewer
    onSelectPaper(paperId);
  };

  const groupedConversations = groupConversationsByGradeAndSubject();

  return (
    <>
      <Modal
        isOpen={deleteModal.show}
        onClose={() => setDeleteModal({ show: false, conversationId: null })}
        onConfirm={confirmDelete}
        title="Delete Conversation"
        message="Are you sure you want to delete this conversation? This action cannot be undone."
        type="confirm"
        confirmText="Delete"
        cancelText="Cancel"
      />

      <PaperSelectionModal
        isOpen={showPaperModal}
        onClose={() => setShowPaperModal(false)}
        onSelectPaper={handlePaperSelected}
        onSelectMode={onSelectMode}
      />

      <UserProfileModal
        isOpen={showProfileModalState}
        onClose={() => {
          setInternalShowProfileModal(false);
          if (onCloseProfileModal) {
            onCloseProfileModal();
          }
        }}
        initialTab={profileModalTab}
        onOpenSubscriptions={onOpenSubscriptions}
      />

      <div className="h-screen flex flex-col md:flex-row bg-gray-50">
        {/* Left Panel - Conversations List */}
        <div className="w-full md:w-80 bg-white border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-xl font-bold text-gray-900">My Conversations</h1>
              <button
                onClick={handleNewConversation}
                className="p-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors md:hidden"
                title="New Conversation"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="relative hidden md:block">
              <button
                onClick={handleNewConversation}
                className="w-full px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Conversation</span>
              </button>
              <ContextualHint
                show={shouldShowHint('chatHubNewConversation') && !loading}
                onDismiss={() => markHintAsSeen('chatHubNewConversation')}
                title="Start Here!"
                message="Click 'New Conversation' to select an exam paper and start practicing with AI assistance."
                position="bottom"
                delay={1000}
              />
            </div>
          </div>

          {/* Today's Study Plan Summary - Mobile */}
          {!loadingTodayEvents && filteredTodayEvents.length > 0 && (
            <div className="md:hidden border-b border-gray-200 bg-gray-50">
              <button
                onClick={() => setTodayPlanCollapsed(!todayPlanCollapsed)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-gray-700" />
                  <h3 className="text-sm font-bold text-gray-900">Today's Study Plan</h3>
                  <span className="text-xs text-gray-500">({filteredTodayEvents.length})</span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-600 transition-transform ${
                    todayPlanCollapsed ? '' : 'rotate-180'
                  }`}
                />
              </button>

              {!todayPlanCollapsed && (
                <div className="px-4 pb-4 space-y-2">
                  {filteredTodayEvents.map((event) => {
                    const subjectName = (event as any).study_plan_schedules?.subjects?.name;
                    const isCompleted = event.status === 'completed';
                    return (
                      <div
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowEventModal(true);
                        }}
                        className={`flex items-start space-x-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          isCompleted
                            ? 'bg-green-50 border-green-200 hover:bg-green-100'
                            : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          {isCompleted ? (
                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-4 h-4 border-2 border-gray-400 rounded-full" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${isCompleted ? 'text-green-900 line-through' : 'text-gray-900'}`}>
                            {event.title}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {formatTime(event.start_time)} - {formatTime(event.end_time)}
                            {subjectName && ` • ${subjectName}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {onNavigateStudyPlan && (
                    <button
                      onClick={onNavigateStudyPlan}
                      className="w-full text-xs text-gray-600 hover:text-gray-900 py-2 text-center"
                    >
                      View All →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="text-sm text-gray-500">Loading conversations...</div>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center">
                <MessageSquare className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No conversations yet</h3>
                <p className="text-sm text-gray-600">
                  Click the "New Conversation" button above to get started
                </p>
              </div>
            ) : (
              <div className="p-3 space-y-3">
                {Object.entries(groupedConversations).map(([gradeName, subjects]) => {
                  const isGradeCollapsed = collapsedGrades.has(gradeName);

                  // Calculate total conversations for this grade
                  const totalGradeConvs = Object.values(subjects).reduce(
                    (total, modes) => total + modes.year.length + modes.chapter.length,
                    0
                  );

                  return (
                    <div key={gradeName} className="mb-3">
                      {/* Grade Header - Clickable */}
                      <button
                        onClick={() => toggleGrade(gradeName)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all group border border-gray-200"
                      >
                        <div className="flex items-center space-x-2.5">
                          <div className="text-left">
                            <h2 className="text-sm font-semibold text-gray-900">
                              {gradeName}
                            </h2>
                            <p className="text-xs text-gray-500">
                              {totalGradeConvs} conversation{totalGradeConvs !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <svg
                          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                            isGradeCollapsed ? '' : 'rotate-180'
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Subjects under this grade */}
                      {!isGradeCollapsed && (
                        <div className="mt-2 ml-3 pl-4 border-l-2 border-gray-300 space-y-2">
                          {Object.entries(subjects).map(([subjectName, modes]) => {
                            const subjectKey = `${gradeName}:${subjectName}`;
                            const isSubjectCollapsed = collapsedSubjects.has(subjectKey);
                            const totalConvs = modes.year.length + modes.chapter.length;

                            return (
                              <div key={subjectKey} className="mb-2">
                                {/* Subject Header - Clickable */}
                                <button
                                  onClick={() => toggleSubject(subjectKey)}
                                  className="w-full flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-gray-100 to-gray-50 hover:from-gray-200 hover:to-gray-100 rounded-lg transition-all group"
                                >
                                  <div className="flex items-center space-x-2.5">
                                    <div className="p-1.5 bg-white rounded-md shadow-sm">
                                      <BookOpen className="w-4 h-4 text-gray-700" />
                                    </div>
                                    <div className="text-left">
                                      <h3 className="text-sm font-bold text-gray-900">
                                        {subjectName}
                                      </h3>
                                      <p className="text-xs text-gray-500">
                                        {totalConvs} conversation{totalConvs !== 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  </div>
                                  <svg
                                    className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                                      isSubjectCollapsed ? '' : 'rotate-180'
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>

                                {/* Folders (Year/Chapter) under this subject */}
                                {!isSubjectCollapsed && (
                                  <div className="mt-1 ml-2 pl-3 border-l-2 border-gray-200 space-y-1">
                                    {/* Year Folder */}
                                    {modes.year.length > 0 && (
                                      <div className="mt-2">
                                        <button
                                          onClick={() => toggleFolder(`${gradeName}:${subjectName}:year`)}
                                          className="w-full flex items-center justify-between px-2 py-2 bg-gray-50 hover:bg-gray-100 rounded-md transition-all"
                                        >
                                          <div className="flex items-center space-x-2">
                                            <Calendar className="w-4 h-4 text-gray-600" />
                                            <span className="text-xs font-semibold text-gray-700">Practice by Year</span>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <span className="text-xs text-gray-500">{modes.year.length}</span>
                                            <svg
                                              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                                                collapsedFolders.has(`${gradeName}:${subjectName}:year`) ? '' : 'rotate-180'
                                              }`}
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                          </div>
                                        </button>

                                        {!collapsedFolders.has(`${gradeName}:${subjectName}:year`) && (
                                          <div className="mt-1 ml-4 space-y-1">
                                            {modes.year.map((conv) => (
                                              <div
                                                key={conv.id}
                                                onClick={() => {
                                                  setSelectedConversation(conv.id);
                                                  onSelectConversation(conv.id, conv.exam_paper_id);
                                                }}
                                                className={`group px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                                                  selectedConversation === conv.id
                                                    ? 'bg-blue-50 border border-blue-200 shadow-sm'
                                                    : 'hover:bg-gray-50 border border-transparent'
                                                }`}
                                              >
                                                <div className="flex items-start justify-between">
                                                  <div className="flex-1 min-w-0 pr-2">
                                                    <div className="flex items-center space-x-2">
                                                      <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${
                                                        selectedConversation === conv.id ? 'text-blue-600' : 'text-gray-500'
                                                      }`} />
                                                      <p className={`text-sm truncate font-medium ${
                                                        selectedConversation === conv.id ? 'text-blue-900' : 'text-gray-900'
                                                      }`}>
                                                        {conv.exam_papers.title} - Yr {conv.exam_papers.year}{conv.exam_papers.month ? ` ${MONTHS[conv.exam_papers.month - 1]}` : ''}
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <button
                                                    onClick={(e) => deleteConversation(conv.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 rounded transition-all flex-shrink-0"
                                                    title="Delete conversation"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Chapter Folder */}
                                    {modes.chapter.length > 0 && (
                                      <div className="mt-2">
                                        <button
                                          onClick={() => toggleFolder(`${gradeName}:${subjectName}:chapter`)}
                                          className="w-full flex items-center justify-between px-2 py-2 bg-gray-50 hover:bg-gray-100 rounded-md transition-all"
                                        >
                                          <div className="flex items-center space-x-2">
                                            <BookOpen className="w-4 h-4 text-gray-600" />
                                            <span className="text-xs font-semibold text-gray-700">Practice by Chapter</span>
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <span className="text-xs text-gray-500">{modes.chapter.length}</span>
                                            <svg
                                              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                                                collapsedFolders.has(`${gradeName}:${subjectName}:chapter`) ? '' : 'rotate-180'
                                              }`}
                                              fill="none"
                                              stroke="currentColor"
                                              viewBox="0 0 24 24"
                                            >
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                          </div>
                                        </button>

                                        {!collapsedFolders.has(`${gradeName}:${subjectName}:chapter`) && (
                                          <div className="mt-1 ml-4 space-y-1">
                                            {modes.chapter.map((conv) => (
                                              <div
                                                key={conv.id}
                                                onClick={() => {
                                                  setSelectedConversation(conv.id);
                                                  onSelectConversation(conv.id, conv.exam_paper_id);
                                                }}
                                                className={`group px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                                                  selectedConversation === conv.id
                                                    ? 'bg-blue-50 border border-blue-200 shadow-sm'
                                                    : 'hover:bg-gray-50 border border-transparent'
                                                }`}
                                              >
                                                <div className="flex items-start justify-between">
                                                  <div className="flex-1 min-w-0 pr-2">
                                                    <div className="flex items-center space-x-2">
                                                      <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${
                                                        selectedConversation === conv.id ? 'text-blue-600' : 'text-gray-500'
                                                      }`} />
                                                      <p className={`text-sm truncate font-medium ${
                                                        selectedConversation === conv.id ? 'text-blue-900' : 'text-gray-900'
                                                      }`}>
                                                        {conv.syllabus_chapters
                                                          ? `Ch ${conv.syllabus_chapters.chapter_number}: ${conv.syllabus_chapters.chapter_title}`
                                                          : conv.title}
                                                      </p>
                                                    </div>
                                                  </div>
                                                  <button
                                                    onClick={(e) => deleteConversation(conv.id, e)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-100 rounded transition-all flex-shrink-0"
                                                    title="Delete conversation"
                                                  >
                                                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                                  </button>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Subscription Manager or Empty State */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {showSubscription ? (
            <div className="p-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Manage Subscription</h2>
                <button
                  onClick={() => setShowSubscription(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
              <SubscriptionManager />
            </div>
          ) : (
            <div className="h-full p-6">
              {/* Today's Study Plan Summary - Desktop */}
              {!loadingTodayEvents && filteredTodayEvents.length > 0 && (
                <div className="hidden md:block mb-6 bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-gray-700" />
                      <h3 className="text-sm font-bold text-gray-900">Today's Study Plan</h3>
                    </div>
                    {onNavigateStudyPlan && (
                      <button
                        onClick={onNavigateStudyPlan}
                        className="text-xs text-gray-600 hover:text-gray-900 hover:underline"
                      >
                        View All →
                      </button>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    {filteredTodayEvents.slice(0, 4).map((event) => {
                      const subjectName = (event as any).study_plan_schedules?.subjects?.name;
                      const isCompleted = event.status === 'completed';
                      const isInProgress = event.status === 'in_progress';
                      return (
                        <div
                          key={event.id}
                          onClick={() => {
                            setSelectedEvent(event);
                            setShowEventModal(true);
                          }}
                          className={`flex items-center space-x-2.5 p-2.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${
                            isCompleted
                              ? 'bg-green-50 border-green-200 hover:bg-green-100'
                              : isInProgress
                              ? 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                              : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex-shrink-0">
                            {isCompleted ? (
                              <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            ) : isInProgress ? (
                              <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            ) : (
                              <div className="w-4 h-4 border-2 border-gray-400 rounded-full" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${isCompleted ? 'text-green-900 line-through' : isInProgress ? 'text-blue-900' : 'text-gray-900'}`}>
                              {event.title}
                            </p>
                            <p className="text-[11px] text-gray-600">
                              {formatTime(event.start_time)} - {formatTime(event.end_time)}
                            </p>
                          </div>
                          <div className="flex-shrink-0">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      );
                    })}
                    {filteredTodayEvents.length > 4 && (
                      <p className="text-xs text-gray-500 text-center pt-1">
                        +{filteredTodayEvents.length - 4} more task{filteredTodayEvents.length - 4 !== 1 ? 's' : ''} today
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="text-center max-w-md mx-auto">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Ready to ace your exams?
                </h2>
                <p className="text-gray-600 mb-6">
                  Choose a conversation to continue, or click <span className={`font-extrabold text-gray-900 ${showBlinkAnimation ? 'animate-blink' : ''}`}>"New Conversation"</span> to start working on a new exam paper.
                </p>

                {userTier !== 'pro' ? (
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-lg p-6">
                    <div className="flex items-center justify-center mb-3">
                      <Crown className="w-6 h-6 text-yellow-500 mr-2" />
                      <p className="text-base font-semibold text-gray-900">
                        Upgrade for more access
                      </p>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">
                      Get more tokens and additional access to exam papers.
                    </p>
                    <button
                      onClick={handleOpenSubscriptions}
                      className="w-full px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                    >
                      View Plans
                    </button>
                  </div>
                ) : (
                  <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-200 rounded-lg p-6">
                    <div className="flex items-center justify-center mb-3">
                      <Crown className="w-6 h-6 text-yellow-600 mr-2" />
                      <p className="text-base font-semibold text-gray-900">
                        You're on Professional Package!
                      </p>
                    </div>
                    <p className="text-sm text-gray-700">
                      You have full access to all exam papers and unlimited chat assistance. Start a new conversation to begin your study session!
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Welcome Modal */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={onCloseWelcomeModal || (() => {})}
        tokensRemaining={tokensRemaining}
        papersRemaining={papersRemaining}
        onUpgrade={handleOpenSubscriptions}
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
          fetchTodayEvents();
        }}
        onDelete={() => {
          fetchTodayEvents();
          setShowEventModal(false);
          setSelectedEvent(null);
        }}
      />
    </>
  );
}
