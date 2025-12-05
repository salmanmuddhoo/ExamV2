import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useHintTutorial } from './contexts/HintTutorialContext';
import { LoginForm } from './components/LoginForm';
import { AdminDashboard } from './components/AdminDashboard';
import { Homepage } from './components/Homepage';
import { ExamViewer } from './components/ExamViewer';
import { ChatHub } from './components/ChatHub';
import { Navbar } from './components/Navbar';
import { ExamPapersBrowser } from './components/ExamPapersBrowser';
import { WelcomeModal, shouldShowWelcomeModal } from './components/WelcomeModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { Modal } from './components/Modal';
import { PaymentPage } from './components/PaymentPage';
import { UnifiedPracticeViewer } from './components/UnifiedPracticeViewer';
import { ResetPassword } from './components/ResetPassword';
import { EmailVerification } from './components/EmailVerification';
import { BlogList } from './components/BlogList';
import { BlogPost } from './components/BlogPost';
import { StudyPlanCalendar } from './components/StudyPlanCalendar';
import { ReferralDashboard } from './components/ReferralDashboard';
import { PWAInstallBanner } from './components/PWAInstallBanner';
import { HintTutorialManager } from './components/HintTutorialManager';
import { supabase } from './lib/supabase';
import { BlogPost as BlogPostType } from './data/blogPosts';

type View = 'home' | 'login' | 'admin' | 'exam-viewer' | 'chat-hub' | 'papers-browser' | 'unified-viewer' | 'payment' | 'reset-password' | 'email-verification' | 'blog' | 'blog-post' | 'study-plan' | 'referrals';

// Helper function to map URL pathname to view
function getViewFromPathname(pathname: string): View {
  // Remove trailing slash and normalize path (remove /app prefix if present)
  let path = pathname.replace(/\/$/, '') || '/';
  // Remove /app prefix if it exists (for Supabase redirects with /app)
  if (path.startsWith('/app')) {
    path = path.substring(4) || '/';
  }

  // Map common URL patterns to views
  if (path === '/' || path === '/home') return 'home';
  if (path === '/blog') return 'blog';
  if (path === '/study-plan' || path === '/my-study-plan') return 'study-plan';
  if (path === '/referrals' || path === '/refer') return 'referrals';
  if (path === '/login') return 'login';
  if (path === '/payment' || path === '/pricing') return 'payment';
  if (path === '/email-verification' || path === '/verify-email') return 'email-verification';
  if (path === '/reset-password') return 'reset-password';

  // Map papers-related URLs to papers-browser
  if (path === '/papers' || path === '/papers-browser') return 'papers-browser';
  if (path.includes('past-papers')) return 'papers-browser';
  if (path === '/about') return 'home';

  // Default to home for unknown paths
  return 'home';
}

// Helper function to get pathname from view
function getPathnameFromView(view: View): string {
  switch (view) {
    case 'blog': return '/blog';
    case 'study-plan': return '/study-plan';
    case 'referrals': return '/referrals';
    case 'papers-browser': return '/papers';
    case 'chat-hub': return '/chat';
    case 'login': return '/login';
    case 'payment': return '/pricing';
    default: return '/';
  }
}

