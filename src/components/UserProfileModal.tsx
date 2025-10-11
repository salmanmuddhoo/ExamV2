import { useState, useRef, useEffect } from 'react';
import { X, User, CreditCard, History, Settings, Camera, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { SubscriptionManager } from './SubscriptionManager';
import { supabase } from '../lib/supabase';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'general' | 'subscription' | 'payment-history' | 'settings';

export function UserProfileModal({ isOpen, onClose }: UserProfileModalProps) {
  const { user, profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [firstName, setFirstName] = useState(profile?.first_name || '');
  const [lastName, setLastName] = useState(profile?.last_name || '');
  const [profilePicture, setProfilePicture] = useState(profile?.profile_picture_url || '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [subscriptionTier, setSubscriptionTier] = useState<string>('Loading...');
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

  const fetchSubscriptionTier = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('subscription_tiers(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error || !data) {
        setSubscriptionTier('No active subscription');
      } else {
        const tierName = (data.subscription_tiers as any)?.name || 'Unknown';
        // Capitalize first letter
        setSubscriptionTier(tierName.charAt(0).toUpperCase() + tierName.slice(1));
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
      <div className="bg-white rounded-lg w-full max-w-4xl h-[80vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <h2 className="text-xl font-bold text-gray-900">My Profile</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Tabs */}
          <div className="w-64 border-r border-gray-200 bg-gray-50 p-4">
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

          {/* Right Content Area */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-6">General Information</h3>

                {successMessage && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <p className="text-sm text-green-800">{successMessage}</p>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Profile Picture */}
                  <div className="flex items-center space-x-4">
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
                    <div>
                      <p className="text-sm font-medium text-gray-900">Profile Picture</p>
                      <p className="text-xs text-gray-500">Click the camera icon to upload (max 5MB)</p>
                    </div>
                  </div>

                  {/* First Name and Last Name - Side by Side */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        onBlur={handleFirstNameBlur}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Enter your first name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        onBlur={handleLastNameBlur}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:border-gray-900 transition-colors"
                        placeholder="Enter your last name"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <input
                      type="email"
                      value={profile.email}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                    />
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>

                  {/* Subscription Tier */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Subscription Plan</label>
                    <input
                      type="text"
                      value={subscriptionTier}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
                    />
                    {profile.role === 'admin' && (
                      <p className="text-xs text-gray-500 mt-1">You have administrator access</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'subscription' && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-6">Subscription Management</h3>
                <SubscriptionManager />
              </div>
            )}

            {activeTab === 'payment-history' && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-6">Payment History</h3>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                  <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No payment history available yet.</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Once you make a payment, your transaction history will appear here.
                  </p>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-6">Settings</h3>
                <div className="space-y-6">
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
