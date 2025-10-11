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
import { supabase } from './lib/supabase';

type View = 'home' | 'login' | 'admin' | 'exam-viewer' | 'chat-hub' | 'papers-browser';

function App() {
  const { user, profile, loading } = useAuth();
  const [view, setView] = useState<View>('home');
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState(0);
  const [papersRemaining, setPapersRemaining] = useState(0);

  useEffect(() => {
    if (!loading && !initialLoadComplete) {
      if (user && profile?.role !== 'admin') {
        setView('chat-hub');
        checkFirstTimeUser();
      }
      setInitialLoadComplete(true);
    }
  }, [loading, user, profile, initialLoadComplete]);

  const checkFirstTimeUser = async () => {
    if (!user) {
      console.log('❌ No user found');
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
      if (view !== 'home' && view !== 'login' && view !== 'papers-browser' && view !== 'exam-viewer') {
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

  const handleSelectGrade = (gradeId: string, gradeName: string) => {
    setView('papers-browser');
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
          onNavigateHome={handleNavigateToHomepage}
        />

        {/* Welcome Modal for first-time users */}
        <WelcomeModal
          isOpen={showWelcomeModal}
          onClose={() => setShowWelcomeModal(false)}
          tokensRemaining={tokensRemaining}
          papersRemaining={papersRemaining}
        />
      </>
    );
  }

  if (view === 'exam-viewer' && selectedPaperId) {
    return (
      <ExamViewer
        paperId={selectedPaperId}
        conversationId={selectedConversationId}
        onBack={handleBackToHome}
        onLoginRequired={handleNavigateToLogin}
      />
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
      <Homepage onGetStarted={handleNavigateToLogin} />

      {/* Welcome Modal for first-time users */}
      <WelcomeModal
        isOpen={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        tokensRemaining={tokensRemaining}
        papersRemaining={papersRemaining}
      />
    </>
  );
}

export default App;
