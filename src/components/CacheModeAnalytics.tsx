import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, Server, TrendingDown, TrendingUp, RefreshCw, Zap, DollarSign, Activity, BarChart3 } from 'lucide-react';

interface CacheModeStats {
  mode: string;
  model: string;
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  followUpRequests: number;
  firstRequests: number;
  avgCostPerRequest: number;
  avgTokensPerRequest: number;
}

interface CacheEfficiency {
  cacheHits: number;
  totalCacheableRequests: number;
  hitRate: number;
}

export function CacheModeAnalytics() {
  const [loading, setLoading] = useState(true);
  const [legacyStats, setLegacyStats] = useState<CacheModeStats | null>(null);
  const [geminiCacheStats, setGeminiCacheStats] = useState<CacheModeStats | null>(null);
  const [cacheEfficiency, setCacheEfficiency] = useState<CacheEfficiency | null>(null);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | 'all'>('30d');

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Calculate date filter
      let startDate = new Date();
      if (dateRange === '7d') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (dateRange === '30d') {
        startDate.setDate(startDate.getDate() - 30);
      } else {
        startDate = new Date('2000-01-01'); // All time
      }

      // Fetch legacy cache stats (gemini-2.0-flash-exp)
      const { data: legacyData, error: legacyError } = await supabase
        .from('token_usage_logs')
        .select('*')
        .eq('model', 'gemini-2.0-flash-exp')
        .gte('created_at', startDate.toISOString());

      if (legacyError) throw legacyError;

      if (legacyData && legacyData.length > 0) {
        const totalCost = legacyData.reduce((sum, row) => sum + parseFloat(row.estimated_cost || 0), 0);
        const totalTokens = legacyData.reduce((sum, row) => sum + (row.total_tokens || 0), 0);
        const followUpCount = legacyData.filter(row => row.is_follow_up).length;

        setLegacyStats({
          mode: 'Own Database Cache',
          model: 'gemini-2.0-flash-exp',
          totalCost,
          totalTokens,
          totalRequests: legacyData.length,
          followUpRequests: followUpCount,
          firstRequests: legacyData.length - followUpCount,
          avgCostPerRequest: totalCost / legacyData.length,
          avgTokensPerRequest: totalTokens / legacyData.length
        });
      } else {
        setLegacyStats(null);
      }

      // Fetch Gemini cache stats (gemini-2.0-flash)
      const { data: geminiData, error: geminiError } = await supabase
        .from('token_usage_logs')
        .select('*')
        .eq('model', 'gemini-2.0-flash')
        .gte('created_at', startDate.toISOString());

      if (geminiError) throw geminiError;

      if (geminiData && geminiData.length > 0) {
        const totalCost = geminiData.reduce((sum, row) => sum + parseFloat(row.estimated_cost || 0), 0);
        const totalTokens = geminiData.reduce((sum, row) => sum + (row.total_tokens || 0), 0);
        const followUpCount = geminiData.filter(row => row.is_follow_up).length;

        setGeminiCacheStats({
          mode: 'Gemini Built-in Cache',
          model: 'gemini-2.0-flash',
          totalCost,
          totalTokens,
          totalRequests: geminiData.length,
          followUpRequests: followUpCount,
          firstRequests: geminiData.length - followUpCount,
          avgCostPerRequest: totalCost / geminiData.length,
          avgTokensPerRequest: totalTokens / geminiData.length
        });
      } else {
        setGeminiCacheStats(null);
      }

      // Fetch cache efficiency from gemini_cache_metadata
      const { data: cacheData, error: cacheError } = await supabase
        .from('gemini_cache_metadata')
        .select('use_count, created_at')
        .gte('created_at', startDate.toISOString());

      if (cacheError) {
        console.error('Error fetching cache efficiency:', cacheError);
      } else if (cacheData && cacheData.length > 0) {
        const totalCacheHits = cacheData.reduce((sum, row) => sum + (row.use_count || 0), 0);
        const totalCaches = cacheData.length;

        setCacheEfficiency({
          cacheHits: totalCacheHits,
          totalCacheableRequests: totalCaches,
          hitRate: totalCaches > 0 ? (totalCacheHits / (totalCacheHits + totalCaches)) * 100 : 0
        });
      }
    } catch (error) {
      console.error('Error fetching cache analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSavings = () => {
    if (!legacyStats || !geminiCacheStats) return null;

    // Calculate what Gemini cache mode would have cost with legacy pricing
    const estimatedLegacyCost = geminiCacheStats.totalRequests * legacyStats.avgCostPerRequest;
    const actualCost = geminiCacheStats.totalCost;
    const savings = estimatedLegacyCost - actualCost;
    const savingsPercentage = (savings / estimatedLegacyCost) * 100;

    return {
      estimatedLegacyCost,
      actualCost,
      savings,
      savingsPercentage
    };
  };

  const savings = calculateSavings();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Date Range Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Cache Mode Comparison</h3>
          <p className="text-sm text-gray-600">Compare costs and performance between cache modes</p>
        </div>
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-600">Period:</label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as '7d' | '30d' | 'all')}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {/* Savings Summary Card */}
      {savings && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-green-600 rounded-lg">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-green-900">Cost Savings with Gemini Cache</h4>
                <p className="text-sm text-green-700">Compared to legacy database cache mode</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <p className="text-xs text-gray-600 mb-1">Estimated Legacy Cost</p>
              <p className="text-2xl font-bold text-gray-900">${savings.estimatedLegacyCost.toFixed(4)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <p className="text-xs text-gray-600 mb-1">Actual Gemini Cache Cost</p>
              <p className="text-2xl font-bold text-green-700">${savings.actualCost.toFixed(4)}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200">
              <p className="text-xs text-gray-600 mb-1">Total Savings</p>
              <p className="text-2xl font-bold text-green-600">
                ${savings.savings.toFixed(4)}
                <span className="text-sm ml-2">({savings.savingsPercentage.toFixed(1)}%)</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cache Mode Stats Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Legacy Mode Stats */}
        {legacyStats && (
          <div className="border border-gray-200 rounded-lg p-6 bg-white">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Database className="w-5 h-5 text-gray-700" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-gray-900">{legacyStats.mode}</h4>
                <p className="text-xs text-gray-600">Model: {legacyStats.model}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Total Cost</span>
                </div>
                <span className="text-lg font-semibold text-gray-900">${legacyStats.totalCost.toFixed(4)}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Total Tokens</span>
                </div>
                <span className="text-lg font-semibold text-gray-900">{legacyStats.totalTokens.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Total Requests</span>
                </div>
                <span className="text-lg font-semibold text-gray-900">{legacyStats.totalRequests}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">First Questions</p>
                  <p className="text-xl font-bold text-gray-900">{legacyStats.firstRequests}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-600 mb-1">Follow-ups</p>
                  <p className="text-xl font-bold text-gray-900">{legacyStats.followUpRequests}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Avg Cost/Request</p>
                  <p className="text-sm font-medium text-gray-900">${legacyStats.avgCostPerRequest.toFixed(6)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Avg Tokens/Request</p>
                  <p className="text-sm font-medium text-gray-900">{Math.round(legacyStats.avgTokensPerRequest).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gemini Cache Mode Stats */}
        {geminiCacheStats && (
          <div className="border border-indigo-200 rounded-lg p-6 bg-indigo-50">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Server className="w-5 h-5 text-white" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-indigo-900">{geminiCacheStats.mode}</h4>
                <p className="text-xs text-indigo-700">Model: {geminiCacheStats.model}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-indigo-200">
                <div className="flex items-center space-x-2">
                  <DollarSign className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm text-indigo-800">Total Cost</span>
                </div>
                <span className="text-lg font-semibold text-indigo-900">${geminiCacheStats.totalCost.toFixed(4)}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-indigo-200">
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm text-indigo-800">Total Tokens</span>
                </div>
                <span className="text-lg font-semibold text-indigo-900">{geminiCacheStats.totalTokens.toLocaleString()}</span>
              </div>

              <div className="flex items-center justify-between py-2 border-b border-indigo-200">
                <div className="flex items-center space-x-2">
                  <Zap className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm text-indigo-800">Total Requests</span>
                </div>
                <span className="text-lg font-semibold text-indigo-900">{geminiCacheStats.totalRequests}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-white rounded-lg p-3 border border-indigo-200">
                  <p className="text-xs text-indigo-700 mb-1">First Questions</p>
                  <p className="text-xl font-bold text-indigo-900">{geminiCacheStats.firstRequests}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-indigo-200">
                  <p className="text-xs text-indigo-700 mb-1">Follow-ups</p>
                  <p className="text-xl font-bold text-indigo-900">{geminiCacheStats.followUpRequests}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-indigo-700">Avg Cost/Request</p>
                  <p className="text-sm font-medium text-indigo-900">${geminiCacheStats.avgCostPerRequest.toFixed(6)}</p>
                </div>
                <div>
                  <p className="text-xs text-indigo-700">Avg Tokens/Request</p>
                  <p className="text-sm font-medium text-indigo-900">{Math.round(geminiCacheStats.avgTokensPerRequest).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cache Efficiency Stats */}
      {cacheEfficiency && cacheEfficiency.totalCacheableRequests > 0 && (
        <div className="border border-purple-200 rounded-lg p-6 bg-purple-50">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-purple-600 rounded-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="text-lg font-semibold text-purple-900">Cache Efficiency</h4>
              <p className="text-xs text-purple-700">Gemini Built-in Cache Performance</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <p className="text-xs text-purple-700 mb-1">Caches Created</p>
              <p className="text-2xl font-bold text-purple-900">{cacheEfficiency.totalCacheableRequests}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <p className="text-xs text-purple-700 mb-1">Cache Reuses</p>
              <p className="text-2xl font-bold text-purple-900">{cacheEfficiency.cacheHits}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-purple-200">
              <p className="text-xs text-purple-700 mb-1">Cache Hit Rate</p>
              <p className="text-2xl font-bold text-purple-900">{cacheEfficiency.hitRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!legacyStats && !geminiCacheStats && (
        <div className="text-center py-12">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
          <p className="text-sm text-gray-500">
            No token usage data found for the selected period. Start using the AI assistant to see analytics.
          </p>
        </div>
      )}
    </div>
  );
}
