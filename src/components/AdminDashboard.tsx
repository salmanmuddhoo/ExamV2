import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, GraduationCap, FileText, MessageSquare, TrendingUp, Users, Settings, BarChart3, CreditCard, UserCog, Wallet, BookMarked, Library, Tag, ChevronDown, ChevronRight, BookOpenCheck } from 'lucide-react';
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

type Tab = 'subjects' | 'grades' | 'exams' | 'prompts' | 'analytics' | 'subscriptions' | 'tier-config' | 'payments' | 'payment-methods' | 'coupons' | 'syllabus' | 'question-bank' | 'users' | 'system-settings';

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

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('exams');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['exam-setup']));
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
      ],
    },
    {
      id: 'config',
      label: 'Configuration',
      icon: Settings,
      items: [
        { id: 'tier-config' as Tab, label: 'Tier Config', icon: TrendingUp },
        { id: 'prompts' as Tab, label: 'AI Prompts', icon: MessageSquare },
        { id: 'system-settings' as Tab, label: 'System Settings', icon: Settings },
      ],
    },
    { id: 'analytics' as Tab, label: 'Analytics', icon: BarChart3 },
  ];

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const isGroup = (item: MenuGroup | MenuItem): item is MenuGroup => {
    return 'items' in item;
  };

  const renderMenuItem = (item: MenuItem, isSubItem = false) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;

    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
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
            {group.items.map(item => renderMenuItem(item, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 min-h-screen bg-white border-r border-gray-200 flex-shrink-0">
          <div className="p-6 border-b border-gray-200">
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

          <nav className="p-4 space-y-1">
            {menuConfig.map(item =>
              isGroup(item) ? renderMenuGroup(item) : renderMenuItem(item)
            )}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 p-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            {activeTab === 'subjects' && <SubjectManager />}
            {activeTab === 'grades' && <GradeLevelManager />}
            {activeTab === 'exams' && <ExamPaperManager />}
            {activeTab === 'syllabus' && <SyllabusManager />}
            {activeTab === 'question-bank' && <QuestionBankByChapter />}
            {activeTab === 'prompts' && <AIPromptManager />}
            {activeTab === 'system-settings' && <SystemSettings />}
            {activeTab === 'users' && <UserManagement />}
            {activeTab === 'subscriptions' && <AdminSubscriptionManager />}
            {activeTab === 'payments' && <AdminPaymentApproval />}
            {activeTab === 'payment-methods' && <PaymentMethodManager />}
            {activeTab === 'coupons' && <CouponCodeManager />}
            {activeTab === 'tier-config' && <TierConfigManager />}
            {activeTab === 'analytics' && <AnalyticsDashboard />}
          </div>
        </div>
      </div>
    </div>
  );
}
