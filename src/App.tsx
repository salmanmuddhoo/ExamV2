import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { AdminDashboard } from './components/AdminDashboard';
import { Homepage } from './components/Homepage';
import { ExamViewer } from './components/ExamViewer';
import { ChatHub } from './components/ChatHub';
import { Navbar } from './components/Navbar';
import { ExamPapersBrowser } from './components/ExamPapersBrowser';
import { WelcomeModal } from './components/WelcomeModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { PaymentPage } from './components/PaymentPage';
import { UnifiedPracticeViewer } from './components/UnifiedPracticeViewer';
import { supabase } from './lib/supabase';

type View = 'home' | 'login' | 'admin' | 'exam-viewer' | 'chat-hub' | 'papers-browser' | 'unified-viewer' | 'payment';

function App() {
  const { user, profile, loading } = useAuth();
  const [view, setView] = useState<View>('home');
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<'year' | 'chapter' | null>(null);
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState(0);
  const [papersRemaining, setPapersRemaining] = useState(0);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(() => {
    // Persist subscription modal state across page navigation
    return sessionStorage.getItem('showSubscriptionModal') === 'true';
  });

  useEffect(() => {
    if (!loading && !initialLoadComplete) {
      if (user && profile?.role !== 'admin') {
        setView('chat-hub');
        checkFirstTimeUser();
      }
      setInitialLoadComplete(true);
    }
  }, [loading, user, profile, initialLoadComplete]);

  // Persist subscription modal state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('showSubscriptionModal', showSubscriptionModal.toString());
  }, [showSubscriptionModal]);

  const checkFirstTimeUser = async () => {
    if (!user) {
      console.log('❌ No user found');
      return;
    }

    // Check if welcome modal was already shown in this session
    const welcomeShownKey = `welcome_shown_${user.id}`;
    const welcomeShown = sessionStorage.getItem(welcomeShownKey);

    if (welcomeShown === 'true') {
      console.log('ℹ️ Welcome modal already shown in this session');
      return;
    }

    console.log('🔍 Checking subscription for user:', user.id);

    try {
      // Fetch user's subscription info
      const { data: subscription, error } = await supabase
        .from('user_subscriptions')
        .select(`
          tokens_used_current_period,
          papers_accessed_current_period,
          subscription_tiers!inner(name, token_limit, papers_limit)
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      console.log('📊 Subscription data:', subscription);
      console.log('❗ Subscription error:', error);

      if (subscription && subscription.subscription_tiers.name === 'free') {
        const tokenLimit = subscription.subscription_tiers.token_limit || 0;
        const papersLimit = subscription.subscription_tiers.papers_limit || 0;

        const tokensLeft = tokenLimit - subscription.tokens_used_current_period;
        const papersLeft = papersLimit - subscription.papers_accessed_current_period;

        console.log('✅ Free tier user! Tokens:', tokensLeft, 'Papers:', papersLeft);

        setTokensRemaining(tokensLeft);
        setPapersRemaining(papersLeft);
        setShowWelcomeModal(true);

        // Mark welcome modal as shown for this session
        sessionStorage.setItem(welcomeShownKey, 'true');
        console.log('🎉 Welcome modal should show now');
      } else {
        console.log('⚠️ Not a free tier user or no subscription found');
      }
    } catch (error) {
      console.error('Error checking first-time user:', error);
    }
  };

  useEffect(() => {
    if (initialLoadComplete && user && profile) {
      if (view === 'login') {
        if (profile.role === 'admin') {
          setView('admin');
        } else {
          setView('chat-hub');
          // Check if user is free tier and show welcome modal
          checkFirstTimeUser();
        }
      }
    }
  }, [user, profile, initialLoadComplete, view]);

  useEffect(() => {
    if (initialLoadComplete && !user && !loading) {
      if (view !== 'home' && view !== 'login' && view !== 'papers-browser' && view !== 'exam-viewer' && view !== 'unified-viewer') {
        setView('home');
      }
    }
  }, [user, loading, initialLoadComplete, view]);

  const handleSelectPaper = (paperId: string) => {
    setSelectedPaperId(paperId);
    setSelectedConversationId(null); // ExamViewer will auto-detect existing conversation
    setView('exam-viewer');
  };

  const handleSelectConversation = (conversationId: string, paperId: string) => {
    setSelectedConversationId(conversationId);
    setSelectedPaperId(paperId);
    setView('exam-viewer');
  };

  const handleBackToHome = () => {
    setSelectedPaperId(null);
    setSelectedConversationId(null);
    setSelectedMode(null);
    setSelectedGradeId(null);
    setSelectedSubjectId(null);
    setSelectedChapterId(null);
    if (user && profile?.role !== 'admin') {
      setView('chat-hub');
    } else {
      setView('home');
    }
  };

  const handleNavigateToHomepage = () => {
    setView('home');
  };

  const handleNavigateToLogin = () => {
    setView('login');
  };

  const handleNavigateToAdmin = () => {
    setView('admin');
  };

  const handleNavigateToChatHub = () => {
    setView('chat-hub');
  };

  const handleSelectMode = (mode: 'year' | 'chapter', gradeId: string, subjectId: string, chapterId?: string) => {
    setSelectedMode(mode);
    setSelectedGradeId(gradeId);
    setSelectedSubjectId(subjectId);
    setSelectedChapterId(chapterId || null);
    setView('unified-viewer');
  };

  const handleSelectGrade = (gradeId: string, gradeName: string) => {
    setView('papers-browser');
  };

  const handleOpenSubscriptionsFromExamViewer = () => {
    setShowSubscriptionModal(true);
  };

  const handleNavigateToPayment = () => {
    setShowSubscriptionModal(false);
    setView('payment');
  };

  const handleBackFromPayment = () => {
    setShowSubscriptionModal(true);
    setView(user && profile?.role !== 'admin' ? 'chat-hub' : 'home');
  };

  const handlePaymentSuccess = () => {
    setShowSubscriptionModal(false);
    // Clear subscription modal state from sessionStorage
    sessionStorage.removeItem('subscription_billingCycle');
    sessionStorage.removeItem('subscription_showStudentSelector');
    sessionStorage.removeItem('subscription_selectedStudentTier');
    sessionStorage.removeItem('subscription_showPayment');
    sessionStorage.removeItem('subscription_paymentData');
    sessionStorage.removeItem('subscription_tiers');
    sessionStorage.removeItem('subscription_current');
    // Refresh subscription data if needed
    if (user) {
      checkFirstTimeUser();
    }
    // Navigate back to appropriate view
    setView(user && profile?.role !== 'admin' ? 'chat-hub' : 'home');
  };

  const handleCloseSubscriptionModal = () => {
    setShowSubscriptionModal(false);
    // Clear subscription modal state from sessionStorage
    sessionStorage.removeItem('subscription_billingCycle');
    sessionStorage.removeItem('subscription_showStudentSelector');
    sessionStorage.removeItem('subscription_selectedStudentTier');
    sessionStorage.removeItem('subscription_showPayment');
    sessionStorage.removeItem('subscription_paymentData');
    sessionStorage.removeItem('subscription_tiers');
    sessionStorage.removeItem('subscription_current');
  };

  const handleSubscriptionSuccess = () => {
    setShowSubscriptionModal(false);
    // Clear subscription modal state from sessionStorage
    sessionStorage.removeItem('subscription_billingCycle');
    sessionStorage.removeItem('subscription_showStudentSelector');
    sessionStorage.removeItem('subscription_selectedStudentTier');
    sessionStorage.removeItem('subscription_showPayment');
    sessionStorage.removeItem('subscription_paymentData');
    sessionStorage.removeItem('subscription_tiers');
    sessionStorage.removeItem('subscription_current');
    // Refresh subscription data if needed
    if (user) {
      checkFirstTimeUser();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (view === 'login') {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onSelectGrade={handleSelectGrade}
          currentView={view}
          hideSignInButton={true}
        />
        <LoginForm onLoginSuccess={() => {}} />
      </>
    );
  }

  if (view === 'admin' && user && profile?.role === 'admin') {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <AdminDashboard />
      </>
    );
  }

  if (view === 'chat-hub' && user) {
    return (
      <>
        <ChatHub
          onSelectConversation={handleSelectConversation}
          onSelectPaper={handleSelectPaper}
          onSelectMode={handleSelectMode}
          onNavigateHome={handleNavigateToHomepage}
          showWelcomeModal={showWelcomeModal}
          tokensRemaining={tokensRemaining}
          papersRemaining={papersRemaining}
          onCloseWelcomeModal={() => setShowWelcomeModal(false)}
          onOpenSubscriptions={() => setShowSubscriptionModal(true)}
        />
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={handleCloseSubscriptionModal}
          onSuccess={handleSubscriptionSuccess}
          onNavigateToPayment={handleNavigateToPayment}
        />
      </>
    );
  }

  if (view === 'exam-viewer' && selectedPaperId) {
    return (
      <>
        <ExamViewer
          paperId={selectedPaperId}
          conversationId={selectedConversationId}
          onBack={handleBackToHome}
          onLoginRequired={handleNavigateToLogin}
          onOpenSubscriptions={handleOpenSubscriptionsFromExamViewer}
        />
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={handleCloseSubscriptionModal}
          onSuccess={handleSubscriptionSuccess}
          onNavigateToPayment={handleNavigateToPayment}
        />
      </>
    );
  }

  if (view === 'papers-browser') {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <ExamPapersBrowser onSelectPaper={handleSelectPaper} />
      </>
    );
  }

  if (view === 'unified-viewer' && user && selectedMode && selectedGradeId && selectedSubjectId) {
    return (
      <>
        <UnifiedPracticeViewer
          mode={selectedMode}
          gradeId={selectedGradeId}
          subjectId={selectedSubjectId}
          chapterId={selectedChapterId}
          onBack={handleBackToHome}
          onLoginRequired={handleNavigateToLogin}
          onOpenSubscriptions={() => setShowSubscriptionModal(true)}
        />
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={handleCloseSubscriptionModal}
          onSuccess={handleSubscriptionSuccess}
          onNavigateToPayment={handleNavigateToPayment}
        />
      </>
    );
  }

  if (view === 'payment') {
    return (
      <PaymentPage
        onBack={handleBackFromPayment}
        onSuccess={handlePaymentSuccess}
      />
    );
  }

  return (
    <>
      <Navbar
        onNavigateHome={handleBackToHome}
        onNavigateAdmin={handleNavigateToAdmin}
        onNavigateLogin={handleNavigateToLogin}
        onNavigateChatHub={handleNavigateToChatHub}
        onSelectGrade={handleSelectGrade}
        currentView={view}
      />
      <Homepage
        onGetStarted={handleNavigateToLogin}
        onOpenSubscriptions={() => setShowSubscriptionModal(true)}
        isLoggedIn={!!user}
      />

      {/* Welcome Modal for first-time users */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        tokensRemaining={tokensRemaining}
        papersRemaining={papersRemaining}
        onUpgrade={() => setShowSubscriptionModal(true)}
      />

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={showSubscriptionModal}
        onClose={handleCloseSubscriptionModal}
        onSuccess={handleSubscriptionSuccess}
        onNavigateToPayment={handleNavigateToPayment}
      />
    </>
  );
}

export default App;
