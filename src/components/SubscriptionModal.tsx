import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Crown, Zap, Check, X, Loader2, AlertCircle } from 'lucide-react';
import type { SubscriptionTier, UserSubscription } from '../types/subscription';
import { StudentPackageSelector } from './StudentPackageSelector';
import { PaymentOrchestrator } from './PaymentOrchestrator';
import type { PaymentSelectionData } from '../types/payment';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function SubscriptionModal({ isOpen, onClose, onSuccess }: SubscriptionModalProps) {
  const { user } = useAuth();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showStudentSelector, setShowStudentSelector] = useState(false);
  const [selectedStudentTier, setSelectedStudentTier] = useState<SubscriptionTier | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentSelectionData | null>(null);

  useEffect(() => {
    if (user && isOpen) {
      fetchData();
    }
  }, [user, isOpen]);

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
    // Users cannot downgrade during an active paid subscription period
    // They must wait until subscription expires or cancel it (which downgrades at period end)
    return false;
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

  const proceedToPayment = (
    tier: SubscriptionTier,
    gradeId: string | null,
    subjectIds: string[] | null
  ) => {
    const price = getPrice(tier);
    const paymentData: PaymentSelectionData = {
      tierId: tier.id,
      tierName: tier.display_name,
      amount: price,
      billingCycle: selectedBillingCycle,
      selectedGradeId: gradeId,
      selectedSubjectIds: subjectIds
    };

    setPaymentData(paymentData);
    setShowPayment(true);
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

  const handlePaymentSuccess = () => {
    setShowPayment(false);
    setPaymentData(null);
    setShowStudentSelector(false);
    setSelectedStudentTier(null);

    // Refresh subscription data
    fetchData();

    // Call onSuccess callback and close modal
    if (onSuccess) {
      onSuccess();
    }
    onClose();
  };

  const handleBackFromPayment = () => {
    setShowPayment(false);
    setPaymentData(null);
  };

  const handleClose = () => {
    if (!showPayment && !showStudentSelector) {
      onClose();
    }
  };

  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
        </div>
      </div>
    );
  }

  // Show payment orchestrator if payment is initiated
  if (showPayment && paymentData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-lg w-full max-w-3xl my-8">
          <PaymentOrchestrator
            paymentData={paymentData}
            onBack={handleBackFromPayment}
            onSuccess={handlePaymentSuccess}
          />
        </div>
      </div>
    );
  }

  // Show student package selector if student tier selected
  if (showStudentSelector && selectedStudentTier) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
        <div className="bg-white rounded-lg w-full max-w-4xl my-8">
          <StudentPackageSelector
            onComplete={handleStudentSelectionComplete}
            onCancel={handleCancelStudentSelection}
            maxSubjects={selectedStudentTier.max_subjects || 3}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg w-full max-w-5xl my-4 sm:my-8">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between rounded-t-lg">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">Choose Your Plan</h2>
            <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5 sm:mt-1">Upgrade anytime. Cancel anytime.</p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 ml-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-4">
          {/* Current Subscription Status */}
          {currentSubscription && (
            <div className="mb-3 sm:mb-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-2.5 sm:p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs sm:text-sm font-semibold text-gray-900 mb-0.5 truncate">
                    Current Plan: {currentSubscription.subscription_tiers?.display_name}
                  </h3>
                  <div className="flex flex-col sm:flex-row sm:gap-4 gap-1 text-[10px] sm:text-xs text-gray-600">
                    <p className="truncate">
                      Tokens: {currentSubscription.subscription_tiers?.token_limit === null
                        ? 'Unlimited'
                        : `${currentSubscription.tokens_used_current_period.toLocaleString()} / ${currentSubscription.subscription_tiers.token_limit.toLocaleString()}`}
                    </p>
                    {currentSubscription.subscription_tiers?.papers_limit !== null && (
                      <p className="truncate">
                        Papers: {currentSubscription.papers_accessed_current_period} / {currentSubscription.subscription_tiers.papers_limit}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {currentSubscription.subscription_tiers?.name === 'pro' && (
                    <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500" />
                  )}
                  {currentSubscription.subscription_tiers?.name === 'student' && (
                    <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500" />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Billing Cycle Toggle */}
          <div className="flex justify-center mb-3 sm:mb-4">
            <div className="inline-flex bg-gray-100 rounded-lg p-0.5 w-full max-w-xs sm:w-auto">
              <button
                onClick={() => setSelectedBillingCycle('monthly')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  selectedBillingCycle === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setSelectedBillingCycle('yearly')}
                className={`flex-1 sm:flex-none px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                  selectedBillingCycle === 'yearly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Yearly
                <span className="ml-1 sm:ml-1.5 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  Save 17%
                </span>
              </button>
            </div>
          </div>

          {/* Subscription Tiers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
            {tiers.map((tier) => {
              const price = getPrice(tier);
              const isCurrent = isCurrentTier(tier.id);
              const canUp = canUpgrade(tier);
              const canDown = canDowngrade(tier);

              return (
                <div
                  key={tier.id}
                  className={`relative bg-white border-2 rounded-lg p-3 ${
                    isCurrent
                      ? 'border-black shadow-lg'
                      : tier.name === 'student'
                      ? 'border-blue-200'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Popular Badge for Student */}
                  {tier.name === 'student' && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      POPULAR
                    </div>
                  )}

                  {/* Current Badge */}
                  {isCurrent && (
                    <div className="absolute -top-2 right-3 bg-black text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      CURRENT
                    </div>
                  )}

                  {/* Header */}
                  <div className="text-center mb-3">
                    <h3 className="text-lg font-bold text-gray-900 mb-0.5">{tier.display_name}</h3>
                    <p className="text-[10px] text-gray-600 mb-2">{tier.description}</p>
                    <div className="flex items-baseline justify-center">
                      <span className="text-2xl font-bold text-gray-900">${price}</span>
                      <span className="text-gray-600 ml-1 text-xs">/{selectedBillingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                    </div>
                  </div>

                  {/* Features */}
                  <ul className="space-y-1 mb-3">
                    <li className="flex items-start">
                      <Check className="w-3 h-3 text-green-500 mr-1.5 flex-shrink-0 mt-0.5" />
                      <span className="text-[11px] text-gray-700">
                        {formatTokens(tier.token_limit)} tokens/month
                      </span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-3 h-3 text-green-500 mr-1.5 flex-shrink-0 mt-0.5" />
                      <span className="text-[11px] text-gray-700">
                        {formatPapers(tier.papers_limit)} exam papers
                      </span>
                    </li>
                    {tier.can_select_grade && (
                      <li className="flex items-start">
                        <Check className="w-3 h-3 text-green-500 mr-1.5 flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] text-gray-700">
                          Choose your grade level
                        </span>
                      </li>
                    )}
                    {tier.can_select_subjects && (
                      <li className="flex items-start">
                        <Check className="w-3 h-3 text-green-500 mr-1.5 flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] text-gray-700">
                          Up to {tier.max_subjects} subjects
                        </span>
                      </li>
                    )}
                    {tier.name === 'pro' && (
                      <>
                        <li className="flex items-start">
                          <Check className="w-3 h-3 text-green-500 mr-1.5 flex-shrink-0 mt-0.5" />
                          <span className="text-[11px] text-gray-700">
                            All subjects & grades
                          </span>
                        </li>
                        <li className="flex items-start">
                          <Check className="w-3 h-3 text-green-500 mr-1.5 flex-shrink-0 mt-0.5" />
                          <span className="text-[11px] text-gray-700">
                            Priority support
                          </span>
                        </li>
                      </>
                    )}
                  </ul>

                  {/* CTA Button */}
                  <button
                    onClick={() => handleSelectPlan(tier)}
                    disabled={isCurrent || canDown}
                    className={`w-full py-1.5 text-xs rounded-md font-medium transition-colors ${
                      isCurrent
                        ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                        : canDown
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : canUp
                        ? 'bg-black text-white hover:bg-gray-800'
                        : 'bg-black text-white hover:bg-gray-800'
                    }`}
                  >
                    {isCurrent
                      ? 'Current Plan'
                      : canUp
                      ? 'Upgrade'
                      : canDown
                      ? 'Not Available'
                      : price === 0
                      ? 'Get Started'
                      : 'Select Plan'}
                  </button>

                  {/* Upgrade benefit note */}
                  {canUp && currentSubscription && currentSubscription.subscription_tiers?.token_limit && (
                    <p className="text-[10px] text-green-600 mt-1.5 text-center">
                      ✓ Get additional {formatTokens(tier.token_limit || 0)} tokens
                    </p>
                  )}
                  {canUp && tier.token_limit === null && currentSubscription && (
                    <p className="text-[10px] text-green-600 mt-1.5 text-center">
                      ✓ Get unlimited tokens
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Additional Info */}
          <div className="mt-4 text-center text-[10px] text-gray-600">
            <p>All plans include AI-powered exam assistance and instant explanations</p>
            <p className="mt-0.5">Cancel anytime. No hidden fees.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
