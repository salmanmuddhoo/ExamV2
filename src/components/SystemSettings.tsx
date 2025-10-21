import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Server, Database, Zap, Save, RefreshCw } from 'lucide-react';

interface CacheSetting {
  useGeminiCache: boolean;
}

interface GeminiModelSetting {
  model: string;
}

export function SystemSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useGeminiCache, setUseGeminiCache] = useState(false);
  const [geminiModel, setGeminiModel] = useState('gemini-2.0-flash-exp');
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

      // Fetch Gemini model setting
      const { data: modelData, error: modelError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'gemini_model')
        .single();

      if (modelError) throw modelError;

      if (modelData) {
        const modelSetting = modelData.setting_value as GeminiModelSetting;
        setGeminiModel(modelSetting.model);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
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

      // Update Gemini model
      const { error: modelError } = await supabase
        .from('system_settings')
        .update({
          setting_value: { model: geminiModel },
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'gemini_model');

      if (modelError) throw modelError;

      setMessage({ type: 'success', text: 'Settings saved successfully!' });

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
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
          </p>
        </div>
      </div>

      {/* Gemini Model Section */}
      <div className="border border-gray-200 rounded-lg p-6 bg-white">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Server className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Gemini Model</h3>
            <p className="text-sm text-gray-600">Select the Gemini AI model to use</p>
          </div>
        </div>

        <select
          value={geminiModel}
          onChange={(e) => setGeminiModel(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash (Experimental) - Recommended</option>
          <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
          <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
        </select>

        <p className="mt-2 text-xs text-gray-500">
          Gemini 2.0 Flash offers the best performance and cost efficiency with context caching support.
        </p>
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
