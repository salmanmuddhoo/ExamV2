import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BookOpen, GraduationCap, FileText, MessageSquare, TrendingUp, Users, Settings, BarChart3, CreditCard, UserCog, Wallet, BookMarked, Library } from 'lucide-react';
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

type Tab = 'subjects' | 'grades' | 'exams' | 'prompts' | 'analytics' | 'subscriptions' | 'tier-config' | 'payments' | 'payment-methods' | 'syllabus' | 'question-bank' | 'users';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('exams');
  const { profile } = useAuth();

  const tabs = [
    { id: 'exams' as Tab, label: 'Exam Papers', icon: FileText },
    { id: 'syllabus' as Tab, label: 'Syllabus', icon: BookMarked },
    { id: 'question-bank' as Tab, label: 'Question Bank', icon: Library },
    { id: 'prompts' as Tab, label: 'AI Prompts', icon: MessageSquare },
    { id: 'users' as Tab, label: 'User Management', icon: UserCog },
    { id: 'subscriptions' as Tab, label: 'Subscriptions', icon: Users },
    { id: 'payments' as Tab, label: 'Payment Approvals', icon: CreditCard },
    { id: 'payment-methods' as Tab, label: 'Payment Methods', icon: Wallet },
    { id: 'tier-config' as Tab, label: 'Tier Config', icon: Settings },
    { id: 'analytics' as Tab, label: 'Analytics', icon: BarChart3 },
    { id: 'subjects' as Tab, label: 'Subjects', icon: BookOpen },
    { id: 'grades' as Tab, label: 'Grade Levels', icon: GraduationCap },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center space-x-3 mb-6">
            <div className="bg-black p-2 rounded-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-600">{profile?.email}</p>
            </div>
          </div>
        </div>
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'border-black text-black'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className={`bg-white rounded-lg border border-gray-200 ${activeTab === 'analytics' || activeTab === 'payments' || activeTab === 'users' || activeTab === 'payment-methods' || activeTab === 'syllabus' || activeTab === 'question-bank' ? 'p-6' : 'p-6'}`}>
          {activeTab === 'subjects' && <SubjectManager />}
          {activeTab === 'grades' && <GradeLevelManager />}
          {activeTab === 'exams' && <ExamPaperManager />}
          {activeTab === 'syllabus' && <SyllabusManager />}
          {activeTab === 'question-bank' && <QuestionBankByChapter />}
          {activeTab === 'prompts' && <AIPromptManager />}
          {activeTab === 'users' && <UserManagement />}
          {activeTab === 'subscriptions' && <AdminSubscriptionManager />}
          {activeTab === 'payments' && <AdminPaymentApproval />}
          {activeTab === 'payment-methods' && <PaymentMethodManager />}
          {activeTab === 'tier-config' && <TierConfigManager />}
          {activeTab === 'analytics' && <AnalyticsDashboard />}
        </div>
      </div>
    </div>
  );
}