function App() {
  const { user, profile, loading, signOut } = useAuth();
  const { setCurrentView } = useHintTutorial();
  const [view, setView] = useState<View>(() => {
    // First, check if there's a saved view in sessionStorage
    const savedView = sessionStorage.getItem('currentView');
    if (savedView) return savedView as View;

    // Otherwise, derive view from current URL pathname
    return getViewFromPathname(window.location.pathname);
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
  const [tokensLimit, setTokensLimit] = useState<number | null>(null);
  const [tokensUsed, setTokensUsed] = useState(0);
  const [papersRemaining, setPapersRemaining] = useState(0);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(() => {
    // Persist subscription modal state across page navigation
    return sessionStorage.getItem('showSubscriptionModal') === 'true';
  });
  const [isPasswordReset, setIsPasswordReset] = useState(false);
  const [hasHandledOAuthRedirect, setHasHandledOAuthRedirect] = useState(false);
  const [selectedBlogPost, setSelectedBlogPost] = useState<BlogPostType | null>(null);
  const [showEmailVerifiedModal, setShowEmailVerifiedModal] = useState(false);
  const [showChatHubProfile, setShowChatHubProfile] = useState(false);

  // Update URL when view changes
  useEffect(() => {
    const newPath = getPathnameFromView(view);
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';

    // CRITICAL: Preserve OAuth callback codes in URL
    // Don't change URL if there's an OAuth code parameter - let Supabase process it first
    const urlParams = new URLSearchParams(window.location.search);
    const hasOAuthCode = urlParams.has('code');

    if (hasOAuthCode) {
      // Don't update URL yet, let Supabase's automatic OAuth processing complete first
      sessionStorage.setItem('currentView', view);
      return;
    }

    // Only update if the path actually changed (avoid unnecessary history entries)
    if (newPath !== currentPath) {
      window.history.pushState({ view }, '', newPath);
    }

    // Save current view to sessionStorage
    sessionStorage.setItem('currentView', view);
  }, [view]);

  // Sync view with hint tutorial context
  useEffect(() => {
    setCurrentView(view);
  }, [view, setCurrentView]);

  // Browser back button handler - Handle URL-based navigation
  useEffect(() => {
    const handlePopState = () => {
      // Get the view from the new pathname
      const newView = getViewFromPathname(window.location.pathname);

      // Prevent logout on back navigation if user is authenticated
      if (user && newView !== 'login') {
        setView(newView);
      } else {
        setView(newView);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user, profile]);

  // Check for password reset token or email verification in URL (must run first)
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');

    // CRITICAL: Check type in BOTH hash and query params (Supabase can use either!)
    const typeInHash = hashParams.get('type');
    const typeInQuery = queryParams.get('type');
    const type = typeInHash || typeInQuery;

    const code = queryParams.get('code');
    const token = queryParams.get('token'); // PKCE token parameter
    const state = queryParams.get('state');

    // IMPORTANT: Don't try to distinguish OAuth from password reset here!
    // Both end up with ?code=... after Supabase processes them.
    // The auth event listener below will distinguish:
    // - PASSWORD_RECOVERY event = password reset
    // - SIGNED_IN event = OAuth or legacy flows

    // Handle PKCE token flow (Supabase verify links with token parameter)
    if (token && type) {
      if (type === 'recovery') {
        setIsPasswordReset(true);
        setView('reset-password');
        return;
      } else if (type === 'signup' || type === 'email_change') {
        setView('email-verification');
        return;
      }
    }

    // Legacy hash-based authentication
    if (accessToken && type === 'recovery') {
      setIsPasswordReset(true);
      setView('reset-password');
      return;
    } else if (accessToken && (type === 'signup' || type === 'email_change')) {
      setShowEmailVerifiedModal(true);
      setView('login');
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // Check for authentication code in query parameters (Supabase magic links)
    if (code) {
      let currentPath = window.location.pathname.replace(/\/$/, '') || '/';

      // Remove /app prefix if it exists
      if (currentPath.startsWith('/app')) {
        currentPath = currentPath.substring(4) || '/';
        const newUrl = currentPath + window.location.search + window.location.hash;
        window.history.replaceState({}, document.title, newUrl);
      }

      // If URL explicitly includes the path, honor it
      if (currentPath === '/email-verification' || currentPath === '/verify-email') {
        setView('email-verification');
        return;
      }

      if (currentPath === '/reset-password') {
        setIsPasswordReset(true);
        setView('reset-password');
        return;
      }

      // Listen for auth events
      let hasDetectedEvent = false;
      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (hasDetectedEvent) {
          return;
        }

        if (event === 'PASSWORD_RECOVERY') {
          hasDetectedEvent = true;
          setIsPasswordReset(true);
          setView('reset-password');
          authListener.subscription.unsubscribe();
        } else if (event === 'SIGNED_IN' && session?.user) {
          hasDetectedEvent = true;
          // OAuth users go to chat-hub
          // (Email verification is handled by path check: /email-verification)
          setView('chat-hub');
          authListener.subscription.unsubscribe();
        } else if (event === 'USER_UPDATED') {
          hasDetectedEvent = true;
          setView('email-verification');
          authListener.subscription.unsubscribe();
        }
      });

      // Fallback timer
      const fallbackTimer = setTimeout(async () => {
        if (!hasDetectedEvent) {
          authListener.subscription.unsubscribe();

          const { data: sessionData } = await supabase.auth.getSession();

          if (sessionData?.session?.user) {
            setView('email-verification');
          } else {
            setIsPasswordReset(true);
            setView('reset-password');
          }
        }
      }, 3000);

      return () => {
        clearTimeout(fallbackTimer);
        if (authListener?.subscription) {
          authListener.subscription.unsubscribe();
        }
      };
    }
  }, []);

  // Handle OAuth redirect and initial authentication state
  useEffect(() => {
    if (loading) return;

    // EARLY CHECK: Don't run OAuth handler logic if we're on special auth pages
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    if (currentPath === '/email-verification' || currentPath === '/reset-password') {
      return;
    }

    // Check if this is an OAuth callback
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const queryParams = new URLSearchParams(window.location.search);
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    const code = queryParams.get('code');
    const token = queryParams.get('token'); // PKCE token
    const type = queryParams.get('type');

    // OAuth can be:
    // 1. Legacy hash-based: access_token + refresh_token in hash
    // 2. Modern code-based: code in query (but NOT PKCE which has token + type)
    const isOAuthCallback = !!(accessToken && refreshToken) || !!(code && !token && !type);

    // Check if we're in PWA mode and returning from OAuth
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as any).standalone ||
                  document.referrer.includes('android-app://');
    // FIXED: Use localStorage instead of sessionStorage for PWA OAuth tracking
    // sessionStorage is lost when PWA reopens from OAuth redirect
    const pwaOAuthInitiated = localStorage.getItem('pwa_oauth_initiated') === 'true';

    // If PWA OAuth was initiated, log callback status for debugging
    if (isPWA && pwaOAuthInitiated && isOAuthCallback) {
      const provider = localStorage.getItem('pwa_oauth_provider');
      const timestamp = localStorage.getItem('pwa_oauth_timestamp');
      console.log(`[PWA OAuth] Callback received - Provider: ${provider}, Timestamp: ${timestamp}`);
      // Clear the flags after successful callback
      localStorage.removeItem('pwa_oauth_initiated');
      localStorage.removeItem('pwa_oauth_provider');
      localStorage.removeItem('pwa_oauth_timestamp');
    }

    // Clean up stale PWA OAuth flags if callback failed (older than 5 minutes)
    if (isPWA && pwaOAuthInitiated && !isOAuthCallback) {
      const timestamp = localStorage.getItem('pwa_oauth_timestamp');
      if (timestamp && Date.now() - parseInt(timestamp) > 5 * 60 * 1000) {
        console.log('[PWA OAuth] Cleaning up stale OAuth flags');
        localStorage.removeItem('pwa_oauth_initiated');
        localStorage.removeItem('pwa_oauth_provider');
        localStorage.removeItem('pwa_oauth_timestamp');
      }
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
        // Admin users also land on chat-hub (homepage) instead of admin dashboard
        setView('chat-hub');
        checkFirstTimeUser();
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

  // Fetch token balance for current user (used in Study Plan page)
  const fetchTokenBalance = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          subscription_tiers(name, display_name, token_limit, papers_limit),
          tokens_used_current_period,
          token_limit_override,
          papers_accessed_current_period
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        // Set default values if no subscription found
        setTokensRemaining(0);
        setTokensLimit(null);
        setTokensUsed(0);
        return;
      }

      const tierData = data.subscription_tiers as any;
      const tierLimit = tierData?.token_limit;
      const overrideLimit = data.token_limit_override;
      const tokensUsedValue = data.tokens_used_current_period ?? 0;
      const isAdmin = profile?.role === 'admin';

      // Calculate final limit (override takes precedence)
      const finalLimit = overrideLimit ?? tierLimit;
      const tokensRemainingValue = finalLimit === null ? null : finalLimit - tokensUsedValue;

      // For non-admin users, cap displayed usage at the limit
      const displayedTokensUsed = isAdmin ? tokensUsedValue : (finalLimit !== null ? Math.min(tokensUsedValue, finalLimit) : tokensUsedValue);

      setTokensLimit(finalLimit);
      setTokensUsed(displayedTokensUsed);
      setTokensRemaining(isAdmin ? (tokensRemainingValue || 0) : Math.max(0, tokensRemainingValue || 0));

      // Set papers information
      const paperLimit = tierData?.papers_limit;
      const papersUsed = data.papers_accessed_current_period || 0;
      const papersRemainingValue = paperLimit === null ? null : Math.max(0, paperLimit - papersUsed);
      setPapersRemaining(papersRemainingValue || 0);
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
  };

  const checkFirstTimeUser = async () => {
    if (!user) {
      return;
    }

    // Check if user has opted to not show the welcome modal
    if (!shouldShowWelcomeModal()) {
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
        setTokensLimit(tokenLimit);
        setTokensUsed(subscription.tokens_used_current_period);
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
      // Fetch token balance for all users
      fetchTokenBalance();

      if (view === 'login') {
        // All users (including admins) land on chat-hub (homepage)
        setView('chat-hub');
        // Check if user is free tier and show welcome modal
        checkFirstTimeUser();
      }
    }
  }, [user, profile, initialLoadComplete, view, isPasswordReset]);

  useEffect(() => {
    if (initialLoadComplete && !user && !loading && !isPasswordReset) {
      if (view !== 'home' && view !== 'login' && view !== 'papers-browser' && view !== 'exam-viewer' && view !== 'unified-viewer' && view !== 'reset-password' && view !== 'blog' && view !== 'blog-post' && view !== 'study-plan') {
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

  const handleNavigateToProfile = () => {
    // If we're already in chat-hub, just open the profile modal
    if (view === 'chat-hub') {
      setShowChatHubProfile(true);
    } else {
      // Otherwise navigate to chat-hub and open profile
      setView('chat-hub');
      setShowChatHubProfile(true);
    }
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

  // Study plan navigation handlers
  const handleNavigateToStudyPlan = () => {
    setView('study-plan');
  };

  // Referrals navigation handler
  const handleNavigateToReferrals = () => {
    setView('referrals');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setView('home');
    } catch (error) {
      console.error('Error signing out:', error);
      setView('home');
    }
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

  if (view === 'email-verification') {
    return <EmailVerification />;
  }

  if (view === 'login') {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onNavigateBlog={handleNavigateToBlog}
          onNavigateReferrals={handleNavigateToReferrals}
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
        {/* Hide Navbar on mobile, show on desktop */}
        <div className="hidden lg:block">
          <Navbar
            onNavigateHome={handleBackToHome}
            onNavigateAdmin={handleNavigateToAdmin}
            onNavigateLogin={handleNavigateToLogin}
            onNavigateChatHub={handleNavigateToChatHub}
            onNavigateStudyPlan={handleNavigateToStudyPlan}
            onNavigateBlog={handleNavigateToBlog}
            onNavigateReferrals={handleNavigateToReferrals}
            onSelectGrade={handleSelectGrade}
            currentView={view}
          />
        </div>
        <AdminDashboard
          onNavigateHome={() => setView('home')}
          onNavigateProfile={handleNavigateToProfile}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onSignOut={handleSignOut}
        />
      </>
    );
  }

  if (view === 'chat-hub' && user) {
    return (
      <>
        <Navbar
          onNavigateHome={handleNavigateToHomepage}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onNavigateBlog={handleNavigateToBlog}
          onNavigateProfile={handleNavigateToProfile}
          onNavigateReferrals={handleNavigateToReferrals}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <ChatHub
          onSelectConversation={handleSelectConversation}
          onSelectPaper={handleSelectPaper}
          onSelectMode={handleSelectMode}
          onNavigateHome={handleNavigateToHomepage}
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          showWelcomeModal={showWelcomeModal}
          tokensRemaining={tokensRemaining}
          papersRemaining={papersRemaining}
          onCloseWelcomeModal={() => setShowWelcomeModal(false)}
          onOpenSubscriptions={() => setShowSubscriptionModal(true)}
          showProfileModal={showChatHubProfile}
          onCloseProfileModal={() => setShowChatHubProfile(false)}
        />
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={handleCloseSubscriptionModal}
          onSuccess={handleSubscriptionSuccess}
          onNavigateToPayment={handleNavigateToPayment}
        />
        <PWAInstallBanner variant="floating" />
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
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onNavigateBlog={handleNavigateToBlog}
          onNavigateProfile={handleNavigateToProfile}
          onNavigateReferrals={handleNavigateToReferrals}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <ExamPapersBrowser
          onSelectPaper={handleSelectPaper}
          selectedGradeFromNavbar={selectedGradeFromNavbar}
        />
        <PWAInstallBanner variant="floating" />
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
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onNavigateBlog={handleNavigateToBlog}
          onNavigateProfile={handleNavigateToProfile}
          onNavigateReferrals={handleNavigateToReferrals}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <BlogList
          onSelectPost={handleSelectBlogPost}
          onBack={handleBackToHome}
        />
        <PWAInstallBanner variant="floating" />
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
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onNavigateBlog={handleNavigateToBlog}
          onNavigateProfile={handleNavigateToProfile}
          onNavigateReferrals={handleNavigateToReferrals}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <BlogPost
          post={selectedBlogPost}
          onBack={handleBackToBlogList}
        />
        <PWAInstallBanner variant="floating" />
      </>
    );
  }

  // Study plan view
  if (view === 'study-plan' && user) {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onNavigateBlog={handleNavigateToBlog}
          onNavigateProfile={handleNavigateToProfile}
          onNavigateReferrals={handleNavigateToReferrals}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <StudyPlanCalendar
          onBack={handleBackToChatHub}
          onOpenSubscriptions={() => setShowSubscriptionModal(true)}
          tokensRemaining={tokensRemaining}
          tokensLimit={tokensLimit}
          tokensUsed={tokensUsed}
          onRefreshTokens={fetchTokenBalance}
        />
        <SubscriptionModal
          isOpen={showSubscriptionModal}
          onClose={handleCloseSubscriptionModal}
          onSuccess={handleSubscriptionSuccess}
          onNavigateToPayment={handleNavigateToPayment}
        />
        <PWAInstallBanner variant="floating" />
      </>
    );
  }

  // Referrals view
  if (view === 'referrals' && user) {
    return (
      <>
        <Navbar
          onNavigateHome={handleBackToHome}
          onNavigateAdmin={handleNavigateToAdmin}
          onNavigateLogin={handleNavigateToLogin}
          onNavigateChatHub={handleNavigateToChatHub}
          onNavigateStudyPlan={handleNavigateToStudyPlan}
          onNavigateBlog={handleNavigateToBlog}
          onNavigateProfile={handleNavigateToProfile}
          onNavigateReferrals={handleNavigateToReferrals}
          onSelectGrade={handleSelectGrade}
          currentView={view}
        />
        <ReferralDashboard />
        <PWAInstallBanner variant="floating" />
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
        onNavigateStudyPlan={handleNavigateToStudyPlan}
        onNavigateBlog={handleNavigateToBlog}
        onNavigateProfile={handleNavigateToProfile}
        onNavigateReferrals={handleNavigateToReferrals}
        onSelectGrade={handleSelectGrade}
        currentView={view}
      />
      <Homepage
        onGetStarted={handleNavigateToLogin}
        onOpenSubscriptions={() => setShowSubscriptionModal(true)}
        onOpenReferrals={handleNavigateToReferrals}
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

      {/* PWA Install Banner */}
      <PWAInstallBanner variant="floating" />

      {/* Hint Tutorial Manager */}
      <HintTutorialManager />
    </>
  );
}

export default App;
