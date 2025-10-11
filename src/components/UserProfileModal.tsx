import { useState, useRef, useEffect } from 'react';
import { X, User, CreditCard, History, Settings, Camera, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PaymentHistory } from './PaymentHistory';
import { supabase } from '../lib/supabase';

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
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const fetchSubscriptionTier = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select(`
          subscription_tiers(name, display_name),
          selected_grade_id,
          selected_subject_ids,
          grade_levels(name),
          subjects:selected_subject_ids
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        setSubscriptionTier('No active subscription');
      } else {
        const tierName = (data.subscription_tiers as any)?.display_name || 'Unknown';
        setSubscriptionTier(tierName);

        // If student package, fetch grade and subjects
        if (data.selected_grade_id && data.grade_levels) {
          setSelectedGrade((data.grade_levels as any)?.name || '');
        }

        // Fetch subject names if student package
        if (data.selected_subject_ids && data.selected_subject_ids.length > 0) {
          const { data: subjects, error: subjectsError } = await supabase
            .from('subjects')
            .select('name')
            .in('id', data.selected_subject_ids);

          if (!subjectsError && subjects) {
            setSelectedSubjects(subjects.map(s => s.name));
          }
        }
      }
    } catch (error) {
      console.error('Error fetching subscription tier:', error);
      setSubscriptionTier('Unknown');
    }
  };

  if (!isOpen || !user || !profile) return null;

  const tabs = [
    { id: 'general' as TabType, label: 'General', icon: User },
    { id: 'subscription' as TabType, label: 'Subscription', icon: CreditCard },
    { id: 'payment-history' as TabType, label: 'Payment History', icon: History },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      onClose();
    } catch (error) {
      console.error('Error signing out:', error);
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
        console.error('Upload error:', uploadError);
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
      console.error('Error uploading image:', error);
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
      console.error('Error updating profile:', error);
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
            <div className="md:hidden overflow-x-auto">
              <nav className="flex p-2 space-x-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex-shrink-0 flex flex-col items-center space-y-1 px-3 py-2 rounded-lg transition-colors ${
                        activeTab === tab.id
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="font-medium text-xs whitespace-nowrap">{tab.label}</span>
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

                  {/* Subscription Tier */}
                  <div>
                    <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">Subscription Plan</label>
                    <input
                      type="text"
                      value={subscriptionTier}
                      disabled
                      className="w-full px-3 md:px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900 text-sm"
                    />
                    {profile.role === 'admin' && (
                      <p className="text-xs text-gray-500 mt-1">You have administrator access</p>
                    )}
                  </div>

                  {/* Student Package Details */}
                  {(selectedGrade || selectedSubjects.length > 0) && (
                    <div className="col-span-1 sm:col-span-2 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3">Student Package Selection</h4>

                      {selectedGrade && (
                        <div className="mb-3">
                          <p className="text-xs text-gray-600 mb-1">Grade Level</p>
                          <div className="inline-flex items-center px-3 py-1.5 bg-white border border-blue-300 rounded-lg">
                            <span className="text-sm font-medium text-gray-900">{selectedGrade}</span>
                          </div>
                        </div>
                      )}

                      {selectedSubjects.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-600 mb-2">Selected Subjects ({selectedSubjects.length})</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedSubjects.map((subject, index) => (
                              <div
                                key={index}
                                className="inline-flex items-center px-3 py-1.5 bg-white border border-blue-300 rounded-lg"
                              >
                                <span className="text-sm font-medium text-gray-900">{subject}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-gray-500 mt-3 italic">
                        These selections apply to your exam paper access and AI assistance.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">My Subscription</h3>
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg p-6 border border-gray-200">
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">Current Plan</h4>
                    <p className="text-2xl font-bold text-gray-900">{subscriptionTier}</p>
                    {selectedGrade && (
                      <p className="text-sm text-gray-600 mt-2">Grade: {selectedGrade}</p>
                    )}
                    {selectedSubjects.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm text-gray-600">Subjects:</p>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {selectedSubjects.map((subject, index) => (
                            <span key={index} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs">
                              {subject}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
                </div>
              </div>
            )}

            {activeTab === 'payment-history' && (
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">Payment History</h3>
                <PaymentHistory />
              </div>
            )}

            {activeTab === 'settings' && (
              <div>
                <h3 className="text-base md:text-lg font-bold text-gray-900 mb-4 md:mb-6">Settings</h3>
                <div className="space-y-4 md:space-y-6">
                  {/* Email Notifications */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Email Notifications</h4>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                          defaultChecked
                        />
                        <span className="text-sm text-gray-700">Receive updates about new exam papers</span>
                      </label>
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                          defaultChecked
                        />
                        <span className="text-sm text-gray-700">Subscription renewal reminders</span>
                      </label>
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                        />
                        <span className="text-sm text-gray-700">Marketing and promotional emails</span>
                      </label>
                    </div>
                  </div>

                  {/* Privacy */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Privacy</h4>
                    <div className="space-y-3">
                      <label className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                          defaultChecked
                        />
                        <span className="text-sm text-gray-700">Allow data collection for improvement</span>
                      </label>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="pt-6 border-t border-gray-200">
                    <h4 className="text-sm font-semibold text-red-600 mb-3">Danger Zone</h4>
                    <button
                      className="px-4 py-2 border border-red-600 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium"
                    >
                      Delete Account
                    </button>
                    <p className="text-xs text-gray-500 mt-2">
                      Once deleted, your account cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
