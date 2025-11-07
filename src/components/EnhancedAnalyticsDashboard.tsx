import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  TrendingUp,
  DollarSign,
  Zap,
  Calendar,
  BarChart3,
  Upload,
  MessageCircle,
  Cpu,
  Users as UsersIcon,
  FileText,
  BookMarked,
  Activity,
} from 'lucide-react';

interface TokenStats {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  avgTokensPerRequest: number;
  avgCostPerRequest: number;

  // Upload breakdown
  examPaperUploadCost: number;
  examPaperUploadTokens: number;
  examPaperUploadCount: number;
  syllabusUploadCost: number;
  syllabusUploadTokens: number;
  syllabusUploadCount: number;

  // Chat stats
  chatCost: number;
  chatTokens: number;
  chatRequests: number;

  // Study plan stats
  studyPlanCost: number;
  studyPlanTokens: number;
  studyPlanCount: number;
}

interface AIModelUsage {
  modelId: string;
  modelName: string;
  displayName: string;
  provider: string;
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  avgCostPerRequest: number;
  inputTokens: number;
  outputTokens: number;
}

interface UserAverages {
  totalUsers: number;
  avgCostPerUser: number;
  avgTokensPerUser: number;
  avgRequestsPerUser: number;
}

interface AIPromptAverage {
  promptId: string;
  promptName: string;
  totalRequests: number;
  avgCost: number;
  avgTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

export function EnhancedAnalyticsDashboard() {
  const [stats, setStats] = useState<TokenStats | null>(null);
  const [modelUsage, setModelUsage] = useState<AIModelUsage[]>([]);
  const [userAverages, setUserAverages] = useState<UserAverages | null>(null);
  const [promptAverages, setPromptAverages] = useState<AIPromptAverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Calculate date filter
      let dateFilter = new Date();
      if (timeRange === '7d') {
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (timeRange === '30d') {
        dateFilter.setDate(dateFilter.getDate() - 30);
      } else {
        dateFilter = new Date('2000-01-01'); // All time
      }

      // Fetch all token usage logs with relationships
      const { data: logs, error } = await supabase
        .from('token_usage_logs')
        .select(`
          *,
          ai_models (
            id,
            model_name,
            display_name,
            provider
          ),
          exam_papers (
            title
          )
        `)
        .gte('created_at', dateFilter.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (logs && logs.length > 0) {
        // === OVERALL STATS ===
        const totalCost = logs.reduce((sum, log) => sum + parseFloat(log.estimated_cost || 0), 0);
        const totalTokens = logs.reduce((sum, log) => sum + (log.total_tokens || 0), 0);
        const totalRequests = logs.length;
        const avgTokensPerRequest = Math.round(totalTokens / totalRequests);
        const avgCostPerRequest = totalCost / totalRequests;

        // === UPLOAD BREAKDOWN ===
        // Exam paper uploads (user_id is null and has exam_paper_id)
        const examPaperUploads = logs.filter(
          (log) => !log.user_id && log.exam_paper_id
        );
        const examPaperUploadCost = examPaperUploads.reduce(
          (sum, log) => sum + parseFloat(log.estimated_cost || 0),
          0
        );
        const examPaperUploadTokens = examPaperUploads.reduce(
          (sum, log) => sum + (log.total_tokens || 0),
          0
        );
        const examPaperUploadCount = examPaperUploads.length;

        // Syllabus uploads (user_id is null, no exam_paper_id - these are other processing tasks)
        const syllabusUploads = logs.filter(
          (log) => !log.user_id && !log.exam_paper_id
        );
        const syllabusUploadCost = syllabusUploads.reduce(
          (sum, log) => sum + parseFloat(log.estimated_cost || 0),
          0
        );
        const syllabusUploadTokens = syllabusUploads.reduce(
          (sum, log) => sum + (log.total_tokens || 0),
          0
        );
        const syllabusUploadCount = syllabusUploads.length;

        // === CHAT STATS ===
        // Chats have user_id and exam_paper_id
        const chatLogs = logs.filter((log) => log.user_id && log.exam_paper_id);
        const chatCost = chatLogs.reduce((sum, log) => sum + parseFloat(log.estimated_cost || 0), 0);
        const chatTokens = chatLogs.reduce((sum, log) => sum + (log.total_tokens || 0), 0);
        const chatRequests = chatLogs.length;

        // === STUDY PLAN STATS ===
        // Study plans have user_id but no exam_paper_id
        const studyPlanLogs = logs.filter((log) => log.user_id && !log.exam_paper_id);
        const studyPlanCost = studyPlanLogs.reduce((sum, log) => sum + parseFloat(log.estimated_cost || 0), 0);
        const studyPlanTokens = studyPlanLogs.reduce((sum, log) => sum + (log.total_tokens || 0), 0);
        const studyPlanCount = studyPlanLogs.length;

        setStats({
          totalCost,
          totalTokens,
          totalRequests,
          avgTokensPerRequest,
          avgCostPerRequest,
          examPaperUploadCost,
          examPaperUploadTokens,
          examPaperUploadCount,
          syllabusUploadCost,
          syllabusUploadTokens,
          syllabusUploadCount,
          chatCost,
          chatTokens,
          chatRequests,
          studyPlanCost,
          studyPlanTokens,
          studyPlanCount,
        });

        // === AI MODEL BREAKDOWN ===
        const modelMap = new Map<string, AIModelUsage>();
        logs.forEach((log) => {
          const modelKey = log.ai_model_id || 'unknown';
          if (!modelMap.has(modelKey)) {
            modelMap.set(modelKey, {
              modelId: modelKey,
              modelName: log.ai_models?.model_name || log.model || 'Unknown',
              displayName: log.ai_models?.display_name || log.model || 'Unknown',
              provider: log.ai_models?.provider || log.provider || 'unknown',
              totalCost: 0,
              totalTokens: 0,
              totalRequests: 0,
              avgCostPerRequest: 0,
              inputTokens: 0,
              outputTokens: 0,
            });
          }
          const model = modelMap.get(modelKey)!;
          model.totalCost += parseFloat(log.estimated_cost || 0);
          model.totalTokens += log.total_tokens || 0;
          model.totalRequests += 1;
          model.inputTokens += log.prompt_tokens || 0;
          model.outputTokens += log.completion_tokens || 0;
        });

        // Calculate averages and sort by cost
        const modelUsageArray = Array.from(modelMap.values())
          .map((model) => ({
            ...model,
            avgCostPerRequest: model.totalRequests > 0 ? model.totalCost / model.totalRequests : 0,
          }))
          .sort((a, b) => b.totalCost - a.totalCost);

        setModelUsage(modelUsageArray);

        // === USER AVERAGES ===
        const uniqueUsers = new Set(logs.filter((log) => log.user_id).map((log) => log.user_id));
        const totalUsers = uniqueUsers.size;

        if (totalUsers > 0) {
          const userMap = new Map<string, { cost: number; tokens: number; requests: number }>();
          logs
            .filter((log) => log.user_id)
            .forEach((log) => {
              if (!userMap.has(log.user_id!)) {
                userMap.set(log.user_id!, { cost: 0, tokens: 0, requests: 0 });
              }
              const user = userMap.get(log.user_id!)!;
              user.cost += parseFloat(log.estimated_cost || 0);
              user.tokens += log.total_tokens || 0;
              user.requests += 1;
            });

          const totalUserCost = Array.from(userMap.values()).reduce((sum, u) => sum + u.cost, 0);
          const totalUserTokens = Array.from(userMap.values()).reduce((sum, u) => sum + u.tokens, 0);
          const totalUserRequests = Array.from(userMap.values()).reduce((sum, u) => sum + u.requests, 0);

          setUserAverages({
            totalUsers,
            avgCostPerUser: totalUserCost / totalUsers,
            avgTokensPerUser: Math.round(totalUserTokens / totalUsers),
            avgRequestsPerUser: Math.round(totalUserRequests / totalUsers),
          });
        } else {
          setUserAverages({
            totalUsers: 0,
            avgCostPerUser: 0,
            avgTokensPerUser: 0,
            avgRequestsPerUser: 0,
          });
        }

        // === PROMPT AVERAGES ===
        // Note: ai_prompt_id is not tracked in token_usage_logs table yet
        // This section will remain empty until we add that column
        setPromptAverages([]);

      } else {
        // No data
        setStats(null);
        setModelUsage([]);
        setUserAverages(null);
        setPromptAverages([]);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
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
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <Activity className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
        <p className="text-sm text-gray-500">No token usage data for the selected time range</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Platform Analytics</h2>
          <p className="text-sm text-gray-600 mt-1">
            Comprehensive cost and usage analytics across all AI models
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setTimeRange('7d')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              timeRange === '7d'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            7 Days
          </button>
          <button
            onClick={() => setTimeRange('30d')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              timeRange === '30d'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            30 Days
          </button>
          <button
            onClick={() => setTimeRange('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              timeRange === 'all'
                ? 'bg-black text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Time
          </button>
        </div>
      </div>

      {/* Overall Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-green-700">Total Cost</span>
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-900">{formatCost(stats.totalCost)}</p>
          <p className="text-xs text-green-600 mt-1">
            {formatCost(stats.avgCostPerRequest)} avg/request
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-700">Total Tokens</span>
            <Zap className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-blue-900">{formatNumber(stats.totalTokens)}</p>
          <p className="text-xs text-blue-600 mt-1">
            {formatNumber(stats.avgTokensPerRequest)} avg/request
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-purple-700">Total Requests</span>
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-900">{formatNumber(stats.totalRequests)}</p>
          <p className="text-xs text-purple-600 mt-1">All API calls combined</p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-lg border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-orange-700">Active Users</span>
            <UsersIcon className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-orange-900">{formatNumber(userAverages?.totalUsers || 0)}</p>
          <p className="text-xs text-orange-600 mt-1">
            {formatCost(userAverages?.avgCostPerUser || 0)} avg/user
          </p>
        </div>
      </div>

      {/* Upload Breakdown */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Upload className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Upload Processing Costs</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">AI processing costs for content uploads</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-2 mb-3">
                <FileText className="w-4 h-4 text-blue-700" />
                <span className="text-sm font-semibold text-blue-900">Exam Papers</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-blue-700">Cost</span>
                  <span className="text-sm font-bold text-blue-900">{formatCost(stats.examPaperUploadCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-blue-700">Tokens</span>
                  <span className="text-sm font-semibold text-blue-900">{formatNumber(stats.examPaperUploadTokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-blue-700">Uploads</span>
                  <span className="text-sm font-semibold text-blue-900">{formatNumber(stats.examPaperUploadCount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg border border-purple-200">
              <div className="flex items-center space-x-2 mb-3">
                <BookMarked className="w-4 h-4 text-purple-700" />
                <span className="text-sm font-semibold text-purple-900">Syllabus</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-purple-700">Cost</span>
                  <span className="text-sm font-bold text-purple-900">{formatCost(stats.syllabusUploadCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-purple-700">Tokens</span>
                  <span className="text-sm font-semibold text-purple-900">{formatNumber(stats.syllabusUploadTokens)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-purple-700">Uploads</span>
                  <span className="text-sm font-semibold text-purple-900">{formatNumber(stats.syllabusUploadCount)}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-lg border border-gray-200">
              <div className="flex items-center space-x-2 mb-3">
                <Upload className="w-4 h-4 text-gray-700" />
                <span className="text-sm font-semibold text-gray-900">Total Uploads</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Cost</span>
                  <span className="text-sm font-bold text-gray-900">
                    {formatCost(stats.examPaperUploadCost + stats.syllabusUploadCost)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Tokens</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatNumber(stats.examPaperUploadTokens + stats.syllabusUploadTokens)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-700">Count</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {formatNumber(stats.examPaperUploadCount + stats.syllabusUploadCount)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Type Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-6 rounded-lg border border-indigo-200">
          <div className="flex items-center space-x-2 mb-4">
            <MessageCircle className="w-5 h-5 text-indigo-700" />
            <h3 className="text-lg font-semibold text-indigo-900">Student Chats</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-indigo-700">Cost</span>
              <span className="text-xl font-bold text-indigo-900">{formatCost(stats.chatCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-indigo-700">Tokens</span>
              <span className="text-lg font-semibold text-indigo-900">{formatNumber(stats.chatTokens)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-indigo-700">Messages</span>
              <span className="text-lg font-semibold text-indigo-900">{formatNumber(stats.chatRequests)}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-6 rounded-lg border border-teal-200">
          <div className="flex items-center space-x-2 mb-4">
            <Calendar className="w-5 h-5 text-teal-700" />
            <h3 className="text-lg font-semibold text-teal-900">Study Plans</h3>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-teal-700">Cost</span>
              <span className="text-xl font-bold text-teal-900">{formatCost(stats.studyPlanCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-teal-700">Tokens</span>
              <span className="text-lg font-semibold text-teal-900">{formatNumber(stats.studyPlanTokens)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-teal-700">Generated</span>
              <span className="text-lg font-semibold text-teal-900">{formatNumber(stats.studyPlanCount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Model Breakdown */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Cost by AI Model</h3>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Breakdown by model to help you decide which models to refill
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Model
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Requests
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Input Tokens
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Output Tokens
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Total Cost
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Avg Cost/Req
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {modelUsage.map((model) => (
                <tr key={model.modelId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{model.displayName}</div>
                      <div className="text-xs text-gray-500">{model.provider}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(model.totalRequests)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(model.inputTokens)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {formatNumber(model.outputTokens)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600 text-right">
                    {formatCost(model.totalCost)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                    {formatCost(model.avgCostPerRequest)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* User Averages */}
      {userAverages && userAverages.totalUsers > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <UsersIcon className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Average Per User</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">Based on {formatNumber(userAverages.totalUsers)} active users</p>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Avg Cost/User</p>
                <p className="text-2xl font-bold text-green-600">{formatCost(userAverages.avgCostPerUser)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Avg Tokens/User</p>
                <p className="text-2xl font-bold text-blue-600">{formatNumber(userAverages.avgTokensPerUser)}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-1">Avg Requests/User</p>
                <p className="text-2xl font-bold text-purple-600">{formatNumber(userAverages.avgRequestsPerUser)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prompt Averages */}
      {promptAverages.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center space-x-2">
              <MessageCircle className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg font-semibold text-gray-900">Average Per AI Prompt</h3>
            </div>
            <p className="text-xs text-gray-500 mt-1">Performance metrics for each AI prompt configuration</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Prompt Name
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Requests
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Avg Input
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Avg Output
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Avg Total
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Avg Cost
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {promptAverages.map((prompt) => (
                  <tr key={prompt.promptId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {prompt.promptName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(prompt.totalRequests)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {formatNumber(prompt.avgInputTokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">
                      {formatNumber(prompt.avgOutputTokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                      {formatNumber(prompt.avgTokens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-green-600 text-right">
                      {formatCost(prompt.avgCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
