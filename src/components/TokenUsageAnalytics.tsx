import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, DollarSign, Zap, Calendar, BarChart3, Upload, MessageCircle, BookOpen, ClipboardList, FileText } from 'lucide-react';

interface TokenStats {
  totalTokens: number;
  totalCost: number;
  totalRequests: number;
  avgTokensPerRequest: number;
  uploadTokens: number;
  uploadCost: number;
  uploadRequests: number;
  chatTokens: number;
  chatCost: number;
  chatRequests: number;
}

interface CategoryUsage {
  source: string;
  label: string;
  tokens: number;
  cost: number;
  requests: number;
  icon: any;
  color: string;
}

interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
  requests: number;
}

interface SubjectUsage {
  subject: string;
  tokens: number;
  cost: number;
  requests: number;
}

export function TokenUsageAnalytics() {
  const [stats, setStats] = useState<TokenStats>({
    totalTokens: 0,
    totalCost: 0,
    totalRequests: 0,
    avgTokensPerRequest: 0,
    uploadTokens: 0,
    uploadCost: 0,
    uploadRequests: 0,
    chatTokens: 0,
    chatCost: 0,
    chatRequests: 0,
  });
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [subjectUsage, setSubjectUsage] = useState<SubjectUsage[]>([]);
  const [categoryUsage, setCategoryUsage] = useState<CategoryUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all' | 'specific'>('7d');
  const [specificDate, setSpecificDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchTokenUsage();
  }, [timeRange, specificDate]);

  const fetchTokenUsage = async () => {
    try {
      setLoading(true);

      // Calculate date filter
      let startDate = new Date();
      let endDate: Date | null = null;

      if (timeRange === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (timeRange === '30d') {
        startDate.setDate(startDate.getDate() - 30);
      } else if (timeRange === 'specific') {
        // For specific date, filter for that entire day
        startDate = new Date(specificDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(specificDate);
        endDate.setHours(23, 59, 59, 999);
      } else {
        startDate = new Date('2000-01-01'); // All time
      }

      // Fetch all token usage logs with exam paper and subject info
      let query = supabase
        .from('token_usage_logs')
        .select(`
          *,
          exam_papers (
            title,
            subjects (name)
          )
        `)
        .gte('created_at', startDate.toISOString());

      // Add end date filter for specific date
      if (endDate) {
        query = query.lte('created_at', endDate.toISOString());
      }

      const { data: logs, error } = await query.order('created_at', { ascending: true });

      if (error) throw error;

      if (logs && logs.length > 0) {
        // Separate upload logs (no user_id) from chat logs (has user_id)
        const uploadLogs = logs.filter(log => !log.user_id);
        const chatLogs = logs.filter(log => log.user_id);

        // Calculate overall stats
        const totalTokens = logs.reduce((sum, log) => sum + log.total_tokens, 0);
        const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.estimated_cost), 0);
        const totalRequests = logs.length;
        const avgTokensPerRequest = Math.round(totalTokens / totalRequests);

        // Upload stats
        const uploadTokens = uploadLogs.reduce((sum, log) => sum + log.total_tokens, 0);
        const uploadCost = uploadLogs.reduce((sum, log) => sum + parseFloat(log.estimated_cost), 0);
        const uploadRequests = uploadLogs.length;

        // Chat stats
        const chatTokens = chatLogs.reduce((sum, log) => sum + log.total_tokens, 0);
        const chatCost = chatLogs.reduce((sum, log) => sum + parseFloat(log.estimated_cost), 0);
        const chatRequests = chatLogs.length;

        setStats({
          totalTokens,
          totalCost,
          totalRequests,
          avgTokensPerRequest,
          uploadTokens,
          uploadCost,
          uploadRequests,
          chatTokens,
          chatCost,
          chatRequests,
        });

        // Group by date for daily usage
        const dailyMap = new Map<string, DailyUsage>();
        logs.forEach((log) => {
          const date = new Date(log.created_at).toISOString().split('T')[0];
          if (!dailyMap.has(date)) {
            dailyMap.set(date, { date, tokens: 0, cost: 0, requests: 0 });
          }
          const daily = dailyMap.get(date)!;
          daily.tokens += log.total_tokens;
          daily.cost += parseFloat(log.estimated_cost);
          daily.requests += 1;
        });

        setDailyUsage(Array.from(dailyMap.values()));

        // Group by subject for subject usage
        const subjectMap = new Map<string, SubjectUsage>();
        logs.forEach((log) => {
          const subjectName = log.exam_papers?.subjects?.name || 'Unknown';
          if (!subjectMap.has(subjectName)) {
            subjectMap.set(subjectName, { subject: subjectName, tokens: 0, cost: 0, requests: 0 });
          }
          const subject = subjectMap.get(subjectName)!;
          subject.tokens += log.total_tokens;
          subject.cost += parseFloat(log.estimated_cost);
          subject.requests += 1;
        });

        // Sort by cost descending
        const sortedSubjects = Array.from(subjectMap.values()).sort((a, b) => b.cost - a.cost);
        setSubjectUsage(sortedSubjects);

        // Group by category/source for category breakdown
        const categoryMap = new Map<string, { tokens: number; cost: number; requests: number }>();
        logs.forEach((log) => {
          // Determine source - use the source field if available, otherwise infer from user_id
          let source = log.source;
          if (!source) {
            source = log.user_id ? 'ai_assistant' : 'exam_paper_upload';
          }

          if (!categoryMap.has(source)) {
            categoryMap.set(source, { tokens: 0, cost: 0, requests: 0 });
          }
          const category = categoryMap.get(source)!;
          category.tokens += log.total_tokens;
          category.cost += parseFloat(log.estimated_cost);
          category.requests += 1;
        });

        // Define category metadata
        const categoryMeta: { [key: string]: { label: string; icon: any; color: string } } = {
          'syllabus_upload': { label: 'Syllabus Upload', icon: BookOpen, color: 'from-green-50 to-green-100 border-green-200' },
          'exam_paper_upload': { label: 'Exam Paper Upload', icon: FileText, color: 'from-blue-50 to-blue-100 border-blue-200' },
          'ai_assistant': { label: 'AI Assistant', icon: MessageCircle, color: 'from-purple-50 to-purple-100 border-purple-200' },
          'study_plan': { label: 'Study Plan', icon: ClipboardList, color: 'from-orange-50 to-orange-100 border-orange-200' },
        };

        // Build category usage array with all 4 categories
        const allCategories: CategoryUsage[] = ['syllabus_upload', 'exam_paper_upload', 'ai_assistant', 'study_plan'].map(source => {
          const data = categoryMap.get(source) || { tokens: 0, cost: 0, requests: 0 };
          const meta = categoryMeta[source];
          return {
            source,
            label: meta.label,
            tokens: data.tokens,
            cost: data.cost,
            requests: data.requests,
            icon: meta.icon,
            color: meta.color,
          };
        });

        setCategoryUsage(allCategories);
      } else {
        setStats({
          totalTokens: 0,
          totalCost: 0,
          totalRequests: 0,
          avgTokensPerRequest: 0,
          uploadTokens: 0,
          uploadCost: 0,
          uploadRequests: 0,
          chatTokens: 0,
          chatCost: 0,
          chatRequests: 0,
        });
        setDailyUsage([]);
        setSubjectUsage([]);
        setCategoryUsage([]);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading token usage analytics...</div>;
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6 gap-4">
        <div className="flex items-center space-x-3">
          <TrendingUp className="w-6 h-6 text-black" />
          <h2 className="text-xl lg:text-2xl font-semibold text-gray-900">Token Usage & Cost Analytics</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              timeRange === '7d'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeRange('30d')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              timeRange === '30d'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTimeRange('all')}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              timeRange === 'all'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Time
          </button>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={specificDate}
              onChange={(e) => {
                setSpecificDate(e.target.value);
                setTimeRange('specific');
              }}
              className={`px-3 py-2 border rounded-lg text-sm ${
                timeRange === 'specific'
                  ? 'border-black ring-1 ring-black'
                  : 'border-gray-300'
              }`}
            />
            {timeRange === 'specific' && (
              <span className="text-xs text-gray-500">
                {new Date(specificDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Total Cost</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatCost(stats.totalCost)}</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Total Tokens</span>
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.totalTokens)}</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Total Requests</span>
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.totalRequests)}</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Avg Tokens/Request</span>
            <Zap className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{formatNumber(stats.avgTokensPerRequest)}</p>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Usage by Category</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categoryUsage.map((category) => {
            const IconComponent = category.icon;
            const colorClasses = category.color.split(' ');
            const bgFrom = colorClasses[0];
            const bgTo = colorClasses[1];
            const borderColor = colorClasses[2];

            return (
              <div
                key={category.source}
                className={`bg-gradient-to-br ${bgFrom} ${bgTo} p-4 rounded-lg border ${borderColor}`}
              >
                <div className="flex items-center space-x-2 mb-3">
                  <IconComponent className="w-5 h-5 text-gray-700" />
                  <h4 className="text-sm font-semibold text-gray-900">{category.label}</h4>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Cost</span>
                    <span className="text-lg font-bold text-gray-900">{formatCost(category.cost)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Tokens</span>
                    <span className="text-sm font-semibold text-gray-900">{formatNumber(category.tokens)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Requests</span>
                    <span className="text-sm font-semibold text-gray-900">{formatNumber(category.requests)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subject Usage Bar Chart */}
      {subjectUsage.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 mb-6">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Usage by Subject</h3>
            </div>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {subjectUsage.map((subject, index) => {
                const maxCost = Math.max(...subjectUsage.map(s => s.cost));
                const widthPercentage = maxCost > 0 ? (subject.cost / maxCost) * 100 : 0;

                return (
                  <div key={subject.subject} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-900">{subject.subject}</span>
                      <div className="flex items-center space-x-4 text-xs text-gray-600">
                        <span>{formatNumber(subject.requests)} requests</span>
                        <span>{formatNumber(subject.tokens)} tokens</span>
                        <span className="font-semibold text-green-600">{formatCost(subject.cost)}</span>
                      </div>
                    </div>
                    <div className="relative w-full h-8 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500 flex items-center justify-end pr-3"
                        style={{ width: `${widthPercentage}%` }}
                      >
                        {widthPercentage > 15 && (
                          <span className="text-xs font-semibold text-white">
                            {Math.round(widthPercentage)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Daily Usage Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Daily Breakdown</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          {dailyUsage.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No usage data for the selected time range
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Total Tokens
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Avg Tokens
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {dailyUsage.map((day) => (
                  <tr key={day.date} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(day.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(day.requests)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(day.tokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {formatNumber(Math.round(day.tokens / day.requests))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 text-right">
                      {formatCost(day.cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
