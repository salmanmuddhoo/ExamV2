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
import { Modal } from './components/Modal';
import { PaymentPage } from './components/PaymentPage';
import { UnifiedPracticeViewer } from './components/UnifiedPracticeViewer';
import { ResetPassword } from './components/ResetPassword';
import { BlogList } from './components/BlogList';
import { BlogPost } from './components/BlogPost';
import { supabase } from './lib/supabase';
import { BlogPost as BlogPostType } from './data/blogPosts';

type View = 'home' | 'login' | 'admin' | 'exam-viewer' | 'chat-hub' | 'papers-browser' | 'unified-viewer' | 'payment' | 'reset-password' | 'blog' | 'blog-post';

function App() {
  const { user, profile, loading } = useAuth();
  const [view, setView] = useState<View>(() => {
    // Restore view from sessionStorage on initial load
    const savedView = sessionStorage.getItem('currentView');
    return (savedView as View) || 'home';
  });
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(() => {
    return sessionStorage.getItem('selectedPaperId') || null;
  });
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(() => {
    return sessionStorage.getItem('selectedConversationId') || null;
  });
  const [selectedMode, setSelectedMode] = useState<'year' | 'chapter' | null>(() => {
    const savedMode = sessionStorage.getItem('selectedMode');
    return (savedMode as 'year' | 'chapter') || null;
  });
  const [selectedGradeId, setSelectedGradeId] = useState<string | null>(() => {
    return sessionStorage.getItem('selectedGradeId') || null;
  });
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(() => {
    return sessionStorage.getItem('selectedSubjectId') || null;
  });
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(() => {
    return sessionStorage.getItem('selectedChapterId') || null;
  });
  const [selectedGradeFromNavbar, setSelectedGradeFromNavbar] = useState<{ id: string; name: string } | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState(0);
  const [papersRemaining, setPapersRemaining] = useState(0);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(() => {
    // Persist subscription modal state across page navigation
    return sessionStorage.getItem('showSubscriptionModal') === 'true';
  });
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [hasHandledOAuthRedirect, setHasHandledOAuthRedirect] = useState(false);
  const [selectedBlogPost, setSelectedBlogPost] = useState<BlogPostType | null>(null);
  const [showEmailVerifiedModal, setShowEmailVerifiedModal] = useState(false);

  // Browser back button handler - Prevent logout on back navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // Prevent default back behavior that might log out user
      if (user) {
        event.preventDefault();
        // If authenticated, navigate to chat-hub instead of going back
        if (profile?.role !== 'admin') {
          setView('chat-hub');
        }
      }
    };

    // Add history entry for current state to enable back button handling
    if (user && view) {
      window.history.pushState({ view }, '', window.location.pathname);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, profile, view]);

  // Check for password reset token or email verification in URL (must run first)
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const type = hashParams.get('type');

    if (accessToken && type === 'recovery') {
      // User clicked password reset link from email
      setIsPasswordReset(true);
      setView('reset-password');
    } else if (accessToken && (type === 'signup' || type === 'email_change')) {
      // User clicked email verification link
      setShowEmailVerifiedModal(true);
      setView('login');
      // Clean up URL hash
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Handle OAuth redirect and initial authentication state
  useEffect(() => {
    if (loading) return;

    // Check if this is an OAuth callback
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const isOAuthCallback = !!(accessToken && refreshToken);

    // Check if we're in PWA mode and returning from OAuth
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as any).standalone ||
                  document.referrer.includes('android-app://');
    const pwaOAuthInitiated = sessionStorage.getItem('pwa_oauth_initiated') === 'true';

    // If PWA OAuth was initiated, log callback status for debugging
    if (isPWA && pwaOAuthInitiated && isOAuthCallback) {
      const provider = sessionStorage.getItem('pwa_oauth_provider');
      const timestamp = sessionStorage.getItem('pwa_oauth_timestamp');
      // Clear the flags
      sessionStorage.removeItem('pwa_oauth_initiated');
      sessionStorage.removeItem('pwa_oauth_provider');
      sessionStorage.removeItem('pwa_oauth_timestamp');
    }

    // Handle initial load or OAuth redirect
    if (!initialLoadComplete && !isPasswordReset) {
      if (user && profile?.role !== 'admin') {
        // Only set view to chat-hub if there's no saved view or if it's OAuth callback
        const savedView = sessionStorage.getItem('currentView');
        if (!savedView || savedView === 'home' || savedView === 'login' || isOAuthCallback) {
          setView('chat-hub');
        }
        checkFirstTimeUser();

        // Clean up OAuth params from URL after successful login
        if (isOAuthCallback) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
      setInitialLoadComplete(true);
      setHasHandledOAuthRedirect(true);
    }
    // Handle late OAuth redirects (when user/profile become available after initial load)
    else if (!hasHandledOAuthRedirect && isOAuthCallback && user && profile) {
      if (profile.role !== 'admin') {
        // Only set view to chat-hub if there's no saved view or if it's OAuth callback
        const savedView = sessionStorage.getItem('currentView');
        if (!savedView || savedView === 'home' || savedView === 'login' || isOAuthCallback) {
          setView('chat-hub');
        }
        checkFirstTimeUser();
      } else {
        setView('admin');
      }

      // Clean up OAuth params from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      setHasHandledOAuthRedirect(true);
    }
    // Special handling: If OAuth callback detected but no user yet, wait a bit longer
    else if (isOAuthCallback && !user && !hasHandledOAuthRedirect) {
      // Give Supabase more time to process the OAuth callback in PWA mode
      const waitTimer = setTimeout(() => {
        // If still no user after waiting, something went wrong - clean up URL
        if (!user) {
          window.history.replaceState({}, document.title, window.location.pathname);
          setHasHandledOAuthRedirect(true);
        }
      }, 3000); // Wait 3 seconds for auth to complete

      return () => clearTimeout(waitTimer);
    }
  }, [loading, user, profile, initialLoadComplete, isPasswordReset, hasHandledOAuthRedirect]);

  // Persist subscription modal state to sessionStorage
  useEffect(() => {
    sessionStorage.setItem('showSubscriptionModal', showSubscriptionModal.toString());
  }, [showSubscriptionModal]);

  // Persist view state to sessionStorage for browser refresh
  useEffect(() => {
    if (view) {
      sessionStorage.setItem('currentView', view);
    }
  }, [view]);

  useEffect(() => {
    if (selectedPaperId) {
      sessionStorage.setItem('selectedPaperId', selectedPaperId);
    } else {
      sessionStorage.removeItem('selectedPaperId');
    }
  }, [selectedPaperId]);

  useEffect(() => {
    if (selectedConversationId) {
      sessionStorage.setItem('selectedConversationId', selectedConversationId);
    } else {
      sessionStorage.removeItem('selectedConversationId');
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (selectedMode) {
      sessionStorage.setItem('selectedMode', selectedMode);
    } else {
      sessionStorage.removeItem('selectedMode');
    }
  }, [selectedMode]);

  useEffect(() => {
    if (selectedGradeId) {
      sessionStorage.setItem('selectedGradeId', selectedGradeId);
    } else {
      sessionStorage.removeItem('selectedGradeId');
    }
  }, [selectedGradeId]);

  useEffect(() => {
    if (selectedSubjectId) {
      sessionStorage.setItem('selectedSubjectId', selectedSubjectId);
    } else {
      sessionStorage.removeItem('selectedSubjectId');
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    if (selectedChapterId) {
      sessionStorage.setItem('selectedChapterId', selectedChapterId);
    } else {
      sessionStorage.removeItem('selectedChapterId');
    }
  }, [selectedChapterId]);

  const checkFirstTimeUser = async () => {
    if (!user) {
      return;
    }

    // Check if welcome modal was already shown in this session
    const welcomeShownKey = `welcome_shown_${user.id}`;
    const welcomeShown = sessionStorage.getItem(welcomeShownKey);

    if (welcomeShown === 'true') {
      return;
    }

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

      if (subscription && subscription.subscription_tiers.name === 'free') {
        const tokenLimit = subscription.subscription_tiers.token_limit || 0;
        const papersLimit = subscription.subscription_tiers.papers_limit || 0;

        // Cap remaining tokens/papers at 0 to avoid showing negative values
        const tokensLeft = Math.max(0, tokenLimit - subscription.tokens_used_current_period);
        const papersLeft = Math.max(0, papersLimit - subscription.papers_accessed_current_period);

        setTokensRemaining(tokensLeft);
        setPapersRemaining(papersLeft);
        setShowWelcomeModal(true);

        // Mark welcome modal as shown for this session
        sessionStorage.setItem(welcomeShownKey, 'true');
      }
    } catch (error) {
    }
  };

  useEffect(() => {
    if (initialLoadComplete && user && profile && !isPasswordReset) {
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
  }, [user, profile, initialLoadComplete, view, isPasswordReset]);

  useEffect(() => {
    if (initialLoadComplete && !user && !loading && !isPasswordReset) {
      if (view !== 'home' && view !== 'login' && view !== 'papers-browser' && view !== 'exam-viewer' && view !== 'unified-viewer' && view !== 'reset-password' && view !== 'blog' && view !== 'blog-post') {
        setView('home');
      }
    }
  }, [user, loading, initialLoadComplete, view, isPasswordReset]);

  const handleSelectPaper = (paperId: string) => {
    setSelectedPaperId(paperId);
    setSelectedConversationId(null); // ExamViewer will auto-detect existing conversation
    setView('exam-viewer');
  };

  const handleSelectConversation = async (conversationId: string, paperId: string) => {
    // Check if this is a chapter-based conversation
    try {
      const { data: conv, error } = await supabase
        .from('conversations')
        .select('practice_mode, chapter_id, exam_papers(subjects(id), grade_levels(id))')
        .eq('id', conversationId)
        .single();

      if (error) throw error;

      if (conv && conv.practice_mode === 'chapter' && conv.chapter_id) {
        // Route to unified viewer in chapter mode
        const gradeId = (conv.exam_papers as any).grade_levels.id;
        const subjectId = (conv.exam_papers as any).subjects.id;

        setSelectedMode('chapter');
        setSelectedGradeId(gradeId);
        setSelectedSubjectId(subjectId);
        setSelectedChapterId(conv.chapter_id);
        setView('unified-viewer');
      } else {
        // Route to exam viewer for year mode
        setSelectedConversationId(conversationId);
        setSelectedPaperId(paperId);
        setView('exam-viewer');
      }
    } catch (error) {
      // Fallback to exam viewer
      setSelectedConversationId(conversationId);
      setSelectedPaperId(paperId);
      setView('exam-viewer');
    }
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

  const handleBackToChatHub = () => {
    setSelectedPaperId(null);
    setSelectedConversationId(null);
    setSelectedMode(null);
    setSelectedGradeId(null);
    setSelectedSubjectId(null);
    setSelectedChapterId(null);
    // Always go to chat hub for authenticated users
    if (user) {
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
    setSelectedGradeFromNavbar({ id: gradeId, name: gradeName });
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

  // Blog navigation handlers
  const handleNavigateToBlog = () => {
    setView('blog');
    setSelectedBlogPost(null);
  };

  const handleSelectBlogPost = (post: BlogPostType) => {
    setSelectedBlogPost(post);
    setView('blog-post');
  };

  const handleBackToBlogList = () => {
    setSelectedBlogPost(null);
    setView('blog');
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

  if (view === 'reset-password') {
    return <ResetPassword />;
  }

  if (view === 'login') {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateBlog={handleNavigateToBlog}
          onSelectGrade={handleSelectGrade}
          currentView={view}
          hideSignInButton={true}
        />
        <LoginForm onLoginSuccess={() => {}} />
        <Modal
          isOpen={showEmailVerifiedModal}
          onClose={() => setShowEmailVerifiedModal(false)}
          title="Email Verified!"
          message="Your email has been successfully verified. You can now sign in to your account."
          type="success"
        />
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
          onNavigateBlog={handleNavigateToBlog}
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
          onBack={handleBackToChatHub}
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
          onNavigateBlog={handleNavigateToBlog}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <ExamPapersBrowser
          onSelectPaper={handleSelectPaper}
          selectedGradeFromNavbar={selectedGradeFromNavbar}
        />
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
          onBack={handleBackToChatHub}
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

  // Blog views
  if (view === 'blog') {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateBlog={handleNavigateToBlog}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <BlogList
          onSelectPost={handleSelectBlogPost}
          onBack={handleBackToHome}
        />
      </>
    );
  }

  if (view === 'blog-post' && selectedBlogPost) {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateBlog={handleNavigateToBlog}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <BlogPost
          post={selectedBlogPost}
          onBack={handleBackToBlogList}
        />
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
        onNavigateBlog={handleNavigateToBlog}
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
