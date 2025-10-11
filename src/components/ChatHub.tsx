import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare, Trash2, Plus, BookOpen, FileText, Home, LogOut, Crown, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PaperSelectionModal } from './PaperSelectionModal';
import { Modal } from './Modal';
import { UserProfileModal } from './UserProfileModal';
import { SubscriptionManager } from './SubscriptionManager';
import { WelcomeModal } from './WelcomeModal';

interface ConversationWithPaper {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  exam_paper_id: string;
  exam_papers: {
    title: string;
    subjects: { name: string };
    grade_levels: { name: string };
  };
}

interface GroupedConversations {
  [subjectName: string]: ConversationWithPaper[];
}

interface Props {
  onSelectConversation: (conversationId: string, paperId: string) => void;
  onSelectPaper: (paperId: string) => void;
  onNavigateHome: () => void;
  showWelcomeModal?: boolean;
  tokensRemaining?: number;
  papersRemaining?: number;
  onCloseWelcomeModal?: () => void;
  onOpenSubscriptions?: () => void;
}

export function ChatHub({
  onSelectConversation,
  onSelectPaper,
  onNavigateHome,
  showWelcomeModal = false,
  tokensRemaining = 0,
  papersRemaining = 0,
  onCloseWelcomeModal,
  onOpenSubscriptions
}: Props) {
  const { user, signOut } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [showPaperModal, setShowPaperModal] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileModalTab, setProfileModalTab] = useState<'general' | 'subscription' | 'payment-history' | 'settings'>('general');
  const [collapsedSubjects, setCollapsedSubjects] = useState<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; conversationId: string | null }>({
    show: false,
    conversationId: null,
  });

  useEffect(() => {
    if (user) {
      fetchConversations();
    }
  }, [user]);


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
          exam_papers (
            title,
            subjects (name),
            grade_levels (name)
          )
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);

      // On initial load, collapse all subjects
      if (isInitialLoad && data && data.length > 0) {
        const subjects = new Set(data.map(conv => conv.exam_papers.subjects.name));
        setCollapsedSubjects(subjects);
        setIsInitialLoad(false);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSubject = (subjectName: string) => {
    setCollapsedSubjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subjectName)) {
        newSet.delete(subjectName);
      } else {
        newSet.add(subjectName);
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
      console.error('Error deleting conversation:', error);
      setDeleteModal({ show: false, conversationId: null });
    }
  };

  const groupConversationsBySubject = (): GroupedConversations => {
    const grouped: GroupedConversations = {};

    conversations.forEach((conv) => {
      const subjectName = conv.exam_papers.subjects.name;

      if (!grouped[subjectName]) {
        grouped[subjectName] = [];
      }

      grouped[subjectName].push(conv);
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
      console.error('Error signing out:', error);
    }
  };

  const handleNewConversation = () => {
    setShowPaperModal(true);
  };

  const handlePaperSelected = (paperId: string) => {
    setShowPaperModal(false);
    onSelectPaper(paperId); // ExamViewer will auto-load existing conversation
  };

  const groupedConversations = groupConversationsBySubject();

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
      />

      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
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
              <div className="flex items-center space-x-1">
                <button
                  onClick={onNavigateHome}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Go to homepage"
                >
                  <Home className="w-5 h-5 text-gray-700" />
                </button>
                <button
                  onClick={() => setShowProfileModal(true)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="My Profile"
                >
                  <User className="w-5 h-5 text-gray-700" />
                </button>
                <button
                  onClick={handleSignOut}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-5 h-5 text-gray-700" />
                </button>
              </div>
            </div>
            <button
              onClick={handleNewConversation}
              className="w-full px-4 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>New Conversation</span>
            </button>
          </div>

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
              <div className="p-3 space-y-2">
                {Object.entries(groupedConversations).map(([subjectName, convs]) => {
                  const isCollapsed = collapsedSubjects.has(subjectName);
                  
                  return (
                    <div key={subjectName} className="mb-2">
                      {/* Subject Header - Clickable */}
                      <button
                        onClick={() => toggleSubject(subjectName)}
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
                              {convs.length} conversation{convs.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                            isCollapsed ? '' : 'rotate-180'
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Exam papers under this subject - Collapsible */}
                      {!isCollapsed && (
                        <div className="mt-1 ml-2 pl-3 border-l-2 border-gray-200 space-y-1">
                          {convs.map((conv) => (
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
                                      {conv.exam_papers.title}
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
            <div className="flex items-center justify-center h-full p-6">
              <div className="text-center max-w-md">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Ready to ace your exams?
                </h2>
                <p className="text-gray-600 mb-8">
                  Choose a conversation from the left to continue, or click "New Conversation" to start chatting with an exam paper
                </p>
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-center mb-3">
                    <Crown className="w-6 h-6 text-yellow-500 mr-2" />
                    <p className="text-base font-semibold text-gray-900">
                      Upgrade for unlimited access
                    </p>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Get unlimited tokens, access to all exam papers, and priority support
                  </p>
                  <button
                    onClick={handleOpenSubscriptions}
                    className="w-full px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
                  >
                    View Plans
                  </button>
                </div>
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
    </>
  );
}
