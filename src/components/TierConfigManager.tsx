import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Save, RefreshCw, AlertCircle, CheckCircle, DollarSign, Hash, FileText } from 'lucide-react';

interface TierConfig {
  id: string;
  name: string;
  display_name: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  token_limit: number | null;
  papers_limit: number | null;
  can_select_grade: boolean;
  can_select_subjects: boolean;
  max_subjects: number | null;
  chapter_wise_access: boolean;
  is_active: boolean;
  coming_soon: boolean;
  display_order: number;
}

export function TierConfigManager() {
  const [tiers, setTiers] = useState<TierConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchTiers();
  }, []);

  const fetchTiers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setTiers(data || []);
    } catch (error) {
      console.error('Error fetching tiers:', error);
      showMessage('error', 'Failed to load tier configurations');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUpdateTier = async (tierId: string, updates: Partial<TierConfig>) => {
    try {
      setSaving(tierId);

      const { error } = await supabase
        .from('subscription_tiers')
        .update(updates)
        .eq('id', tierId);

      if (error) throw error;

      setTiers(prev => prev.map(tier =>
        tier.id === tierId ? { ...tier, ...updates } : tier
      ));

      showMessage('success', 'Configuration updated successfully');
    } catch (error) {
      console.error('Error updating tier:', error);
      showMessage('error', 'Failed to update configuration');
    } finally {
      setSaving(null);
    }
  };

  const handleFieldChange = (tierId: string, field: keyof TierConfig, value: any) => {
    setTiers(prev => prev.map(tier =>
      tier.id === tierId ? { ...tier, [field]: value } : tier
    ));
  };

  const getTierIcon = (tierName: string) => {
    switch (tierName) {
      case 'free': return '🆓';
      case 'student': return '🎓';
      case 'pro': return '⭐';
      default: return '📦';
    }
  };

  const getTierColor = (tierName: string) => {
    switch (tierName) {
      case 'free': return 'from-gray-500 to-gray-600';
      case 'student': return 'from-blue-500 to-blue-600';
      case 'pro': return 'from-purple-500 to-purple-600';
      default: return 'from-gray-500 to-gray-600';
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Settings className="w-6 h-6 text-gray-700" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Subscription Tier Configuration</h2>
            <p className="text-sm text-gray-600">Configure pricing, limits, and features for each tier</p>
          </div>
        </div>
        <button
          onClick={fetchTiers}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg flex items-center space-x-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className={`p-4 rounded-lg flex items-center space-x-3 ${
          message.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span className="font-medium">{message.text}</span>
        </div>
      )}

      {/* Tier Configuration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {tiers.map((tier) => (
          <div key={tier.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            {/* Card Header */}
            <div className={`bg-gradient-to-r ${getTierColor(tier.name)} p-6 text-white`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-4xl">{getTierIcon(tier.name)}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  tier.is_active ? 'bg-green-500' : 'bg-red-500'
                }`}>
                  {tier.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <h3 className="text-2xl font-bold">{tier.display_name}</h3>
              <p className="text-sm opacity-90 mt-1">{tier.name.toUpperCase()}</p>
            </div>

            {/* Card Body */}
            <div className="p-6 space-y-5">
              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={tier.description || ''}
                  onChange={(e) => handleFieldChange(tier.id, 'description', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                  rows={2}
                />
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2 flex items-center">
                    <DollarSign className="w-3 h-3 mr-1" />
                    Monthly
                  </label>
                  <input
                    type="number"
                    value={tier.price_monthly}
                    onChange={(e) => handleFieldChange(tier.id, 'price_monthly', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2 flex items-center">
                    <DollarSign className="w-3 h-3 mr-1" />
                    Yearly
                  </label>
                  <input
                    type="number"
                    value={tier.price_yearly}
                    onChange={(e) => handleFieldChange(tier.id, 'price_yearly', parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              {/* Token Limit */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2 flex items-center">
                  <Hash className="w-3 h-3 mr-1" />
                  Token Limit (per month)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={tier.token_limit || ''}
                    onChange={(e) => handleFieldChange(tier.id, 'token_limit', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Unlimited"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    min="0"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {tier.token_limit ? `${(tier.token_limit / 1000).toFixed(0)}K` : '∞'}
                  </span>
                </div>
              </div>

              {/* Papers Limit */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2 flex items-center">
                  <FileText className="w-3 h-3 mr-1" />
                  Papers Limit (with AI chat)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    value={tier.papers_limit || ''}
                    onChange={(e) => handleFieldChange(tier.id, 'papers_limit', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Unlimited"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    min="0"
                  />
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {tier.papers_limit || '∞'}
                  </span>
                </div>
              </div>

              {/* Subject Selection */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Can Select Grade</label>
                  <button
                    onClick={() => handleFieldChange(tier.id, 'can_select_grade', !tier.can_select_grade)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      tier.can_select_grade ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        tier.can_select_grade ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-700">Can Select Subjects</label>
                  <button
                    onClick={() => handleFieldChange(tier.id, 'can_select_subjects', !tier.can_select_subjects)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      tier.can_select_subjects ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        tier.can_select_subjects ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {tier.can_select_subjects && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-2">Max Subjects</label>
                    <input
                      type="number"
                      value={tier.max_subjects || ''}
                      onChange={(e) => handleFieldChange(tier.id, 'max_subjects', e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="Unlimited"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      min="1"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <label className="text-xs font-medium text-gray-700">Chapter-wise Access</label>
                  <button
                    onClick={() => handleFieldChange(tier.id, 'chapter_wise_access', !tier.chapter_wise_access)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      tier.chapter_wise_access ? 'bg-green-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        tier.chapter_wise_access ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {tier.chapter_wise_access ? 'Users can practice chapter-wise questions' : 'Only yearly exam papers allowed'}
                </p>
              </div>

              {/* Active Status */}
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <label className="text-xs font-medium text-gray-700">Active Status</label>
                <button
                  onClick={() => handleFieldChange(tier.id, 'is_active', !tier.is_active)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    tier.is_active ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      tier.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Coming Soon Status */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-medium text-gray-700">Coming Soon</label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tier.coming_soon ? 'Users cannot purchase this package' : 'Available for purchase'}
                  </p>
                </div>
                <button
                  onClick={() => handleFieldChange(tier.id, 'coming_soon', !tier.coming_soon)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    tier.coming_soon ? 'bg-amber-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      tier.coming_soon ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Save Button */}
              <button
                onClick={() => handleUpdateTier(tier.id, tier)}
                disabled={saving === tier.id}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving === tier.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Feature Comparison Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Feature Comparison</h3>
          <p className="text-sm text-gray-600 mt-1">Quick overview of tier features and limits</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Feature
                </th>
                {tiers.map(tier => (
                  <th key={tier.id} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {tier.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Monthly Price</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900">
                    ${tier.price_monthly}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Token Limit</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900">
                    {tier.token_limit ? `${(tier.token_limit / 1000).toFixed(0)}K` : '∞'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Papers with AI Chat</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-900">
                    {tier.papers_limit || '∞'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Grade Selection</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    {tier.can_select_grade ? (
                      <span className="text-green-600 font-semibold">✓</span>
                    ) : (
                      <span className="text-red-600 font-semibold">✗</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Subject Selection</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    {tier.can_select_subjects ? (
                      <span className="text-gray-900">
                        {tier.max_subjects ? `Max ${tier.max_subjects}` : '∞'}
                      </span>
                    ) : (
                      <span className="text-red-600 font-semibold">✗</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr className="bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Chapter-wise Access</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    {tier.chapter_wise_access ? (
                      <span className="text-green-600 font-semibold">✓ Enabled</span>
                    ) : (
                      <span className="text-amber-600 font-semibold">Yearly Only</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Status</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      tier.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {tier.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                ))}
              </tr>
              <tr className="bg-amber-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">Availability</td>
                {tiers.map(tier => (
                  <td key={tier.id} className="px-6 py-4 whitespace-nowrap text-sm text-center">
                    {tier.coming_soon ? (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        Coming Soon
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Available
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
