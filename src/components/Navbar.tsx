import { useState, useEffect, useRef } from 'react';
import { Menu, BookOpen, LogIn, LogOut, LayoutDashboard, MessageSquare, FileText, Calendar, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

interface GradeLevel {
  id: string;
  name: string;
  display_order: number;
}

interface Props {
  onNavigateHome: () => void;
  onNavigateAdmin: () => void;
  onNavigateLogin: () => void;
  onNavigateChatHub?: () => void;
  onNavigateStudyPlan?: () => void;
  onNavigateBlog?: () => void;
  onNavigateProfile?: () => void;
  onSelectGrade: (gradeId: string, gradeName: string) => void;
  currentView: string;
  hideSignInButton?: boolean;
}

export function Navbar({ onNavigateHome, onNavigateAdmin, onNavigateLogin, onNavigateChatHub, onNavigateStudyPlan, onNavigateBlog, onNavigateProfile, onSelectGrade, currentView, hideSignInButton = false }: Props) {
  const { user, profile, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const desktopMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGradeLevels();
  }, []);

  // Click outside handler for desktop menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (desktopMenuRef.current && !desktopMenuRef.current.contains(event.target as Node)) {
        setDesktopMenuOpen(false);
      }
    };

    if (desktopMenuOpen) {
      // Use setTimeout to avoid immediate closure when opening
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [desktopMenuOpen]);

  // Click outside handler for mobile menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      // Use setTimeout to avoid immediate closure when opening
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

  const fetchGradeLevels = async () => {
    try {
      const { data, error } = await supabase
        .from('grade_levels')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setGradeLevels(data || []);
    } catch (error) {
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setMobileMenuOpen(false);
      onNavigateHome();
    } catch (error) {
      setMobileMenuOpen(false);
      onNavigateHome();
    }
  };

  const handleGradeClick = (gradeId: string, gradeName: string) => {
    onSelectGrade(gradeId, gradeName);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <button
  onClick={onNavigateHome}
  className="flex items-center text-gray-900 hover:text-gray-600 transition-colors"
>
  <img
    src="/assets/logo.png"
    alt="Aixampaper Logo"
    className="h-16 w-auto object-contain"
  />
</button>



          <div className="hidden md:flex items-center space-x-1">
            {gradeLevels.map((grade) => (
              <button
                key={grade.id}
                onClick={() => handleGradeClick(grade.id, grade.name)}
                className="px-4 py-2 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg transition-colors font-medium"
              >
                {grade.name}
              </button>
            ))}

            {onNavigateBlog && (
              <button
                onClick={() => {
                  onNavigateBlog();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center space-x-1 px-4 py-2 text-gray-700 hover:text-black hover:bg-gray-50 rounded-lg transition-colors font-medium"
              >
                <FileText className="w-4 h-4" />
                <span>Blog</span>
              </button>
            )}

            <div className="w-px h-6 bg-gray-200 mx-2" />

            {user ? (
              <div className="relative" ref={desktopMenuRef}>
                <button
                  onClick={() => setDesktopMenuOpen(!desktopMenuOpen)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Menu"
                >
                  <Menu className="w-5 h-5 text-gray-700" />
                </button>

                {/* Desktop User Menu Dropdown */}
                {desktopMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
                    {onNavigateProfile && (
                      <button
                        onClick={() => {
                          setDesktopMenuOpen(false);
                          onNavigateProfile();
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                      >
                        <User className="w-4 h-4" />
                        <span>My Profile</span>
                      </button>
                    )}
                    {onNavigateChatHub && (
                      <button
                        onClick={() => {
                          setDesktopMenuOpen(false);
                          onNavigateChatHub();
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>My Conversations</span>
                      </button>
                    )}
                    {onNavigateStudyPlan && (
                      <button
                        onClick={() => {
                          setDesktopMenuOpen(false);
                          onNavigateStudyPlan();
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                      >
                        <Calendar className="w-4 h-4" />
                        <span>My Study Plan</span>
                      </button>
                    )}
                    {profile?.role === 'admin' && (
                      <>
                        <div className="border-t border-gray-200 my-1" />
                        <button
                          onClick={() => {
                            setDesktopMenuOpen(false);
                            onNavigateAdmin();
                          }}
                          className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                        >
                          <LayoutDashboard className="w-4 h-4" />
                          <span>Admin Dashboard</span>
                        </button>
                      </>
                    )}
                    <div className="border-t border-gray-200 my-1" />
                    <button
                      onClick={() => {
                        setDesktopMenuOpen(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : !hideSignInButton ? (
              <button
                onClick={onNavigateLogin}
                className="flex items-center space-x-1 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            ) : null}
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-700 hover:text-black"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 py-4" ref={mobileMenuRef}>
            <div className="space-y-2">
              {/* Show grades directly without nesting */}
              {gradeLevels.map((grade) => (
                <button
                  key={grade.id}
                  onClick={() => handleGradeClick(grade.id, grade.name)}
                  className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  <span>{grade.name}</span>
                </button>
              ))}

              {gradeLevels.length > 0 && <div className="border-b border-gray-200 pb-1 mb-1" />}

              {onNavigateBlog && (
                <button
                  onClick={() => {
                    onNavigateBlog();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  <FileText className="w-4 h-4" />
                  <span>Blog & Study Tips</span>
                </button>
              )}

              {onNavigateBlog && <div className="border-b border-gray-200 pb-1 mb-1" />}

              {user ? (
                <>
                  {onNavigateProfile && (
                    <button
                      onClick={() => {
                        onNavigateProfile();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <User className="w-4 h-4" />
                      <span>My Profile</span>
                    </button>
                  )}
                  {onNavigateChatHub && (
                    <button
                      onClick={() => {
                        onNavigateChatHub();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <MessageSquare className="w-4 h-4" />
                      <span>My Conversations</span>
                    </button>
                  )}
                  {onNavigateStudyPlan && (
                    <button
                      onClick={() => {
                        onNavigateStudyPlan();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>My Study Plan</span>
                    </button>
                  )}
                  {profile?.role === 'admin' && (
                    <button
                      onClick={() => {
                        onNavigateAdmin();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                    >
                      <LayoutDashboard className="w-4 h-4" />
                      <span>Admin Dashboard</span>
                    </button>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : !hideSignInButton ? (
                <button
                  onClick={() => {
                    onNavigateLogin();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 mx-4"
                  style={{ width: 'calc(100% - 2rem)' }}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
