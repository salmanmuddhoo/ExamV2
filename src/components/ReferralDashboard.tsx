import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { StudentPackageSelector } from './StudentPackageSelector';
import { Modal } from './Modal';
import {
  Gift,
  Copy,
  Check,
  Users,
  TrendingUp,
  Award,
  Share2,
  ExternalLink,
  Loader2,
  Star
} from 'lucide-react';

interface ReferralStats {
  code: string;
  pointsBalance: number;
  totalEarned: number;
  totalSpent: number;
  totalReferrals: number;
  successfulReferrals: number;
}

interface ReferralTransaction {
  id: string;
  transaction_type: string;
  points: number;
  description: string;
  created_at: string;
}

interface SubscriptionTier {
  id: string;
  name: string;
  display_name: string;
  points_cost: number;
  referral_points_awarded: number;
  max_subjects: number | null;
}

interface ReferrerInfo {
  firstName: string;
  lastName: string;
  email: string;
}

export function ReferralDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [transactions, setTransactions] = useState<ReferralTransaction[]>([]);
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showRedeemModal, setShowRedeemModal] = useState(false);
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [showPackageSelector, setShowPackageSelector] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [referrerInfo, setReferrerInfo] = useState<ReferrerInfo | null>(null);

  useEffect(() => {
    if (user) {
      fetchReferralData();
    }
  }, [user]);

  const fetchReferralData = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Fetch referral code and points
      const [codeRes, pointsRes, transactionsRes, tiersRes] = await Promise.all([
        supabase
          .from('referral_codes')
          .select('code')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('user_referral_points')
          .select('*')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('referral_transactions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('subscription_tiers')
          .select('id, name, display_name, points_cost, referral_points_awarded, max_subjects')
          .gt('points_cost', 0)
          .order('points_cost', { ascending: true })
      ]);

      if (codeRes.data && pointsRes.data) {
        setStats({
          code: codeRes.data.code,
          pointsBalance: pointsRes.data.points_balance,
          totalEarned: pointsRes.data.total_earned,
          totalSpent: pointsRes.data.total_spent,
          totalReferrals: pointsRes.data.total_referrals,
          successfulReferrals: pointsRes.data.successful_referrals
        });
      }

      setTransactions(transactionsRes.data || []);
      setTiers(tiersRes.data || []);

      // Check if user was referred by someone - use two separate queries
      const { data: referralData } = await supabase
        .from('referrals')
        .select('referrer_id')
        .eq('referred_id', user.id)
        .single();

      if (referralData && referralData.referrer_id) {
        // Fetch referrer profile separately
        const { data: referrerProfile } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .eq('id', referralData.referrer_id)
          .single();

        if (referrerProfile) {
          setReferrerInfo({
            firstName: referrerProfile.first_name,
            lastName: referrerProfile.last_name,
            email: referrerProfile.email
          });
        }
      }
    } catch (error) {
      console.error('Error fetching referral data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getReferralLink = () => {
    if (!stats) return '';
    const baseUrl = window.location.origin;
    return `${baseUrl}/login?ref=${stats.code}`;
  };

  const copyReferralLink = async () => {
    try {
      await navigator.clipboard.writeText(getReferralLink());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const shareReferralLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join our platform!',
          text: `Use my referral code ${stats?.code} to get started!`,
          url: getReferralLink()
        });
      } catch (error) {
        // User cancelled or error occurred
      }
    }
  };

  const handleTierSelection = (tier: SubscriptionTier) => {
    setSelectedTier(tier);

    // Check if this is a Student or Student Lite tier that needs package selection
    const needsPackageSelection = tier.name === 'student' || tier.name === 'student_lite';

    if (needsPackageSelection) {
      // Close tier selection modal and show package selector
      setShowRedeemModal(false);
      setShowPackageSelector(true);
    }
  };

  const handlePackageSelectionComplete = async (gradeId: string, subjectIds: string[]) => {
    if (!selectedTier || !user) return;

    try {
      setRedeeming(true);

      const { data, error } = await supabase.rpc('redeem_points_for_subscription', {
        p_user_id: user.id,
        p_tier_id: selectedTier.id,
        p_grade_id: gradeId,
        p_subject_ids: subjectIds
      });

      if (error) throw error;

      // Refresh data
      await fetchReferralData();
      setShowPackageSelector(false);
      setSelectedTier(null);

      // Show success message
      setSuccessMessage(`Successfully redeemed ${selectedTier.points_cost} points for ${selectedTier.display_name} tier!`);
      setShowSuccessModal(true);
    } catch (error: any) {
      console.error('Error redeeming points:', error);
      setSuccessMessage(error.message || 'Failed to redeem points. Please try again.');
      setShowSuccessModal(true);
    } finally {
      setRedeeming(false);
    }
  };

  const handleRedeemPoints = async () => {
    if (!selectedTier || !user) return;

    // For Pro tier, redeem directly without package selection
    if (selectedTier.name === 'pro') {
      try {
        setRedeeming(true);

        const { data, error } = await supabase.rpc('redeem_points_for_subscription', {
          p_user_id: user.id,
          p_tier_id: selectedTier.id
        });

        if (error) throw error;

        // Refresh data
        await fetchReferralData();
        setShowRedeemModal(false);
        setSelectedTier(null);

        // Show success message
        setSuccessMessage(`Successfully redeemed ${selectedTier.points_cost} points for ${selectedTier.display_name} tier!`);
        setShowSuccessModal(true);
      } catch (error: any) {
        console.error('Error redeeming points:', error);
        setSuccessMessage(error.message || 'Failed to redeem points. Please try again.');
        setShowSuccessModal(true);
      } finally {
        setRedeeming(false);
      }
    } else {
      // For Student/Student Lite, this shouldn't happen since we handle it in handleTierSelection
      // But keep this as fallback
      handleTierSelection(selectedTier);
    }
  };

  const handleCancelPackageSelection = () => {
    setShowPackageSelector(false);
    setSelectedTier(null);
    setShowRedeemModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <Gift className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Unable to load referral data</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Referral Program</h1>
          <p className="text-gray-600 mt-1">Earn points by referring friends!</p>
        </div>
        <Gift className="w-12 h-12 text-blue-600" />
      </div>

      {/* Referrer Info Card (if user was referred) */}
      {referrerInfo && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6">
          <div className="flex items-start space-x-4">
            <div className="bg-green-600 text-white rounded-full w-12 h-12 flex items-center justify-center flex-shrink-0">
              <Users className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-1">You Were Referred By</h3>
              <p className="text-gray-700">
                <span className="font-semibold">{referrerInfo.firstName} {referrerInfo.lastName}</span>
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {referrerInfo.email}
              </p>
              <p className="text-sm text-green-700 mt-2 font-medium">
                ✨ Your friend will earn points when you subscribe to a paid tier!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Points Balance Card */}
      <div className="bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-blue-100 text-sm font-medium">Available Points</p>
            <p className="text-5xl font-bold mt-2">{stats.pointsBalance}</p>
          </div>
          <Award className="w-16 h-16 text-blue-200 opacity-50" />
        </div>

        <div className="grid grid-cols-3 gap-4 pt-6 border-t border-blue-400">
          <div>
            <p className="text-blue-100 text-xs">Total Earned</p>
            <p className="text-2xl font-bold mt-1">{stats.totalEarned}</p>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Total Spent</p>
            <p className="text-2xl font-bold mt-1">{stats.totalSpent}</p>
          </div>
          <div>
            <p className="text-blue-100 text-xs">Successful Referrals</p>
            <p className="text-2xl font-bold mt-1">{stats.successfulReferrals}</p>
          </div>
        </div>

        {stats.pointsBalance > 0 && (
          <button
            onClick={() => setShowRedeemModal(true)}
            className="mt-6 w-full bg-white text-blue-600 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors flex items-center justify-center space-x-2"
          >
            <Star className="w-5 h-5" />
            <span>Redeem Points for Subscription</span>
          </button>
        )}
      </div>

      {/* Referral Code Section */}
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Your Referral Code</h2>
            <p className="text-sm text-gray-600 mt-1">Share this code with friends to earn points</p>
          </div>
          <Users className="w-8 h-8 text-gray-400" />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="text-3xl font-mono font-bold text-center text-gray-900 tracking-wider">
            {stats.code}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={copyReferralLink}
            className="flex items-center justify-center space-x-2 px-4 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>

          {navigator.share && (
            <button
              onClick={shareReferralLink}
              className="flex items-center justify-center space-x-2 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors"
            >
              <Share2 className="w-5 h-5" />
              <span>Share</span>
            </button>
          )}
        </div>

        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">How it works:</span> When someone signs up using your referral code and purchases a paid subscription, you'll earn points! The more friends you refer, the more points you earn.
          </p>
        </div>
      </div>

      {/* Referral Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Referral Stats</h3>
            <TrendingUp className="w-6 h-6 text-green-600" />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">Total Referrals</span>
              <span className="text-2xl font-bold text-gray-900">{stats.totalReferrals}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-600">Successful (Paid)</span>
              <span className="text-2xl font-bold text-green-600">{stats.successfulReferrals}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-gray-600">Pending</span>
              <span className="text-2xl font-bold text-yellow-600">
                {stats.totalReferrals - stats.successfulReferrals}
              </span>
            </div>
          </div>
        </div>

        {/* Points Earning Guide */}
        <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Points Earning Guide</h3>
            <Award className="w-6 h-6 text-yellow-600" />
          </div>

          <div className="space-y-2">
            {tiers.map(tier => (
              <div key={tier.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-700">{tier.display_name}</span>
                <span className="font-bold text-green-600">+{tier.referral_points_awarded} pts</span>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-gray-500">
            * Points are awarded when your referral purchases a paid subscription
          </p>
        </div>
      </div>

      {/* Recent Transactions */}
      {transactions.length > 0 && (
        <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h3>

          <div className="space-y-3">
            {transactions.map(transaction => (
              <div key={transaction.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{transaction.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(transaction.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className={`text-lg font-bold ${transaction.points > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {transaction.points > 0 ? '+' : ''}{transaction.points}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Redeem Points Modal */}
      {showRedeemModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Redeem Points</h2>

            <div className="mb-6">
              <p className="text-gray-600 mb-2">Available Points: <span className="font-bold text-gray-900">{stats.pointsBalance}</span></p>
            </div>

            <div className="space-y-3 mb-6">
              {tiers.map(tier => {
                const canAfford = stats.pointsBalance >= tier.points_cost;
                const isSelected = selectedTier?.id === tier.id;
                const needsPackageSelection = tier.name === 'student' || tier.name === 'student_lite';

                return (
                  <button
                    key={tier.id}
                    onClick={() => handleTierSelection(tier)}
                    disabled={!canAfford}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : canAfford
                        ? 'border-gray-200 hover:border-gray-300'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-900">{tier.display_name}</p>
                        <p className="text-sm text-gray-600 mt-1">Cost: {tier.points_cost} points</p>
                        {needsPackageSelection && (
                          <p className="text-xs text-blue-600 mt-1">→ Select subjects after clicking</p>
                        )}
                      </div>
                      {!canAfford && (
                        <span className="text-sm text-red-600 font-medium">Insufficient Points</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowRedeemModal(false);
                  setSelectedTier(null);
                }}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors"
              >
                Cancel
              </button>
              {selectedTier?.name === 'pro' && (
                <button
                  onClick={handleRedeemPoints}
                  disabled={redeeming}
                  className="flex-1 px-4 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {redeeming ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Redeeming...</span>
                    </>
                  ) : (
                    <span>Redeem Points</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Package Selector Modal for Student/Student Lite Tiers */}
      {showPackageSelector && selectedTier && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            <StudentPackageSelector
              onComplete={handlePackageSelectionComplete}
              onCancel={handleCancelPackageSelection}
              maxSubjects={selectedTier.max_subjects || 3}
              mode="redemption"
            />
          </div>
        </div>
      )}

      {/* Success/Error Modal */}
      <Modal
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
        title={successMessage.includes('Successfully') ? 'Success!' : 'Error'}
        message={successMessage}
        type={successMessage.includes('Successfully') ? 'success' : 'error'}
      />
    </div>
  );
}
