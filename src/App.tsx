import { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { AdminDashboard } from './components/AdminDashboard';
import { Homepage } from './components/Homepage';
import { ExamViewer } from './components/ExamViewer';
import { ChatHub } from './components/ChatHub';
import { Navbar } from './components/Navbar';
import { ExamPapersBrowser } from './components/ExamPapersBrowser';

type View = 'home' | 'login' | 'admin' | 'exam-viewer' | 'chat-hub' | 'papers-browser';

function App() {
  const { user, profile, loading } = useAuth();
  const [view, setView] = useState<View>('home');
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    if (!loading && !initialLoadComplete) {
      if (user && profile?.role !== 'admin') {
        setView('chat-hub');
      }
      setInitialLoadComplete(true);
    }
  }, [loading, user, profile, initialLoadComplete]);

  useEffect(() => {
    if (initialLoadComplete && user && profile) {
      if (view === 'login') {
        if (profile.role === 'admin') {
          setView('admin');
        } else {
          setView('chat-hub');
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
      <ChatHub
        onSelectConversation={handleSelectConversation}
        onSelectPaper={handleSelectPaper}
        onNavigateHome={handleNavigateToHomepage}
      />
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
    </>
  );
}

export default App;
