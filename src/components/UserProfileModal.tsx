import { useState, useRef, useEffect } from 'react';
import { X, User, CreditCard, History, Settings, Camera, Check, Loader2, Crown, Star, BookOpen, Calendar, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PaymentHistory } from './PaymentHistory';
import { supabase } from '../lib/supabase';
import { Modal } from './Modal';
import { StudentPackageSelector } from './StudentPackageSelector';
import { formatTokenCount } from '../lib/formatUtils';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: TabType;
  onOpenSubscriptions?: () => void;
}

type TabType = 'general' | 'subscription' | 'payment-history' | 'settings';

export function UserProfileModal({ isOpen, onClose, initialTab = 'general', onOpenSubscriptions }: UserProfileModalProps) {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [profilePicture, setProfilePicture] = useState(profile?.profile_picture_url || '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [subscriptionTier, setSubscriptionTier] = useState<string>('Loading...');
  const [tierName, setTierName] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [tokensRemaining, setTokensRemaining] = useState<number | null>(null);
  const [tokensLimit, setTokensLimit] = useState<number | null>(null);
  const [tokensTierLimit, setTokensTierLimit] = useState<number | null>(null); // Tier's base limit
  const [tokensCarryover, setTokensCarryover] = useState<number>(0); // Carryover amount
  const [tokensUsed, setTokensUsed] = useState<number>(0); // Displayed tokens used (capped for non-admin)
  const [papersRemaining, setPapersRemaining] = useState<number | null>(null);
  const [papersLimit, setPapersLimit] = useState<number | null>(null);
  const [cycleStart, setCycleStart] = useState<string | null>(null);
  const [cycleEnd, setCycleEnd] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState<boolean>(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<string>('');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly' | 'lifetime' | null>(null);
  const [isRecurring, setIsRecurring] = useState<boolean>(false);
  const [renewalDate, setRenewalDate] = useState<string | null>(null);
  const [subscriptionEndDate, setSubscriptionEndDate] = useState<string | null>(null);
  const [showEditSelections, setShowEditSelections] = useState(false);
  const [updatingSelections, setUpdatingSelections] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getTierIcon = (tierName: string) => {
    switch (tierName) {
      case 'free':
        return <BookOpen className="w-6 h-6 text-gray-600" />;
      case 'student':
        return <Star className="w-6 h-6 text-blue-600" />;
      case 'pro':
        return <Crown className="w-6 h-6 text-yellow-500" />;
      default:
        return <BookOpen className="w-6 h-6 text-gray-600" />;
    }
  };

  useEffect(() => {
    if (user && isOpen) {
      fetchSubscriptionTier();
    }
  }, [user, isOpen]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
    }
  }, [profile]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const fetchSubscriptionTier = async (retryCount = 0) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          subscription_tiers(name, display_name, token_limit, papers_limit),
          selected_grade_id,
          selected_subject_ids,
          grade_levels!user_subscriptions_selected_grade_id_fkey(name),
          tokens_used_current_period,
          token_limit_override,
          papers_accessed_current_period,
          period_start_date,
          period_end_date,
          cancel_at_period_end,
          payment_provider,
          billing_cycle,
          is_recurring,
          end_date,
          subscription_end_date
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      // Debug logging for subscription data
      if (data) {
      }

      if (error || !data) {
        // Only try to create subscription once (prevent infinite loop)
        if (retryCount === 0) {

          try {
            const { data: ensureData, error: ensureError } = await supabase
              .rpc('ensure_user_has_subscription', { p_user_id: user.id });

            if (ensureError) {
            } else if (ensureData && ensureData[0]?.success) {
              // Retry fetching the subscription ONCE
              await fetchSubscriptionTier(1);
              return;
            }
          } catch (err) {
          }
        }

        // If we still don't have a subscription, show error state
        setSubscriptionTier('No active subscription');
        setTierName('');
        setTokensRemaining(null);
        setTokensLimit(null);
        setPapersRemaining(null);
        setPapersLimit(null);
        setCycleStart(null);
        setCycleEnd(null);
        setCancelAtPeriodEnd(false);
        setPaymentProvider('');
      } else {
        const tierData = data.subscription_tiers as any;
        const displayName = tierData?.display_name || 'Unknown';
        const internalTierName = tierData?.name || '';
        setSubscriptionTier(displayName);
        setTierName(internalTierName);

        // Set token information
        const tierLimit = tierData?.token_limit;
        const overrideLimit = data.token_limit_override;
        const tokensUsed = data.tokens_used_current_period ?? 0;
        const isAdmin = profile?.role === 'admin';

        // Calculate carryover and final limit
        const carryover = overrideLimit && tierLimit ? overrideLimit - tierLimit : 0;
        const finalLimit = overrideLimit ?? tierLimit;
        const tokensRemaining = finalLimit === null ? null : finalLimit - tokensUsed;

        // For non-admin users, cap displayed usage at the limit
        const displayedTokensUsed = isAdmin ? tokensUsed : (finalLimit !== null ? Math.min(tokensUsed, finalLimit) : tokensUsed);

        setTokensTierLimit(tierLimit);
        setTokensCarryover(carryover);
        setTokensLimit(finalLimit);
        setTokensUsed(displayedTokensUsed);
        setTokensRemaining(isAdmin ? tokensRemaining : Math.max(0, tokensRemaining || 0));

        // Set papers information
        const paperLimit = tierData?.papers_limit;
        const papersUsed = data.papers_accessed_current_period || 0;
        setPapersLimit(paperLimit);

        // For non-admin users, cap the remaining papers at 0 (never show negative)
        // Admins see actual usage for cost calculation
        const papersRemaining = paperLimit === null ? null : paperLimit - papersUsed;
        setPapersRemaining(isAdmin ? papersRemaining : Math.max(0, papersRemaining || 0));

        // Set cycle dates
        setCycleStart(data.period_start_date);
        setCycleEnd(data.period_end_date);

        // Set cancellation status
        setCancelAtPeriodEnd(data.cancel_at_period_end || false);

        // Set payment provider
        setPaymentProvider(data.payment_provider || '');

        // Set billing cycle and renewal information
        setBillingCycle(data.billing_cycle || null);
        setIsRecurring(data.is_recurring || false);
        // Use period_end_date for recurring, end_date for non-recurring
        setRenewalDate((data.is_recurring ? data.period_end_date : data.end_date) || null);
        // Set subscription end date (for yearly subscriptions)
        setSubscriptionEndDate(data.subscription_end_date || null);

        // Fetch grade and subjects for student/student_lite/free tiers
        // Pro tier should not display selections
        if (internalTierName === 'student' || internalTierName === 'student_lite' || internalTierName === 'free') {
          if (data.selected_grade_id && data.grade_levels) {
            setSelectedGrade((data.grade_levels as any)?.name || '');
          } else {
            setSelectedGrade('');
          }

          // Fetch subject names if selections exist (for all three tiers)
          // For free tier, also fetch grade information
          if (data.selected_subject_ids && data.selected_subject_ids.length > 0) {
            if (internalTierName === 'free') {
              // For free tier, get subjects with their grades
              const subjectsWithGrades: string[] = [];

              for (const subjectId of data.selected_subject_ids) {
                // Get the most recent conversation for this subject to find the grade
                const { data: recentConv, error: convError } = await supabase
                  .from('conversations')
                  .select(`
                    exam_papers!inner(
                      subjects(name),
                      grade_levels(name)
                    )
                  `)
                  .eq('user_id', user.id)
                  .eq('exam_papers.subject_id', subjectId)
                  .order('updated_at', { ascending: false })
                  .limit(1)
                  .single();

                if (!convError && recentConv) {
                  const examPaper = recentConv.exam_papers as any;
                  const gradeName = examPaper.grade_levels?.name || '';
                  const subjectName = examPaper.subjects?.name || '';
                  if (gradeName && subjectName) {
                    subjectsWithGrades.push(`${gradeName} - ${subjectName}`);
                  }
                }
              }

              setSelectedSubjects(subjectsWithGrades);
            } else {
              // For student/student_lite, just get subject names
              const { data: subjects, error: subjectsError } = await supabase
                .from('subjects')
                .select('name')
                .in('id', data.selected_subject_ids);

              if (!subjectsError && subjects) {
                setSelectedSubjects(subjects.map(s => s.name));
              }
            }
          } else {
            setSelectedSubjects([]);
          }
        } else {
          // Clear selections for pro tier
          setSelectedGrade('');
          setSelectedSubjects([]);
        }
      }
    } catch (error) {
      setSubscriptionTier('Unknown');
    }
  };

  const handleUpdateSelections = async (gradeId: string, subjectIds: string[]) => {
    if (!user) return;

    setUpdatingSelections(true);
    setUpdateMessage(null);

    try {
      const { data, error } = await supabase
        .rpc('update_subscription_selections', {
          p_user_id: user.id,
          p_grade_id: gradeId,
          p_subject_ids: subjectIds
        });

      if (error) throw error;

      const result = data[0];
      if (result.success) {
        setUpdateMessage({ type: 'success', text: 'Selections updated successfully!' });
        setShowEditSelections(false);

        // Refresh subscription data
        await fetchSubscriptionTier();

        // Clear success message after 3 seconds
        setTimeout(() => setUpdateMessage(null), 3000);
      } else {
        setUpdateMessage({ type: 'error', text: result.message });
      }
    } catch (error: any) {
      setUpdateMessage({ type: 'error', text: error.message || 'Failed to update selections' });
    } finally {
      setUpdatingSelections(false);
    }
  };


  if (!isOpen || !user || !profile) return null;

  const tabs = [
    { id: 'general' as TabType, label: 'General', icon: User },
    { id: 'subscription' as TabType, label: 'Subscription', icon: CreditCard },
    { id: 'payment-history' as TabType, label: 'Payment History', icon: History },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    setUploadingImage(true);

    try {
      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;

      // Upload to Supabase storage (bucket name is 'profile-pictures', file path is just the filename)
      const { error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(fileName);

      // Update profile in database
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ profile_picture_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfilePicture(publicUrl);
      setSuccessMessage('Profile picture updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error: any) {
      alert(`Failed to upload image: ${error.message || 'Please try again.'}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user || !firstName.trim() || !lastName.trim()) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        })
        .eq('id', user.id);

      if (error) throw error;

      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      alert('Failed to update profile. Please try again.');
    }
  };

  const handleFirstNameBlur = () => {
    if (firstName.trim() !== (profile?.first_name || '')) {
      handleSaveProfile();
    }
  };

  const handleLastNameBlur = () => {
    if (lastName.trim() !== (profile?.last_name || '')) {
      handleSaveProfile();
    }
  };

  const handleCancelSubscription = async () => {
    if (!user) return;

    setCancelling(true);
    try {
      const { data, error } = await supabase
        .rpc('cancel_subscription_at_period_end', {
          p_user_id: user.id,
          p_reason: cancellationReason || null
        });

      if (error) throw error;

      if (data && data.length > 0 && data[0].success) {
        setSuccessMessage('Subscription will be cancelled at the end of your billing period.');
        setTimeout(() => setSuccessMessage(''), 5000);
        setCancelAtPeriodEnd(true);
        setShowCancelModal(false);
        setCancellationReason('');
        await fetchSubscriptionTier();
      } else {
        alert(data[0]?.message || 'Failed to cancel subscription');
      }
    } catch (error: any) {
      alert(`Failed to cancel subscription: ${error.message || 'Please try again.'}`);
    } finally {
      setCancelling(false);
    }
  };

  const handleReactivateSubscription = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .rpc('reactivate_subscription', {
          p_user_id: user.id
        });

      if (error) throw error;

      if (data && data.length > 0 && data[0].success) {
        setSuccessMessage('Subscription reactivated successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
        setCancelAtPeriodEnd(false);
        await fetchSubscriptionTier();
      } else {
        alert(data[0]?.message || 'Failed to reactivate subscription');
      }
    } catch (error: any) {
      alert(`Failed to reactivate subscription: ${error.message || 'Please try again.'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl h-[90vh] md:h-[80vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-4 md:px-6 py-3 md:py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <h2 className="text-lg md:text-xl font-bold text-gray-900">My Profile</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          {/* Top/Left Tabs - Horizontal on mobile, Sidebar on desktop */}
          <div className="md:w-64 border-b md:border-b-0 md:border-r border-gray-200 bg-gray-50">
            {/* Mobile: Horizontal scrollable tabs */}
            <div className="md:hidden">
              <nav className="flex p-2 gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-1 flex flex-col items-center justify-center space-y-0.5 py-1.5 rounded-md transition-colors ${
                        activeTab === tab.id
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="font-medium text-[10px] whitespace-nowrap">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Desktop: Vertical sidebar */}
            <div className="hidden md:block p-4">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium text-sm">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            {activeTab === 'general' && (
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">General Information</h3>

                {successMessage && (
                  <div className="mb-4 p-2 md:p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <p className="text-xs md:text-sm text-green-800">{successMessage}</p>
                  </div>
                )}

                <div className="space-y-3 md:space-y-4">
                  {/* Profile Picture */}
                  <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-3 sm:space-y-0 sm:space-x-4">
                    <div className="relative">
                      {profilePicture ? (
                        <img
                          src={profilePicture}
                          alt="Profile"
                          className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-900 to-gray-700 flex items-center justify-center">
                          <User className="w-10 h-10 text-white" />
                        </div>
                      )}
                      {uploadingImage && (
                        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingImage}
                        className="absolute bottom-0 right-0 p-1.5 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors border-2 border-white"
                        title="Change profile picture"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </div>
                    <div className="text-center sm:text-left">
                      <p className="text-sm font-medium text-gray-900">Profile Picture</p>
                      <p className="text-xs text-gray-500">Click the camera icon to upload (max 5MB)</p>
                    </div>
                  </div>

                  {/* First Name and Last Name - Stacked on mobile, Side by Side on desktop */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        onBlur={handleFirstNameBlur}
                        className="w-full px-3 md:px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Enter your first name"
                      />
                    </div>

                    <div>
                      <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        onBlur={handleLastNameBlur}
                        className="w-full px-3 md:px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 text-sm focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Enter your last name"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">Email Address</label>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className="w-full px-3 md:px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>

                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">My Subscription</h3>
                <div className="space-y-4">
                  {/* Current Plan Card */}
                  <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-6 border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Current Plan</h4>
                    <div className="flex items-start space-x-3 mb-4">
                      <div className="flex-shrink-0 mt-1">
                        {getTierIcon(tierName)}
                      </div>
                      <div className="flex-1">
                        <p className="text-2xl font-bold text-gray-900 leading-none mb-2">{subscriptionTier}</p>

                        {/* Billing Cycle and Renewal Info */}
                        {billingCycle && billingCycle !== 'lifetime' && (
                          <div className="mb-1">
                            <p className="text-xs font-medium text-gray-700">
                              {billingCycle === 'monthly' ? 'Monthly' : 'Yearly'} Plan
                              {renewalDate && isRecurring && billingCycle === 'monthly' && (
                                <span className="ml-1 text-gray-600">
                                  • Renews on {new Date(renewalDate).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              )}
                              {renewalDate && !isRecurring && (
                                <span className="ml-1 text-orange-600">
                                  • Expires on {new Date(renewalDate).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              )}
                            </p>
                            {/* Yearly Plan End Date */}
                            {billingCycle === 'yearly' && subscriptionEndDate && (
                              <p className="text-xs font-medium text-blue-700 mt-1">
                                📅 Your yearly plan ends on {new Date(subscriptionEndDate).toLocaleDateString('en-US', {
                                  month: 'long',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            )}
                            {billingCycle === 'yearly' && renewalDate && (
                              <p className="text-xs text-gray-600 mt-0.5">
                                Tokens refill monthly on {new Date(renewalDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </p>
                            )}
                          </div>
                        )}

                        {cycleStart && cycleEnd && (
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-3 h-3 text-gray-500" />
                            <p className="text-xs text-gray-600">
                              Billing Period: {new Date(cycleStart).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} - {new Date(cycleEnd).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Usage Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      {/* Tokens */}
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">AI Tokens</span>
                          <span className="text-xs text-gray-500">
                            {tokensLimit === null ? 'Unlimited' : `${formatTokenCount(tokensUsed)} / ${formatTokenCount(tokensLimit)}`}
                          </span>
                        </div>
                        {tokensLimit !== null && (
                          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                (tokensRemaining || 0) / tokensLimit > 0.5
                                  ? 'bg-green-500'
                                  : (tokensRemaining || 0) / tokensLimit > 0.2
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.max(0, Math.min(100, ((tokensRemaining || 0) / tokensLimit) * 100))}%` }}
                            />
                          </div>
                        )}
                        {/* Token Breakdown */}
                        {tokensCarryover > 0 && tokensLimit !== null && (
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <p className="text-xs text-gray-500 mb-1">Token Breakdown:</p>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-gray-600">Tier Allocation:</span>
                                <span className="font-medium text-gray-900">{formatTokenCount(tokensTierLimit)}</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-green-600">+ Carryover:</span>
                                <span className="font-medium text-green-600">{formatTokenCount(tokensCarryover)}</span>
                              </div>
                              <div className="flex justify-between text-xs pt-1 border-t border-gray-200">
                                <span className="text-gray-700 font-medium">Total Available:</span>
                                <span className="font-bold text-gray-900">{formatTokenCount(tokensLimit)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        {tokensLimit === null && (
                          <div className="text-center py-2">
                            <span className="text-xl font-bold text-green-600">∞</span>
                          </div>
                        )}
                      </div>

                      {/* Papers */}
                      <div className="bg-white rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600">Exam Papers</span>
                          <span className="text-xs text-gray-500">
                            {papersLimit === null ? 'Unlimited' : `${papersLimit - (papersRemaining || 0)} / ${papersLimit}`}
                          </span>
                        </div>
                        {papersLimit !== null && (
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                (papersRemaining || 0) / papersLimit > 0.5
                                  ? 'bg-green-500'
                                  : (papersRemaining || 0) / papersLimit > 0.2
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                              }`}
                              style={{ width: `${Math.max(0, Math.min(100, ((papersRemaining || 0) / papersLimit) * 100))}%` }}
                            />
                          </div>
                        )}
                        {papersLimit === null && (
                          <div className="py-3">
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
                              <div className="flex items-center justify-center mb-2">
                                <div className="bg-green-100 rounded-full p-2">
                                  <span className="text-2xl font-bold text-green-600">∞</span>
                                </div>
                              </div>
                              <p className="text-xs text-green-700 text-center font-medium">
                                Unlimited Access
                              </p>
                              <p className="text-[10px] text-gray-600 text-center mt-1">
                                {tierName === 'pro' ? 'Access all exam papers' :
                                 (tierName === 'student' || tierName === 'student_lite') && selectedGrade && selectedSubjects.length > 0 ?
                                 `${selectedGrade} - ${selectedSubjects.length} subject${selectedSubjects.length !== 1 ? 's' : ''}` :
                                 'Access all exam papers'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Update Message */}
                    {updateMessage && (
                      <div className={`mb-4 p-3 rounded-lg border ${
                        updateMessage.type === 'success'
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}>
                        <p className="text-sm">{updateMessage.text}</p>
                      </div>
                    )}

                    {/* Grade and Subjects - Show for Student/Student Lite/Free tiers */}
                    {(tierName === 'student' || tierName === 'student_lite') && (
                      <div className="mb-4">
                        {!selectedGrade && selectedSubjects.length === 0 ? (
                          /* No selections - Show warning and setup button */
                          <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                            <div className="flex items-start space-x-3">
                              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-sm font-semibold text-orange-900 mb-1">
                                  Grade and Subjects Not Selected
                                </p>
                                <p className="text-xs text-orange-800 mb-3">
                                  Please select your grade and subjects to access exam papers. You won't be able to use the paper selection modal or chat assistant until you complete this setup.
                                </p>
                                <button
                                  onClick={() => setShowEditSelections(true)}
                                  className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors text-sm font-medium"
                                >
                                  Select Grade & Subjects
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Selections exist - Show them as read-only (locked after purchase) */
                          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <div className="mb-3">
                              <p className="text-sm font-semibold text-gray-900 mb-1">Your Selected Grade & Subjects</p>
                              <p className="text-xs text-gray-600 mb-3">
                                These are the grade and subjects selected during your subscription purchase.
                              </p>
                            </div>
                            {selectedGrade && (
                              <div className="mb-3">
                                <p className="text-xs text-gray-600 mb-1">Grade:</p>
                                <span className="inline-block px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white">
                                  {selectedGrade}
                                </span>
                              </div>
                            )}
                            {selectedSubjects.length > 0 && (
                              <div>
                                <p className="text-xs text-gray-600 mb-2">
                                  {tierName === 'student_lite' ? 'Subject (Max 1):' : 'Subjects (Max 8):'}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {selectedSubjects.map((subject, index) => (
                                    <span key={index} className="px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white">
                                      {subject}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="mt-3 pt-3 border-t border-blue-200">
                              <p className="text-xs text-gray-600">
                                💡 <span className="font-medium">Need to change your selections?</span> You'll need to purchase a new subscription with your desired grade and subjects.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {(tierName === 'free' && selectedSubjects.length > 0) && (
                      <div className="mb-4">
                        <p className="text-sm text-gray-600 mb-2">
                          Recently Used Subjects (Auto-tracked):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedSubjects.map((subject, index) => (
                            <span key={index} className="px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                              {subject}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Free tier info */}
                    {tierName === 'free' && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-800">
                          <span className="font-semibold">Free Tier Access:</span> You can access your 2 most recently used exam papers from any grade or subject. Your subjects are automatically tracked based on your usage (max 2 subjects).
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => {
                        onClose();
                        if (onOpenSubscriptions) {
                          onOpenSubscriptions();
                        }
                      }}
                      className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 transition-colors font-medium"
                    >
                      Manage Subscription
                    </button>

                    {/* Cancellation Alert */}
                    {cancelAtPeriodEnd && (
                      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start space-x-2">
                          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-yellow-900 mb-1">
                              Subscription Scheduled for Cancellation
                            </p>
                            <p className="text-xs text-yellow-800 mb-2">
                              Your subscription will end on {
                                billingCycle === 'yearly' && subscriptionEndDate
                                  ? new Date(subscriptionEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                  : cycleEnd
                                  ? new Date(cycleEnd).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                                  : 'the end of your billing period'
                              }. You'll have access until then.
                              {billingCycle === 'yearly' && ' Your tokens will continue to refill monthly until your subscription ends.'}
                            </p>
                            {paymentProvider === 'MCB Juice' && (
                              <p className="text-xs text-yellow-700 mb-3 italic">
                                Note: MCB Juice payments require manual renewal. Reactivating will restore access for the current period, but you'll need to make another payment to continue after {cycleEnd ? new Date(cycleEnd).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'this period'}.
                              </p>
                            )}
                            {paymentProvider !== 'MCB Juice' && paymentProvider && (
                              <p className="text-xs text-yellow-700 mb-3 italic">
                                Reactivating will resume automatic billing at the end of your current period.
                              </p>
                            )}
                            <button
                              onClick={handleReactivateSubscription}
                              className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                            >
                              Reactivate Subscription
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cancel Subscription Button - Only show if not already cancelled and not free tier */}
                    {!cancelAtPeriodEnd && tierName !== 'free' && (
                      <button
                        onClick={() => setShowCancelModal(true)}
                        className="w-full mt-3 px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
                      >
                        Cancel Subscription
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'payment-history' && (
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">Payment History</h3>
                <PaymentHistory />
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Cancel Subscription Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setCancellationReason('');
        }}
        onConfirm={handleCancelSubscription}
        title="Cancel Subscription"
        message={
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Are you sure you want to cancel your subscription? You'll continue to have access until the end of your current billing period ({
                billingCycle === 'yearly' && subscriptionEndDate
                  ? new Date(subscriptionEndDate).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : cycleEnd
                  ? new Date(cycleEnd).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  : 'end of period'
              }).
              {billingCycle === 'yearly' && ' Your tokens will continue to refill monthly until your subscription ends.'}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Why are you cancelling? (Optional)
              </label>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-gray-900 resize-none"
                rows={3}
                placeholder="Let us know how we can improve..."
              />
            </div>
          </div>
        }
        type="confirm"
        confirmText={cancelling ? 'Cancelling...' : 'Cancel Subscription'}
        cancelText="Keep Subscription"
        confirmDisabled={cancelling}
      />

      {/* Edit Selections Modal */}
      {showEditSelections && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-y-auto my-8">
            <StudentPackageSelector
              onComplete={handleUpdateSelections}
              onCancel={() => setShowEditSelections(false)}
              maxSubjects={tierName === 'student_lite' ? 1 : 8}
            />
          </div>
        </div>
      )}
    </div>
  );
}
