import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, CreditCard, TrendingUp, Filter, Search, RefreshCw, Edit2, Check, X } from 'lucide-react';

interface UserSubscription {
  id: string;
  user_id: string;
  status: string;
  papers_accessed_current_period: number;
  tokens_used_current_period: number;
  accessed_paper_ids: string[];
  start_date: string;
  end_date: string | null;
  created_at: string;
  profiles: {
    email: string;
  };
  subscription_tiers: {
    id: string;
    name: string;
    display_name: string;
    papers_limit: number | null;
    token_limit: number | null;
    price: number;
  };
}

interface SubscriptionTier {
  id: string;
  name: string;
  display_name: string;
  papers_limit: number | null;
  token_limit: number | null;
  price: number;
}

interface Stats {
  total_users: number;
  free_users: number;
  student_users: number;
  pro_users: number;
  total_revenue: number;
}

export function AdminSubscriptionManager() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [filteredSubscriptions, setFilteredSubscriptions] = useState<UserSubscription[]>([]);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_users: 0,
    free_users: 0,
    student_users: 0,
    pro_users: 0,
    total_revenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editTierId, setEditTierId] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchSubscriptions();
    fetchTiers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [subscriptions, filterTier, filterStatus, searchQuery]);

  const fetchTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('price_monthly', { ascending: true });

      if (error) throw error;
      setTiers(data || []);
    } catch (error) {
      console.error('Error fetching tiers:', error);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);

      // First get subscriptions with tier info
      const { data: subsData, error: subsError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_tiers!inner(id, name, display_name, papers_limit, token_limit, price_monthly)
        `)
        .order('created_at', { ascending: false });

      if (subsError) throw subsError;

      // Then get profile info for each subscription
      const userIds = subsData?.map(sub => sub.user_id) || [];
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Merge the data
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);
      const mergedData = subsData?.map(sub => ({
        ...sub,
        profiles: profilesMap.get(sub.user_id) || { email: 'Unknown' },
        subscription_tiers: {
          ...sub.subscription_tiers,
          price: sub.subscription_tiers.price_monthly
        }
      })) || [];

      setSubscriptions(mergedData);

      // Calculate stats
      const freeTier = mergedData.filter(s => s.subscription_tiers.name === 'free' && s.status === 'active');
      const studentTier = mergedData.filter(s => s.subscription_tiers.name === 'student' && s.status === 'active');
      const proTier = mergedData.filter(s => s.subscription_tiers.name === 'pro' && s.status === 'active');

      const revenue = [...studentTier, ...proTier].reduce((sum, sub) => sum + sub.subscription_tiers.price, 0);

      setStats({
        total_users: mergedData.length,
        free_users: freeTier.length,
        student_users: studentTier.length,
        pro_users: proTier.length,
        total_revenue: revenue,
      });
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...subscriptions];

    // Filter by tier
    if (filterTier !== 'all') {
      filtered = filtered.filter(sub => sub.subscription_tiers.name === filterTier);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(sub => sub.status === filterStatus);
    }

    // Search by email
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(sub =>
        sub.profiles.email.toLowerCase().includes(query)
      );
    }

    setFilteredSubscriptions(filtered);
  };

  const handleUpdateTier = async (userId: string) => {
    if (!editTierId) return;

    try {
      setUpdating(true);

      const { error } = await supabase
        .from('user_subscriptions')
        .update({ tier_id: editTierId })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      await fetchSubscriptions();
      setEditingUserId(null);
      setEditTierId('');
    } catch (error) {
      console.error('Error updating tier:', error);
      alert('Failed to update subscription tier');
    } finally {
      setUpdating(false);
    }
  };

  const handleResetUsage = async (userId: string) => {
    if (!confirm('Are you sure you want to reset this user\'s usage counters?')) return;

    try {
      const { error } = await supabase
        .from('user_subscriptions')
        .update({
          papers_accessed_current_period: 0,
          tokens_used_current_period: 0,
          accessed_paper_ids: []
        })
        .eq('user_id', userId)
        .eq('status', 'active');

      if (error) throw error;

      await fetchSubscriptions();
      alert('Usage counters reset successfully');
    } catch (error) {
      console.error('Error resetting usage:', error);
      alert('Failed to reset usage counters');
    }
  };

  const startEditing = (userId: string, currentTierId: string) => {
    setEditingUserId(userId);
    setEditTierId(currentTierId);
  };

  const cancelEditing = () => {
    setEditingUserId(null);
    setEditTierId('');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getTierBadgeColor = (tierName: string) => {
    switch (tierName) {
      case 'free': return 'bg-gray-100 text-gray-800';
      case 'student': return 'bg-blue-100 text-blue-800';
      case 'pro': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'expired': return 'bg-red-100 text-red-800';
      case 'cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.total_users}</p>
          <p className="text-xs sm:text-sm text-gray-600">Total Users</p>
        </div>

        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-5 h-5 text-gray-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.free_users}</p>
          <p className="text-xs sm:text-sm text-gray-600">Free Tier</p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.student_users}</p>
          <p className="text-xs sm:text-sm text-gray-600">Student</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <CreditCard className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.pro_users}</p>
          <p className="text-xs sm:text-sm text-gray-600">Pro</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900">${stats.total_revenue}</p>
          <p className="text-xs sm:text-sm text-gray-600">MRR</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="font-medium text-gray-900">Filters</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="sm:col-span-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          {/* Tier Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tier</label>
            <select
              value={filterTier}
              onChange={(e) => setFilterTier(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">All Tiers</option>
              <option value="free">Free</option>
              <option value="student">Student</option>
              <option value="pro">Pro</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Refresh Button */}
          <div className="flex items-end">
            <button
              onClick={fetchSubscriptions}
              className="w-full px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center justify-center space-x-2 text-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Showing <span className="font-medium">{filteredSubscriptions.length}</span> of{' '}
          <span className="font-medium">{subscriptions.length}</span> subscriptions
        </p>
      </div>

      {/* Subscriptions Table - Desktop */}
      <div className="hidden lg:block bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Papers Used
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tokens Used
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredSubscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {sub.profiles.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingUserId === sub.user_id ? (
                      <div className="flex items-center space-x-2">
                        <select
                          value={editTierId}
                          onChange={(e) => setEditTierId(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm"
                          disabled={updating}
                        >
                          {tiers.map(tier => (
                            <option key={tier.id} value={tier.id}>
                              {tier.display_name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleUpdateTier(sub.user_id)}
                          disabled={updating}
                          className="p-1 text-green-600 hover:text-green-700"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelEditing}
                          disabled={updating}
                          className="p-1 text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTierBadgeColor(sub.subscription_tiers.name)}`}>
                        {sub.subscription_tiers.display_name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeColor(sub.status)}`}>
                      {sub.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sub.papers_accessed_current_period}
                    {sub.subscription_tiers.papers_limit !== null && (
                      <span className="text-gray-500"> / {sub.subscription_tiers.papers_limit}</span>
                    )}
                    {sub.subscription_tiers.papers_limit === null && (
                      <span className="text-gray-500"> / ∞</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {sub.tokens_used_current_period.toLocaleString()}
                    {sub.subscription_tiers.token_limit !== null && (
                      <span className="text-gray-500"> / {sub.subscription_tiers.token_limit.toLocaleString()}</span>
                    )}
                    {sub.subscription_tiers.token_limit === null && (
                      <span className="text-gray-500"> / ∞</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(sub.start_date)} - {sub.end_date ? formatDate(sub.end_date) : 'Ongoing'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center space-x-2">
                      {editingUserId !== sub.user_id && (
                        <>
                          <button
                            onClick={() => startEditing(sub.user_id, sub.subscription_tiers.id)}
                            className="text-blue-600 hover:text-blue-700"
                            title="Change Tier"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleResetUsage(sub.user_id)}
                            className="text-gray-600 hover:text-gray-700"
                            title="Reset Usage"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscriptions Cards - Mobile & Tablet */}
      <div className="lg:hidden space-y-3">
        {filteredSubscriptions.map((sub) => (
          <div key={sub.id} className="bg-white rounded-lg border border-gray-200 p-4">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {sub.profiles.email}
                </h3>
              </div>
              <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getTierBadgeColor(sub.subscription_tiers.name)}`}>
                  {sub.subscription_tiers.display_name}
                </span>
                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(sub.status)}`}>
                  {sub.status}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Papers Used</p>
                <p className="text-sm font-semibold text-gray-900">
                  {sub.papers_accessed_current_period}
                  {sub.subscription_tiers.papers_limit !== null && (
                    <span className="text-gray-500"> / {sub.subscription_tiers.papers_limit}</span>
                  )}
                  {sub.subscription_tiers.papers_limit === null && (
                    <span className="text-gray-500"> / ∞</span>
                  )}
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Tokens Used</p>
                <p className="text-sm font-semibold text-gray-900">
                  {(sub.tokens_used_current_period / 1000).toFixed(1)}K
                  {sub.subscription_tiers.token_limit !== null && (
                    <span className="text-gray-500"> / {(sub.subscription_tiers.token_limit / 1000).toFixed(0)}K</span>
                  )}
                  {sub.subscription_tiers.token_limit === null && (
                    <span className="text-gray-500"> / ∞</span>
                  )}
                </p>
              </div>
            </div>

            {/* Period */}
            <div className="mb-3">
              <p className="text-xs text-gray-500">
                Period: {formatDate(sub.start_date)} - {sub.end_date ? formatDate(sub.end_date) : 'Ongoing'}
              </p>
            </div>

            {/* Edit Tier */}
            {editingUserId === sub.user_id ? (
              <div className="flex items-center space-x-2">
                <select
                  value={editTierId}
                  onChange={(e) => setEditTierId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  disabled={updating}
                >
                  {tiers.map(tier => (
                    <option key={tier.id} value={tier.id}>
                      {tier.display_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleUpdateTier(sub.user_id)}
                  disabled={updating}
                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={cancelEditing}
                  disabled={updating}
                  className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => startEditing(sub.user_id, sub.subscription_tiers.id)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center space-x-2 text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Change Tier</span>
                </button>
                <button
                  onClick={() => handleResetUsage(sub.user_id)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center"
                  title="Reset Usage"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredSubscriptions.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No subscriptions found matching your filters.</p>
        </div>
      )}
    </div>
  );
}
