import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, GraduationCap, FileText, MessageSquare, TrendingUp, Users, Settings, BarChart3, CreditCard, UserCog, Wallet, BookMarked, Library, Tag, ChevronDown, ChevronRight, BookOpenCheck, Menu, X, Home, User, Calendar, LogOut, DollarSign, Brain } from 'lucide-react';
import { SubjectManager } from './SubjectManager';
import { GradeLevelManager } from './GradeLevelManager';
import { ExamPaperManager } from './ExamPaperManager';
import { AIPromptManager } from './AIPromptManager';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import { AdminSubscriptionManager } from './AdminSubscriptionManager';
import { TierConfigManager } from './TierConfigManager';
import { AdminPaymentApproval } from './AdminPaymentApproval';
import { UserManagement } from './UserManagement';
import { PaymentMethodManager } from './PaymentMethodManager';
import { SyllabusManager } from './SyllabusManager';
import { QuestionBankByChapter } from './QuestionBankByChapter';
import { SystemSettings } from './SystemSettings';
import { CouponCodeManager } from './CouponCodeManager';
import { CurrencyExchangeManager } from './CurrencyExchangeManager';
import { AIModelSettings } from './AIModelSettings';
import { ReferralConfigManager } from './ReferralConfigManager';

interface AdminDashboardProps {
  onNavigateHome?: () => void;
  onNavigateProfile?: () => void;
  onNavigateChatHub?: () => void;
  onNavigateStudyPlan?: () => void;
  onSignOut?: () => void;
}

type Tab = 'subjects' | 'grades' | 'exams' | 'prompts' | 'analytics' | 'subscriptions' | 'tier-config' | 'payments' | 'payment-methods' | 'coupons' | 'currency-rates' | 'referral-config' | 'syllabus' | 'question-bank' | 'users' | 'system-settings' | 'ai-model-settings';

interface MenuItem {
  id: Tab;
  label: string;
  icon: React.ElementType;
}

interface MenuGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: MenuItem[];
}

type MenuConfig = (MenuGroup | MenuItem)[];

