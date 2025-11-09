import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Server, Database, Zap, Save, RefreshCw, Calendar, Phone } from 'lucide-react';

interface CacheSetting {
  useGeminiCache: boolean;
}

interface StudyPlanFeatureSetting {
  enabled: boolean;
}

export function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useGeminiCache, setUseGeminiCache] = useState(false);
  const [studyPlanEnabled, setStudyPlanEnabled] = useState(false);
  const [mcbJuicePhoneNumber, setMcbJuicePhoneNumber] = useState('5822 2428');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);

      // Fetch cache mode setting
      const { data: cacheData, error: cacheError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'ai_cache_mode')
        .single();

      if (cacheError) throw cacheError;

      if (cacheData) {
        const cacheSetting = cacheData.setting_value as CacheSetting;
        setUseGeminiCache(cacheSetting.useGeminiCache);
      }

      // Fetch study plan feature flag
      const { data: studyPlanData, error: studyPlanError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'study_plan_enabled')
        .single();

      if (studyPlanError && studyPlanError.code !== 'PGRST116') {
        throw studyPlanError;
      }

      if (studyPlanData) {
        const studyPlanSetting = studyPlanData.setting_value as StudyPlanFeatureSetting;
        setStudyPlanEnabled(studyPlanSetting.enabled || false);
      }

      // Fetch MCB Juice phone number
      const { data: mcbPhoneData, error: mcbPhoneError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'mcb_juice_phone_number')
        .single();

      if (mcbPhoneError && mcbPhoneError.code !== 'PGRST116') {
        throw mcbPhoneError;
      }

      if (mcbPhoneData) {
        const phoneNumber = mcbPhoneData.setting_value?.phone_number;
        if (phoneNumber) {
          setMcbJuicePhoneNumber(phoneNumber);
        }
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      // Update cache mode
      const { error: cacheError } = await supabase
        .from('system_settings')
        .update({
          setting_value: { useGeminiCache },
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'ai_cache_mode');

      if (cacheError) throw cacheError;

      // Update study plan feature flag
      const { error: studyPlanError } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: 'study_plan_enabled',
          setting_value: { enabled: studyPlanEnabled },
          description: 'Enable or disable the study plan feature globally. When disabled, the study plan will be completely hidden from all users including paid tiers.',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });

      if (studyPlanError) throw studyPlanError;

      // Update MCB Juice phone number
      const { error: mcbPhoneError } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: 'mcb_juice_phone_number',
          setting_value: { phone_number: mcbJuicePhoneNumber },
          description: 'MCB Juice phone number for manual transfers. Displayed to users during payment.',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });

      if (mcbPhoneError) throw mcbPhoneError;

      setMessage({ type: 'success', text: 'Settings saved successfully!' });

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">System Settings</h2>
        <p className="text-sm text-gray-600">
          Configure application-wide settings for the AI assistant and caching system
        </p>
      </div>

      {/* AI Cache Mode Section */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Zap className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">AI Caching Mode</h3>
            <p className="text-sm text-gray-600">Choose how conversation context is cached</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Gemini Cache Option */}
          <label className="flex items-start space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50"
            style={{ borderColor: useGeminiCache ? '#4F46E5' : '#E5E7EB' }}>
            <input
              type="radio"
              name="cacheMode"
              checked={useGeminiCache}
              onChange={() => setUseGeminiCache(true)}
              className="mt-1 w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <Server className="w-4 h-4 text-gray-700" />
                <span className="font-semibold text-gray-900">Gemini Built-in Cache</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  Recommended
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Uses Gemini 2.0 Flash's context caching API. Significantly reduces costs and improves performance
                for follow-up questions. Images and context are cached by Gemini.
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <strong>Model:</strong> gemini-2.0-flash (stable, supports caching)<br />
                <strong>Pros:</strong> Lower cost, faster responses, no database storage needed<br />
                <strong>Cost:</strong> ~90% reduction on follow-up questions
              </div>
            </div>
          </label>

          {/* Own Cache Option */}
          <label className="flex items-start space-x-3 p-4 border-2 rounded-lg cursor-pointer transition-all hover:bg-gray-50"
            style={{ borderColor: !useGeminiCache ? '#4F46E5' : '#E5E7EB' }}>
            <input
              type="radio"
              name="cacheMode"
              checked={!useGeminiCache}
              onChange={() => setUseGeminiCache(false)}
              className="mt-1 w-4 h-4 text-indigo-600 focus:ring-indigo-500"
            />
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <Database className="w-4 h-4 text-gray-700" />
                <span className="font-semibold text-gray-900">Own Database Cache</span>
                <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-medium">
                  Legacy
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Stores conversation history in your database and sends it to Gemini on each follow-up.
                No images re-sent, but conversation text is sent each time.
              </p>
              <div className="mt-2 text-xs text-gray-500">
                <strong>Model:</strong> gemini-2.0-flash-exp (experimental, original model)<br />
                <strong>Pros:</strong> Full control, conversation stored in your database<br />
                <strong>Cost:</strong> Higher token usage on follow-ups (conversation history sent)
              </div>
            </div>
          </label>
        </div>

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> All conversations are always saved to your database for user history,
            regardless of cache mode. This setting only affects how context is sent to Gemini AI.
            The model is automatically selected based on your cache mode choice.
          </p>
        </div>

        <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-700 leading-relaxed">
            <strong>API Keys Configuration:</strong><br />
            • Gemini Cache Mode: Set <code className="px-1 py-0.5 bg-gray-200 rounded text-xs">GEMINI_CACHE_API_KEY</code> environment variable<br />
            • Database Cache Mode: Set <code className="px-1 py-0.5 bg-gray-200 rounded text-xs">GEMINI_ASSISTANT_API_KEY</code> or <code className="px-1 py-0.5 bg-gray-200 rounded text-xs">GEMINI_API_KEY</code><br />
            All API keys must be configured as Supabase secrets for security.
          </p>
        </div>
      </div>

      {/* Study Plan Feature Flag Section */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Calendar className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Study Plan Feature</h3>
            <p className="text-sm text-gray-600">Enable or disable the AI-powered study plan feature globally</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border-2 rounded-lg" style={{ borderColor: studyPlanEnabled ? '#9333EA' : '#E5E7EB' }}>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-semibold text-gray-900">Study Plan Feature Status</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  studyPlanEnabled
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {studyPlanEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {studyPlanEnabled
                  ? 'Study plan is visible to users with paid tiers that have study plan access enabled.'
                  : 'Study plan is completely hidden from all users, including paid tiers.'}
              </p>
            </div>
            <button
              onClick={() => setStudyPlanEnabled(!studyPlanEnabled)}
              className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ml-4 ${
                studyPlanEnabled ? 'bg-purple-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  studyPlanEnabled ? 'translate-x-9' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <h4 className="text-sm font-semibold text-amber-900 mb-2">Development Phase Notice</h4>
            <p className="text-xs text-amber-800 leading-relaxed">
              <strong>Purpose:</strong> This feature flag is designed for the development phase. Keep it disabled in production
              until the study plan feature is fully tested and ready for release.<br /><br />
              <strong>When Disabled:</strong> The study plan page, navigation links, and all related UI will be completely hidden from the application.<br />
              <strong>When Enabled:</strong> Only users with paid tier subscriptions (Student or Pro) that have "Study Plan Access" enabled in Tier Config will see the feature.
            </p>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Access Control:</strong> Even when enabled globally, users must have a paid subscription tier with
              "Study Plan Access" enabled (configured in Tier Configuration). Free tier users will see a message prompting them to upgrade.
            </p>
          </div>
        </div>
      </div>

      {/* MCB Juice Phone Number Section */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-red-100 rounded-lg">
            <Phone className="w-5 h-5 text-red-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">MCB Juice Phone Number</h3>
            <p className="text-sm text-gray-600">Configure the phone number for MCB Juice manual transfers</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 border-2 rounded-lg border-gray-200">
            <label htmlFor="mcb-phone" className="block text-sm font-semibold text-gray-900 mb-2">
              Transfer Phone Number
            </label>
            <input
              id="mcb-phone"
              type="text"
              value={mcbJuicePhoneNumber}
              onChange={(e) => setMcbJuicePhoneNumber(e.target.value)}
              placeholder="e.g., 5822 2428"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent text-lg font-mono"
            />
            <p className="mt-2 text-xs text-gray-500">
              This number will be displayed to users on the MCB Juice payment screen. Format: XXXX XXXX
            </p>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Display Location:</strong> This phone number is prominently displayed on the MCB Juice payment page,
              so users know where to send their manual transfer. Make sure this number is always up to date and monitored.
            </p>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> Any changes to this number will take effect immediately for all new payment screens.
              Ensure the number is correct before saving to avoid payment issues.
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200">
        {message && (
          <div className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            <span className="text-sm font-medium">{message.text}</span>
          </div>
        )}
        {!message && <div />}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center space-x-2 px-6 py-2.5 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Settings</span>
            </>
          )}
        </button>
      </div>

      {/* Info Box */}
      <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-yellow-900 mb-2">Impact of Changes</h4>
        <ul className="text-sm text-yellow-800 space-y-1">
          <li>• Changes take effect immediately for new conversations</li>
          <li>• Existing conversations will continue using their original cache mode</li>
          <li>• Switching to Gemini cache will create new cache entries on first question</li>
          <li>• Monitor your Gemini API usage to optimize costs</li>
        </ul>
      </div>
    </div>
  );
}
