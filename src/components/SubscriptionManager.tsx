import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Crown, Zap, Check, X, Loader2 } from 'lucide-react';
import type { SubscriptionTier, UserSubscription } from '../types/subscription';
import { StudentPackageSelector } from './StudentPackageSelector';

export function SubscriptionManager() {
  const { user } = useAuth();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showStudentSelector, setShowStudentSelector] = useState(false);
  const [selectedStudentTier, setSelectedStudentTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch all active tiers
      const { data: tiersData, error: tiersError } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('is_active', true)
        .order('display_order');

      if (tiersError) throw tiersError;
      setTiers(tiersData || []);

      // Fetch user's current subscription
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_tiers (*)
        `)
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .single();

      if (subscriptionError && subscriptionError.code !== 'PGRST116') {
        throw subscriptionError;
      }

      setCurrentSubscription(subscriptionData || null);
    } catch (error) {
      console.error('Error fetching subscription data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = (tier: SubscriptionTier) => {
    return selectedBillingCycle === 'monthly' ? tier.price_monthly : tier.price_yearly;
  };

  const formatTokens = (tokens: number | null) => {
    if (tokens === null) return 'Unlimited';
    return `${(tokens / 1000).toFixed(0)}K`;
  };

  const formatPapers = (papers: number | null) => {
    if (papers === null) return 'Unlimited';
    return papers.toString();
  };

  const isCurrentTier = (tierId: string) => {
    return currentSubscription?.tier_id === tierId;
  };

  const canUpgrade = (tier: SubscriptionTier) => {
    if (!currentSubscription) return true;
    const currentTier = tiers.find(t => t.id === currentSubscription.tier_id);
    if (!currentTier) return true;
    return tier.display_order > currentTier.display_order;
  };

  const canDowngrade = (tier: SubscriptionTier) => {
    if (!currentSubscription) return false;
    const currentTier = tiers.find(t => t.id === currentSubscription.tier_id);
    if (!currentTier) return false;
    return tier.display_order < currentTier.display_order;
  };

  const handleSelectPlan = (tier: SubscriptionTier) => {
    // If student tier, show grade/subject selector
    if (tier.name === 'student') {
      setSelectedStudentTier(tier);
      setShowStudentSelector(true);
    } else {
      // For other tiers, go directly to payment
      proceedToPayment(tier, null, null);
    }
  };

  const handleStudentSelectionComplete = (gradeId: string, subjectIds: string[]) => {
    if (selectedStudentTier) {
      proceedToPayment(selectedStudentTier, gradeId, subjectIds);
    }
  };

  const handleCancelStudentSelection = () => {
    setShowStudentSelector(false);
    setSelectedStudentTier(null);
  };

  const proceedToPayment = (tier: SubscriptionTier, gradeId: string | null, subjectIds: string[] | null) => {
    // TODO: Integrate with payment gateway
    console.log('Proceeding to payment:', {
      tier: tier.name,
      billing: selectedBillingCycle,
      price: getPrice(tier),
      gradeId,
      subjectIds
    });
    alert(`Payment integration coming soon!\n\nSelected: ${tier.display_name}\nBilling: ${selectedBillingCycle}\nPrice: $${getPrice(tier)}${gradeId ? `\nGrade: ${gradeId}\nSubjects: ${subjectIds?.length}` : ''}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Show student package selector if student tier selected
  if (showStudentSelector && selectedStudentTier) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <StudentPackageSelector
          onComplete={handleStudentSelectionComplete}
          onCancel={handleCancelStudentSelection}
          maxSubjects={selectedStudentTier.max_subjects || 3}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Current Subscription Status */}
      {currentSubscription && (
        <div className="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Current Plan: {currentSubscription.subscription_tiers?.display_name}
              </h3>
              <div className="space-y-1 text-sm text-gray-600">
                <p>
                  Tokens: {currentSubscription.subscription_tiers?.token_limit === null
                    ? 'Unlimited'
                    : `${currentSubscription.tokens_used_current_period.toLocaleString()} / ${currentSubscription.subscription_tiers.token_limit.toLocaleString()}`}
                </p>
                {currentSubscription.subscription_tiers?.papers_limit !== null && (
                  <p>
                    Papers: {currentSubscription.papers_accessed_current_period} / {currentSubscription.subscription_tiers.papers_limit}
                  </p>
                )}
                <p>
                  Period: {new Date(currentSubscription.period_start_date).toLocaleDateString()} - {
                    currentSubscription.period_end_date
                      ? new Date(currentSubscription.period_end_date).toLocaleDateString()
                      : 'Ongoing'
                  }
                </p>
              </div>
            </div>
            <div className="flex-shrink-0">
              {currentSubscription.subscription_tiers?.name === 'pro' && (
                <Crown className="w-12 h-12 text-yellow-500" />
              )}
              {currentSubscription.subscription_tiers?.name === 'student' && (
                <Zap className="w-12 h-12 text-blue-500" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Billing Cycle Toggle */}
      <div className="flex justify-center mb-8">
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setSelectedBillingCycle('monthly')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              selectedBillingCycle === 'monthly'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setSelectedBillingCycle('yearly')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              selectedBillingCycle === 'yearly'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Yearly
            <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
              Save 17%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const price = getPrice(tier);
          const isCurrent = isCurrentTier(tier.id);
          const canUp = canUpgrade(tier);
          const canDown = canDowngrade(tier);

          return (
            <div
              key={tier.id}
              className={`relative bg-white border-2 rounded-xl p-6 ${
                isCurrent
                  ? 'border-black shadow-lg'
                  : tier.name === 'student'
                  ? 'border-blue-200'
                  : 'border-gray-200'
              }`}
            >
              {/* Popular Badge for Student */}
              {tier.name === 'student' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                  POPULAR
                </div>
              )}

              {/* Current Badge */}
              {isCurrent && (
                <div className="absolute -top-3 right-4 bg-black text-white text-xs font-bold px-3 py-1 rounded-full">
                  CURRENT
                </div>
              )}

              {/* Header */}
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{tier.display_name}</h3>
                <p className="text-sm text-gray-600 mb-4">{tier.description}</p>
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold text-gray-900">${price}</span>
                  <span className="text-gray-600 ml-2">/{selectedBillingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-3 mb-6">
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">
                    {formatTokens(tier.token_limit)} tokens/month
                  </span>
                </li>
                <li className="flex items-start">
                  <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700">
                    {formatPapers(tier.papers_limit)} exam papers
                  </span>
                </li>
                {tier.can_select_grade && (
                  <li className="flex items-start">
                    <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">
                      Choose your grade level
                    </span>
                  </li>
                )}
                {tier.can_select_subjects && (
                  <li className="flex items-start">
                    <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">
                      Up to {tier.max_subjects} subjects
                    </span>
                  </li>
                )}
                {tier.name === 'pro' && (
                  <>
                    <li className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">
                        All subjects & grades
                      </span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-700">
                        Priority support
                      </span>
                    </li>
                  </>
                )}
              </ul>

              {/* CTA Button */}
              <button
                onClick={() => handleSelectPlan(tier)}
                disabled={isCurrent}
                className={`w-full py-3 rounded-lg font-medium transition-colors ${
                  isCurrent
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : canUp
                    ? 'bg-black text-white hover:bg-gray-800'
                    : canDown
                    ? 'bg-gray-600 text-white hover:bg-gray-700'
                    : 'bg-black text-white hover:bg-gray-800'
                }`}
              >
                {isCurrent
                  ? 'Current Plan'
                  : canUp
                  ? 'Upgrade'
                  : canDown
                  ? 'Downgrade'
                  : price === 0
                  ? 'Get Started'
                  : 'Select Plan'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Additional Info */}
      <div className="mt-8 text-center text-sm text-gray-600">
        <p>All plans include AI-powered exam assistance and instant explanations</p>
        <p className="mt-2">Cancel anytime. No hidden fees.</p>
      </div>
    </div>
  );
}
