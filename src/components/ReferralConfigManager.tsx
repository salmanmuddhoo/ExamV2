import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Settings, Save, Loader2, Gift, DollarSign, Award } from 'lucide-react';

interface SubscriptionTier {
  id: string;
  name: string;
  display_name: string;
  referral_points_awarded: number | null;
  points_cost: number | null;
}

export function ReferralConfigManager() {
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editedTiers, setEditedTiers] = useState<Record<string, Partial<SubscriptionTier>>>({});

  useEffect(() => {
    fetchTiers();
  }, []);

  const fetchTiers = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('id, name, display_name, referral_points_awarded, points_cost')
        .order('name');

      if (error) throw error;

      setTiers(data || []);
    } catch (error) {
      console.error('Error fetching tiers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (tierId: string, field: 'referral_points_awarded' | 'points_cost', value: string) => {
    const numValue = value === '' ? null : parseInt(value);

    setEditedTiers(prev => ({
      ...prev,
      [tierId]: {
        ...prev[tierId],
        [field]: numValue
      }
    }));
  };

  const handleSave = async (tier: SubscriptionTier) => {
    const edits = editedTiers[tier.id];
    if (!edits || Object.keys(edits).length === 0) return;

    try {
      setSaving(tier.id);

      const { error } = await supabase
        .from('subscription_tiers')
        .update({
          referral_points_awarded: edits.referral_points_awarded ?? tier.referral_points_awarded,
          points_cost: edits.points_cost ?? tier.points_cost
        })
        .eq('id', tier.id);

      if (error) throw error;

      // Update local state
      setTiers(prev =>
        prev.map(t =>
          t.id === tier.id
            ? {
                ...t,
                referral_points_awarded: edits.referral_points_awarded ?? t.referral_points_awarded,
                points_cost: edits.points_cost ?? t.points_cost
              }
            : t
        )
      );

      // Clear edits for this tier
      setEditedTiers(prev => {
        const newEdits = { ...prev };
        delete newEdits[tier.id];
        return newEdits;
      });
    } catch (error) {
      console.error('Error saving tier:', error);
      alert('Failed to save changes. Please try again.');
    } finally {
      setSaving(null);
    }
  };

  const getDisplayValue = (tier: SubscriptionTier, field: 'referral_points_awarded' | 'points_cost'): string => {
    const edited = editedTiers[tier.id]?.[field];
    if (edited !== undefined) {
      return edited === null ? '' : edited.toString();
    }
    const original = tier[field];
    return original === null ? '' : original.toString();
  };

  const hasChanges = (tierId: string): boolean => {
    return editedTiers[tierId] && Object.keys(editedTiers[tierId]).length > 0;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Gift className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Referral System Configuration</h1>
        </div>
        <p className="text-gray-600">Configure referral points awarded and redemption costs for each subscription tier</p>
      </div>

      {/* Configuration Cards */}
      <div className="grid grid-cols-1 gap-6">
        {tiers.map(tier => (
          <div
            key={tier.id}
            className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:border-gray-300 transition-colors"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{tier.display_name}</h2>
                <p className="text-sm text-gray-500 mt-1">Tier: {tier.name}</p>
              </div>

              {hasChanges(tier.id) && (
                <button
                  onClick={() => handleSave(tier)}
                  disabled={saving === tier.id}
                  className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving === tier.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Points Awarded */}
              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                  <Award className="w-4 h-4 text-green-600" />
                  <span>Points Awarded to Referrer</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={getDisplayValue(tier, 'referral_points_awarded')}
                  onChange={(e) => handleFieldChange(tier.id, 'referral_points_awarded', e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <p className="text-xs text-gray-500">
                  Points given to referrer when someone purchases this tier
                </p>
                {tier.name === 'free' && (
                  <p className="text-xs text-yellow-600 font-medium">
                    Note: Free tier purchases don't award points to referrers
                  </p>
                )}
              </div>

              {/* Points Cost */}
              <div className="space-y-2">
                <label className="flex items-center space-x-2 text-sm font-medium text-gray-700">
                  <DollarSign className="w-4 h-4 text-blue-600" />
                  <span>Points Cost to Purchase</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={getDisplayValue(tier, 'points_cost')}
                  onChange={(e) => handleFieldChange(tier.id, 'points_cost', e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
                />
                <p className="text-xs text-gray-500">
                  Points required to redeem this tier subscription
                </p>
                {tier.name === 'free' && (
                  <p className="text-xs text-yellow-600 font-medium">
                    Note: Set to 0 to prevent redemption with points
                  </p>
                )}
              </div>
            </div>

            {/* Info Box */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Current Referral Bonus:</span>
                  <span className="ml-2 font-bold text-green-600">
                    +{tier.referral_points_awarded ?? 0} points
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Current Redemption Cost:</span>
                  <span className="ml-2 font-bold text-blue-600">
                    {tier.points_cost ?? 0} points
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Panel */}
      <div className="mt-8 bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
        <div className="flex items-start space-x-3">
          <Settings className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-bold text-gray-900 mb-2">How Referral Points Work</h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li>• <strong>Points Awarded:</strong> When a new user signs up using a referral code and purchases a paid subscription, the referrer earns the configured points for that tier.</li>
              <li>• <strong>Points Cost:</strong> Users can redeem their accumulated points to purchase subscription tiers. Set to 0 to disable redemption for a tier.</li>
              <li>• <strong>Free Tier:</strong> Free tier purchases do not award points to referrers (typically set to 0).</li>
              <li>• Points are only awarded once per referral when they make their first paid purchase.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Recommended Values */}
      <div className="mt-6 bg-green-50 border-2 border-green-200 rounded-lg p-6">
        <h3 className="font-bold text-gray-900 mb-3 flex items-center space-x-2">
          <Award className="w-5 h-5 text-green-600" />
          <span>Recommended Configuration</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-700 mb-2">Referral Points Awarded:</p>
            <ul className="space-y-1 text-gray-600">
              <li>• Free: 0 points</li>
              <li>• Student Lite: 50-100 points</li>
              <li>• Student: 100-150 points</li>
              <li>• Pro: 200-300 points</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-700 mb-2">Points Redemption Cost:</p>
            <ul className="space-y-1 text-gray-600">
              <li>• Free: 0 points (not redeemable)</li>
              <li>• Student Lite: 250-500 points</li>
              <li>• Student: 500-750 points</li>
              <li>• Pro: 1000-1500 points</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
