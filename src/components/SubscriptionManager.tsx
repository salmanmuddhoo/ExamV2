import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Crown, Zap, Check, X, Loader2, AlertCircle } from 'lucide-react';
import type { SubscriptionTier, UserSubscription } from '../types/subscription';
import { StudentPackageSelector } from './StudentPackageSelector';
import { PaymentOrchestrator } from './PaymentOrchestrator';
import type { PaymentSelectionData } from '../types/payment';

export function SubscriptionManager() {
  const { user } = useAuth();
  const [tiers, setTiers] = useState<SubscriptionTier[]>([]);
  const [currentSubscription, setCurrentSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBillingCycle, setSelectedBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showStudentSelector, setShowStudentSelector] = useState(false);
  const [selectedStudentTier, setSelectedStudentTier] = useState<SubscriptionTier | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentSelectionData | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string>('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState<{
    tierName: string;
    tokens: number | null;
    grade?: string;
    subjects?: string[];
  } | null>(null);

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
    const price = getPrice(tier);

    setPaymentData({
      tierId: tier.id,
      tierName: tier.display_name,
      amount: price,
      currency: 'USD',
      billingCycle: selectedBillingCycle,
      selectedGradeId: gradeId || undefined,
      selectedSubjectIds: subjectIds || undefined
    });

    setShowPayment(true);
  };

  const handlePaymentSuccess = async () => {
    setShowPayment(false);
    setPaymentData(null);
    setShowStudentSelector(false);
    setSelectedStudentTier(null);

    // Refresh subscription data
    await fetchData();

    // Fetch the updated subscription to show in success modal
    try {
      const { data: subscriptionData } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          subscription_tiers (*),
          grades (name),
          subjects (name)
        `)
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .single();

      if (subscriptionData) {
        const tier = subscriptionData.subscription_tiers as any;
        const tokenLimit = (subscriptionData as any).token_limit_override ?? tier.token_limit;

        // Get grade and subjects if student package
        let grade: string | undefined;
        let subjects: string[] | undefined;

        if (tier.name === 'student' && subscriptionData.selected_grade_id) {
          const gradeData = subscriptionData.grades as any;
          grade = gradeData?.name;

          if (subscriptionData.selected_subject_ids && subscriptionData.selected_subject_ids.length > 0) {
            const { data: subjectsData } = await supabase
              .from('subjects')
              .select('name')
              .in('id', subscriptionData.selected_subject_ids);

            subjects = subjectsData?.map((s: any) => s.name) || [];
          }
        }

        setSuccessData({
          tierName: tier.display_name || tier.name,
          tokens: tokenLimit,
          grade,
          subjects
        });
        setShowSuccessModal(true);
      }
    } catch (error) {
      console.error('Error fetching subscription for success modal:', error);
    }
  };

  const handleBackFromPayment = () => {
    setShowPayment(false);
    setPaymentData(null);
  };

  const handleCancelSubscription = async () => {
    if (!user) return;

    try {
      setCancelling(true);
      setCancelError('');

      // Call the cancel_subscription_at_period_end function
      const { data, error } = await supabase.rpc('cancel_subscription_at_period_end', {
        p_user_id: user.id,
        p_reason: 'User requested cancellation'
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const result = data[0];
        if (!result.success) {
          throw new Error(result.message);
        }
      }

      // Refresh subscription data
      await fetchData();
      setShowCancelDialog(false);
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      setCancelError(error.message || 'Failed to cancel subscription');
    } finally {
      setCancelling(false);
    }
  };

  const handleReactivateSubscription = async () => {
    if (!user) return;

    try {
      setCancelling(true);
      setCancelError('');

      // Call the reactivate_subscription function
      const { data, error } = await supabase.rpc('reactivate_subscription', {
        p_user_id: user.id
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const result = data[0];
        if (!result.success) {
          throw new Error(result.message);
        }
      }

      // Refresh subscription data
      await fetchData();
    } catch (error: any) {
      console.error('Error reactivating subscription:', error);
      setCancelError(error.message || 'Failed to reactivate subscription');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Show payment orchestrator if payment is initiated
  if (showPayment && paymentData) {
    return (
      <PaymentOrchestrator
        paymentData={paymentData}
        onBack={handleBackFromPayment}
        onSuccess={handlePaymentSuccess}
      />
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
    <div className="max-w-6xl mx-auto">
      {/* Current Subscription Status */}
      {currentSubscription && (
        <div className="mb-4">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">
                  Current Plan: {currentSubscription.subscription_tiers?.display_name}
                </h3>
                <div className="space-y-0.5 text-xs text-gray-600">
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
                  <Crown className="w-10 h-10 text-yellow-500" />
                )}
                {currentSubscription.subscription_tiers?.name === 'student' && (
                  <Zap className="w-10 h-10 text-blue-500" />
                )}
              </div>
            </div>
          </div>

          {/* Cancellation Warning */}
          {currentSubscription.cancel_at_period_end && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-yellow-900 mb-1">
                    Subscription Scheduled for Cancellation
                  </h4>
                  <p className="text-xs text-yellow-800 mb-2">
                    Your subscription will end on{' '}
                    <strong>
                      {currentSubscription.period_end_date
                        ? new Date(currentSubscription.period_end_date).toLocaleDateString()
                        : 'the end of the current period'}
                    </strong>
                    . You'll continue to have full access until then.
                  </p>
                  <button
                    onClick={handleReactivateSubscription}
                    disabled={cancelling}
                    className="text-xs bg-yellow-600 text-white px-3 py-1.5 rounded hover:bg-yellow-700 disabled:opacity-50 transition-colors"
                  >
                    {cancelling ? 'Processing...' : 'Reactivate Subscription'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cancel Button for Active Paid Subscriptions */}
          {!currentSubscription.cancel_at_period_end &&
           currentSubscription.subscription_tiers?.name !== 'free' && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => setShowCancelDialog(true)}
                className="text-xs text-red-600 hover:text-red-700 font-medium"
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>
      )}

      {/* Billing Cycle Toggle */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setSelectedBillingCycle('monthly')}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
              selectedBillingCycle === 'monthly'
                ? 'bg-white text-black shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setSelectedBillingCycle('yearly')}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-colors ${
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const price = getPrice(tier);
          const isCurrent = isCurrentTier(tier.id);
          const canUp = canUpgrade(tier);
          const canDown = canDowngrade(tier);

          return (
            <div
              key={tier.id}
              className={`relative bg-white border-2 rounded-xl p-4 ${
                isCurrent
                  ? 'border-black shadow-lg'
                  : tier.name === 'student'
                  ? 'border-blue-200'
                  : 'border-gray-200'
              }`}
            >
              {/* Popular Badge for Student */}
              {tier.name === 'student' && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  POPULAR
                </div>
              )}

              {/* Current Badge */}
              {isCurrent && (
                <div className="absolute -top-2.5 right-4 bg-black text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  CURRENT
                </div>
              )}

              {/* Header */}
              <div className="text-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 mb-1">{tier.display_name}</h3>
                <p className="text-xs text-gray-600 mb-3">{tier.description}</p>
                <div className="flex items-baseline justify-center">
                  <span className="text-3xl font-bold text-gray-900">${price}</span>
                  <span className="text-gray-600 ml-1 text-sm">/{selectedBillingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                </div>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-4">
                <li className="flex items-start">
                  <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-gray-700">
                    {formatTokens(tier.token_limit)} tokens/month
                  </span>
                </li>
                <li className="flex items-start">
                  <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-gray-700">
                    {formatPapers(tier.papers_limit)} exam papers
                  </span>
                </li>
                {tier.can_select_grade && (
                  <li className="flex items-start">
                    <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-700">
                      Choose your grade level
                    </span>
                  </li>
                )}
                {tier.can_select_subjects && (
                  <li className="flex items-start">
                    <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span className="text-xs text-gray-700">
                      Up to {tier.max_subjects} subjects
                    </span>
                  </li>
                )}
                {tier.name === 'pro' && (
                  <>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-gray-700">
                        All subjects & grades
                      </span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-gray-700">
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
                className={`w-full py-2 text-sm rounded-lg font-medium transition-colors ${
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
                <p className="text-xs text-green-600 mt-2 text-center">
                  ✓ Get additional {formatTokens(tier.token_limit || 0)} tokens
                </p>
              )}
              {canUp && tier.token_limit === null && currentSubscription && (
                <p className="text-xs text-green-600 mt-2 text-center">
                  ✓ Get unlimited tokens
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Additional Info */}
      <div className="mt-4 text-center text-xs text-gray-600">
        <p>All plans include AI-powered exam assistance and instant explanations</p>
        <p className="mt-1">Cancel anytime. No hidden fees.</p>
      </div>

      {/* Cancellation Confirmation Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Cancel Subscription?</h3>

            <div className="mb-6 space-y-3">
              <p className="text-sm text-gray-700">
                Are you sure you want to cancel your <strong>{currentSubscription?.subscription_tiers?.display_name}</strong> subscription?
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-900 font-medium mb-2">
                  ✓ You'll retain full access until:
                </p>
                <p className="text-base font-bold text-blue-900">
                  {currentSubscription?.period_end_date
                    ? new Date(currentSubscription.period_end_date).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })
                    : 'the end of your billing period'}
                </p>
              </div>

              <p className="text-xs text-gray-600">
                After this date, your account will be downgraded to the Free tier. You can reactivate your subscription anytime before it ends.
              </p>
            </div>

            {cancelError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{cancelError}</p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowCancelDialog(false);
                  setCancelError('');
                }}
                disabled={cancelling}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleCancelSubscription}
                disabled={cancelling}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center space-x-2"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <span>Yes, Cancel</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && successData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            {/* Success Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-green-600" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-4">
              Purchase Successful!
            </h2>

            {/* Subscription Details */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
              <div>
                <p className="text-sm text-gray-600 mb-1">Plan:</p>
                <p className="text-lg font-semibold text-gray-900">{successData.tierName}</p>
              </div>

              {successData.grade && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Grade:</p>
                  <p className="font-medium text-gray-900">{successData.grade}</p>
                </div>
              )}

              {successData.subjects && successData.subjects.length > 0 && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Subjects:</p>
                  <div className="flex flex-wrap gap-2">
                    {successData.subjects.map((subject, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {subject}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!successData.grade && !successData.subjects && (
                <div>
                  <p className="text-sm text-gray-600 mb-1">Access:</p>
                  <p className="font-medium text-gray-900">All Subjects & Grades</p>
                </div>
              )}

              <div>
                <p className="text-sm text-gray-600 mb-1">AI Tokens:</p>
                <p className="text-lg font-bold text-gray-900">
                  {successData.tokens === null ? 'Unlimited' : successData.tokens.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Info Message */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                You can view your token balance in the chat interface or in your profile settings.
              </p>
            </div>

            {/* Close Button */}
            <button
              onClick={() => {
                setShowSuccessModal(false);
                setSuccessData(null);
              }}
              className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
