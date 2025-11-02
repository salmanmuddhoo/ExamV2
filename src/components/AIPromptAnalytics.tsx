import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { MessageSquare, TrendingUp, DollarSign, ArrowUpDown, RefreshCw, Download } from 'lucide-react';

interface PromptUsage {
  prompt_type: string;
  prompt_name: string;
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost: number;
  avg_input_tokens: number;
  avg_output_tokens: number;
  avg_total_tokens: number;
  avg_cost: number;
}

interface TimeSeriesData {
  date: string;
  prompt_type: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
}

export function AIPromptAnalytics() {
  const [promptUsage, setPromptUsage] = useState<PromptUsage[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<TimeSeriesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | 'all'>('30d');
  const [sortBy, setSortBy] = useState<'requests' | 'tokens' | 'cost'>('requests');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    fetchPromptAnalytics();
  }, [timeRange]);

  const fetchPromptAnalytics = async () => {
    try {
      setLoading(true);

      // Calculate date filter
      let dateFilter = new Date();
      if (timeRange === '7d') {
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (timeRange === '30d') {
        dateFilter.setDate(dateFilter.getDate() - 30);
      } else {
        dateFilter = new Date('2000-01-01');
      }

      // Fetch token usage logs with AI prompt information
      const { data: logs, error } = await supabase
        .from('token_usage_logs')
        .select(`
          *,
          exam_papers (
            id,
            title,
            ai_prompts (
              id,
              name,
              system_prompt
            )
          )
        `)
        .gte('created_at', dateFilter.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (logs && logs.length > 0) {
        // Group by AI prompt
        const promptMap = new Map<string, PromptUsage>();

        logs.forEach((log: any) => {
          // Get prompt information from the related exam paper
          const aiPrompt = log.exam_papers?.ai_prompts;
          const promptName = aiPrompt?.name || 'Default System Prompt';
          const promptId = aiPrompt?.id || 'default';

          const key = promptId;
          const existing = promptMap.get(key);

          if (existing) {
            existing.total_requests += 1;
            existing.total_input_tokens += log.prompt_tokens;
            existing.total_output_tokens += log.completion_tokens;
            existing.total_tokens += log.total_tokens;
            existing.total_cost += parseFloat(log.estimated_cost);
          } else {
            promptMap.set(key, {
              prompt_type: aiPrompt ? 'custom' : 'default',
              prompt_name: promptName,
              total_requests: 1,
              total_input_tokens: log.prompt_tokens,
              total_output_tokens: log.completion_tokens,
              total_tokens: log.total_tokens,
              total_cost: parseFloat(log.estimated_cost),
              avg_input_tokens: 0,
              avg_output_tokens: 0,
              avg_total_tokens: 0,
              avg_cost: 0,
            });
          }
        });

        // Calculate averages
        const promptStats = Array.from(promptMap.values()).map(stat => ({
          ...stat,
          avg_input_tokens: Math.round(stat.total_input_tokens / stat.total_requests),
          avg_output_tokens: Math.round(stat.total_output_tokens / stat.total_requests),
          avg_total_tokens: Math.round(stat.total_tokens / stat.total_requests),
          avg_cost: stat.total_cost / stat.total_requests,
        }));

        setPromptUsage(promptStats);

        // Create time series data
        const dailyMap = new Map<string, Map<string, TimeSeriesData>>();

        logs.forEach((log: any) => {
          const date = new Date(log.created_at).toISOString().split('T')[0];
          const aiPrompt = log.exam_papers?.ai_prompts;
          const promptName = aiPrompt?.name || 'Default System Prompt';
          const promptId = aiPrompt?.id || 'default';
          const promptKey = promptId;

          if (!dailyMap.has(date)) {
            dailyMap.set(date, new Map());
          }

          const dayData = dailyMap.get(date)!;
          const existing = dayData.get(promptKey);

          if (existing) {
            existing.requests += 1;
            existing.input_tokens += log.prompt_tokens;
            existing.output_tokens += log.completion_tokens;
            existing.total_tokens += log.total_tokens;
            existing.cost += parseFloat(log.estimated_cost);
          } else {
            dayData.set(promptKey, {
              date,
              prompt_type: promptName,
              requests: 1,
              input_tokens: log.prompt_tokens,
              output_tokens: log.completion_tokens,
              total_tokens: log.total_tokens,
              cost: parseFloat(log.estimated_cost),
            });
          }
        });

        // Flatten time series data
        const timeSeries: TimeSeriesData[] = [];
        dailyMap.forEach((dayData) => {
          dayData.forEach(data => {
            timeSeries.push(data);
          });
        });

        setTimeSeriesData(timeSeries);
      } else {
        setPromptUsage([]);
        setTimeSeriesData([]);
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const getSortedData = () => {
    const sorted = [...promptUsage].sort((a, b) => {
      let aVal, bVal;
      switch (sortBy) {
        case 'requests':
          aVal = a.total_requests;
          bVal = b.total_requests;
          break;
        case 'tokens':
          aVal = a.total_tokens;
          bVal = b.total_tokens;
          break;
        case 'cost':
          aVal = a.total_cost;
          bVal = b.total_cost;
          break;
        default:
          aVal = a.total_requests;
          bVal = b.total_requests;
      }

      return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return sorted;
  };

  const toggleSort = (field: 'requests' | 'tokens' | 'cost') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getPromptTypeColor = (type: string) => {
    switch (type) {
      case 'custom': return 'bg-purple-100 text-purple-800';
      case 'default': return 'bg-gray-100 text-gray-800';
      default: return 'bg-blue-100 text-blue-800';
    }
  };

  const exportToCSV = () => {
    const headers = ['Prompt Type', 'Prompt Name', 'Total Requests', 'Total Input Tokens', 'Total Output Tokens', 'Total Tokens', 'Total Cost', 'Avg Input', 'Avg Output', 'Avg Total', 'Avg Cost'];
    const rows = promptUsage.map(p => [
      p.prompt_type,
      p.prompt_name,
      p.total_requests,
      p.total_input_tokens,
      p.total_output_tokens,
      p.total_tokens,
      p.total_cost.toFixed(4),
      p.avg_input_tokens,
      p.avg_output_tokens,
      p.avg_total_tokens,
      p.avg_cost.toFixed(4),
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-prompt-analytics-${timeRange}.csv`;
    a.click();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  const totals = promptUsage.reduce((acc, p) => ({
    requests: acc.requests + p.total_requests,
    inputTokens: acc.inputTokens + p.total_input_tokens,
    outputTokens: acc.outputTokens + p.total_output_tokens,
    totalTokens: acc.totalTokens + p.total_tokens,
    cost: acc.cost + p.total_cost,
  }), { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">AI Prompt Analytics</h2>
          <p className="text-sm text-gray-600 mt-1">Input and output token consumption by prompt type</p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as '7d' | '30d' | 'all')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={fetchPromptAnalytics}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center space-x-2 text-sm transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export Button */}
          <button
            onClick={exportToCSV}
            disabled={promptUsage.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center space-x-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{totals.requests.toLocaleString()}</p>
          <p className="text-xs text-gray-600">Total Requests</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{(totals.inputTokens / 1000).toFixed(1)}K</p>
          <p className="text-xs text-gray-600">Input Tokens</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{(totals.outputTokens / 1000).toFixed(1)}K</p>
          <p className="text-xs text-gray-600">Output Tokens</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-orange-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{(totals.totalTokens / 1000).toFixed(1)}K</p>
          <p className="text-xs text-gray-600">Total Tokens</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">${totals.cost.toFixed(2)}</p>
          <p className="text-xs text-gray-600">Total Cost</p>
        </div>
      </div>

      {/* Prompt Usage Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prompt
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('requests')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Requests</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Input Tokens
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Output Tokens
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('tokens')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Total Tokens</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleSort('cost')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Cost</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Averages
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {getSortedData().map((prompt, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{prompt.prompt_name}</div>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${getPromptTypeColor(prompt.prompt_type)}`}>
                        {prompt.prompt_type}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {prompt.total_requests.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{prompt.total_input_tokens.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Avg: {prompt.avg_input_tokens.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{prompt.total_output_tokens.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Avg: {prompt.avg_output_tokens.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{prompt.total_tokens.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Avg: {prompt.avg_total_tokens.toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">${prompt.total_cost.toFixed(4)}</div>
                    <div className="text-xs text-gray-500">Avg: ${prompt.avg_cost.toFixed(4)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="text-xs">
                      <div>In: {prompt.avg_input_tokens}</div>
                      <div>Out: {prompt.avg_output_tokens}</div>
                      <div className="font-medium">Total: {prompt.avg_total_tokens}</div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {promptUsage.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No prompt usage data available for the selected time range
          </div>
        )}
      </div>
    </div>
  );
}