export function AdminDashboard({
  onNavigateHome,
  onNavigateProfile,
  onNavigateChatHub,
  onNavigateStudyPlan,
  onSignOut
}: AdminDashboardProps = {}) {
  const [activeTab, setActiveTab] = useState<Tab>('payments');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['payment-mgmt']));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile } = useAuth();

  // New organized menu structure with groups
  const menuConfig: MenuConfig = [
    {
      id: 'exam-setup',
      label: 'Exam Paper Setup',
      icon: BookOpenCheck,
      items: [
        { id: 'grades' as Tab, label: 'Grade Levels', icon: GraduationCap },
        { id: 'subjects' as Tab, label: 'Subjects', icon: BookOpen },
        { id: 'syllabus' as Tab, label: 'Syllabus', icon: BookMarked },
        { id: 'exams' as Tab, label: 'Exam Papers', icon: FileText },
        { id: 'question-bank' as Tab, label: 'Question Bank', icon: Library },
      ],
    },
    {
      id: 'user-mgmt',
      label: 'User Management',
      icon: UserCog,
      items: [
        { id: 'users' as Tab, label: 'Users', icon: UserCog },
        { id: 'subscriptions' as Tab, label: 'Subscriptions', icon: Users },
        { id: 'referral-config' as Tab, label: 'Referral System', icon: TrendingUp },
      ],
    },
    {
      id: 'payment-mgmt',
      label: 'Payment Management',
      icon: CreditCard,
      items: [
        { id: 'payments' as Tab, label: 'Payment Approvals', icon: CreditCard },
        { id: 'payment-methods' as Tab, label: 'Payment Methods', icon: Wallet },
        { id: 'coupons' as Tab, label: 'Coupon Codes', icon: Tag },
        { id: 'currency-rates' as Tab, label: 'Currency Rates', icon: DollarSign },
      ],
    },
    {
      id: 'config',
      label: 'Configuration',
      icon: Settings,
      items: [
        { id: 'tier-config' as Tab, label: 'Tier Config', icon: TrendingUp },
        { id: 'prompts' as Tab, label: 'AI Prompts', icon: MessageSquare },
        { id: 'ai-model-settings' as Tab, label: 'AI Model Settings', icon: Brain },
        { id: 'system-settings' as Tab, label: 'System Settings', icon: Settings },
      ],
    },
    { id: 'analytics' as Tab, label: 'Analytics', icon: BarChart3 },
  ];

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set<string>();
      // If the group is currently expanded, collapse it (empty set)
      // Otherwise, expand only this group (replacing all others)
      if (!prev.has(groupId)) {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const isGroup = (item: MenuGroup | MenuItem): item is MenuGroup => {
    return 'items' in item;
  };

  const renderMenuItem = (item: MenuItem, isSubItem = false, parentGroupId?: string) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;

    return (
      <button
        key={item.id}
        onClick={() => {
          setActiveTab(item.id);
          setMobileMenuOpen(false);
          // If this is a sub-item, auto-expand its parent group and collapse others
          if (isSubItem && parentGroupId) {
            setExpandedGroups(new Set([parentGroupId]));
          }
        }}
        className={`w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
          isActive
            ? 'bg-black text-white'
            : 'text-gray-700 hover:bg-gray-100'
        } ${isSubItem ? 'pl-12' : ''}`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span>{item.label}</span>
      </button>
    );
  };

  const renderMenuGroup = (group: MenuGroup) => {
    const Icon = group.icon;
    const isExpanded = expandedGroups.has(group.id);
    const hasActiveItem = group.items.some(item => item.id === activeTab);

    return (
      <div key={group.id} className="space-y-1">
        <button
          onClick={() => toggleGroup(group.id)}
          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
            hasActiveItem && !isExpanded
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span>{group.label}</span>
          </div>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {isExpanded && (
          <div className="space-y-1">
            {group.items.map(item => renderMenuItem(item, true, group.id))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Header */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 fixed top-0 left-0 right-0 z-[60]">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-black p-2 rounded-lg">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Admin Dashboard</h1>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Spacer for fixed header on mobile */}
      <div className="lg:hidden h-[60px]"></div>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-[55] lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <div className="flex">
        {/* Sidebar */}
        <div className={`
          w-64 min-h-screen bg-white border-r border-gray-200 flex-shrink-0
          fixed lg:static inset-y-0 left-0 z-[65]
          transform transition-transform duration-300 ease-in-out
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {/* Desktop Header */}
          <div className="hidden lg:block p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="bg-black p-2 rounded-lg">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Admin Dashboard</h1>
              </div>
            </div>
            <p className="text-xs text-gray-600 mt-2">{profile?.email}</p>
          </div>

          {/* Mobile Header inside Sidebar */}
          <div className="lg:hidden p-4 border-b border-gray-200">
            <p className="text-xs text-gray-600">{profile?.email}</p>
          </div>

          {/* Mobile User Navigation - Only show on mobile */}
          <div className="lg:hidden border-b border-gray-200">
            <nav className="p-2 space-y-1">
              {onNavigateHome && (
                <button
                  onClick={() => {
                    onNavigateHome();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Home className="w-4 h-4 flex-shrink-0" />
                  <span>Home</span>
                </button>
              )}
              {onNavigateProfile && (
                <button
                  onClick={() => {
                    onNavigateProfile();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <User className="w-4 h-4 flex-shrink-0" />
                  <span>My Profile</span>
                </button>
              )}
              {onNavigateChatHub && (
                <button
                  onClick={() => {
                    onNavigateChatHub();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <MessageSquare className="w-4 h-4 flex-shrink-0" />
                  <span>My Conversations</span>
                </button>
              )}
              {onNavigateStudyPlan && (
                <button
                  onClick={() => {
                    onNavigateStudyPlan();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Calendar className="w-4 h-4 flex-shrink-0" />
                  <span>My Study Plan</span>
                </button>
              )}
              {onSignOut && (
                <button
                  onClick={() => {
                    onSignOut();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  <span>Sign Out</span>
                </button>
              )}
            </nav>
          </div>

          {/* Admin Navigation */}
          <nav className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
            <div className="lg:hidden mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2">Admin Menu</h3>
            </div>
            {menuConfig.map(item =>
              isGroup(item) ? renderMenuGroup(item) : renderMenuItem(item)
            )}
          </nav>

          {/* Desktop User Navigation - Only show on desktop */}
          {onNavigateProfile && (
            <div className="hidden lg:block border-t border-gray-200 p-4">
              <button
                onClick={onNavigateProfile}
                className="w-full flex items-center space-x-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <User className="w-4 h-4 flex-shrink-0" />
                <span>My Profile</span>
              </button>
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 w-full lg:w-auto p-4 sm:p-6 lg:p-8">
          <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
            {activeTab === 'subjects' && <SubjectManager />}
            {activeTab === 'grades' && <GradeLevelManager />}
            {activeTab === 'exams' && <ExamPaperManager />}
            {activeTab === 'syllabus' && <SyllabusManager />}
            {activeTab === 'question-bank' && <QuestionBankByChapter />}
            {activeTab === 'prompts' && <AIPromptManager />}
            {activeTab === 'ai-model-settings' && <AIModelSettings />}
            {activeTab === 'system-settings' && <SystemSettings />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'subscriptions' && <AdminSubscriptionManager />}
            {activeTab === 'referral-config' && <ReferralConfigManager />}
            {activeTab === 'payments' && <AdminPaymentApproval />}
            {activeTab === 'payment-methods' && <PaymentMethodManager />}
            {activeTab === 'coupons' && <CouponCodeManager />}
            {activeTab === 'currency-rates' && <CurrencyExchangeManager />}
            {activeTab === 'tier-config' && <TierConfigManager />}
            {activeTab === 'analytics' && <AnalyticsDashboard />}
          </div>
        </div>
      </div>
    </div>
  );
}
