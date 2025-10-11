import { useState } from 'react';
import { BarChart3, MessageSquare, Users, TrendingUp } from 'lucide-react';
import { TokenUsageAnalytics } from './TokenUsageAnalytics';
import { AIPromptAnalytics } from './AIPromptAnalytics';

type AnalyticsTab = 'overview' | 'prompts' | 'users' | 'costs';

export function AnalyticsDashboard() {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');

  const tabs = [
    { id: 'overview' as AnalyticsTab, label: 'Token Overview', icon: BarChart3, description: 'Overall token usage by type and subject' },
    { id: 'prompts' as AnalyticsTab, label: 'AI Prompts', icon: MessageSquare, description: 'Input/output tokens by prompt' },
    { id: 'users' as AnalyticsTab, label: 'User Analytics', icon: Users, description: 'Coming soon' },
    { id: 'costs' as AnalyticsTab, label: 'Cost Analysis', icon: TrendingUp, description: 'Coming soon' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Analytics Dashboard</h2>
        <p className="text-sm text-gray-600">Comprehensive insights into your platform usage and performance</p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isComingSoon = tab.id === 'users' || tab.id === 'costs';

            return (
              <button
                key={tab.id}
                onClick={() => !isComingSoon && setActiveTab(tab.id)}
                disabled={isComingSoon}
                className={`relative p-6 text-left transition-all border-b sm:border-b-0 sm:border-r last:border-r-0 ${
                  isActive
                    ? 'bg-blue-50 border-l-4 border-l-blue-600'
                    : isComingSoon
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`p-2 rounded-lg ${
                    isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold mb-1 ${
                      isActive ? 'text-blue-900' : 'text-gray-900'
                    }`}>
                      {tab.label}
                      {isComingSoon && (
                        <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                          Soon
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-2">{tab.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'overview' && <TokenUsageAnalytics />}
        {activeTab === 'prompts' && <AIPromptAnalytics />}
        {activeTab === 'users' && (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">User Analytics</h3>
            <p className="text-sm text-gray-500">
              User behavior and engagement analytics coming soon
            </p>
          </div>
        )}
        {activeTab === 'costs' && (
          <div className="text-center py-12">
            <TrendingUp className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cost Analysis</h3>
            <p className="text-sm text-gray-500">
              Detailed cost breakdown and projections coming soon
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
