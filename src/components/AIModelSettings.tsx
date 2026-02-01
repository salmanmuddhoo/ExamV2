import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Brain, Save, RefreshCw, CheckCircle, Edit, X, DollarSign, Plus, Trash2, Eye, EyeOff } from 'lucide-react';

interface AIModel {
  id: string;
  provider: string;
  model_name: string;
  display_name: string;
  description: string;
  token_multiplier: number;
  supports_vision: boolean;
  supports_caching: boolean;
  is_active: boolean;
  is_default: boolean;
  input_token_cost_per_million: number;
  output_token_cost_per_million: number;
  max_context_tokens?: number;
  max_output_tokens?: number;
  api_endpoint?: string;
  temperature_default?: number;
}

interface AllowedModelsConfig {
  modelIds: string[];
}

interface NewModelForm {
  provider: string;
  model_name: string;
  display_name: string;
  description: string;
  token_multiplier: number;
  input_token_cost_per_million: number;
  output_token_cost_per_million: number;
  supports_vision: boolean;
  supports_caching: boolean;
  max_context_tokens: number;
  max_output_tokens: number;
  api_endpoint: string;
  temperature_default: number;
}

export function AIModelSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiModels, setAiModels] = useState<AIModel[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [adminUploadModelId, setAdminUploadModelId] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingPrices, setEditingPrices] = useState<Record<string, boolean>>({});
  const [priceChanges, setPriceChanges] = useState<Record<string, { input: number; output: number }>>({});
  const [showInactive, setShowInactive] = useState(true);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newModelForm, setNewModelForm] = useState<NewModelForm>({
    provider: 'gemini',
    model_name: '',
    display_name: '',
    description: '',
    token_multiplier: 1.0,
    input_token_cost_per_million: 0.30,
    output_token_cost_per_million: 2.50,
    supports_vision: true,
    supports_caching: false,
    max_context_tokens: 1000000,
    max_output_tokens: 8192,
    api_endpoint: '',
    temperature_default: 0.7
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);

      // Fetch ALL AI models (both active and inactive)
      const { data: models, error: modelsError } = await supabase
        .from('ai_models')
        .select('*')
        .order('provider', { ascending: true })
        .order('display_name', { ascending: true });

      if (modelsError) throw modelsError;
      setAiModels(models || []);

      // Fetch current allowed models setting
      const { data: settingData, error: settingError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'allowed_ai_models')
        .maybeSingle();

      if (settingError && settingError.code !== 'PGRST116') {
        throw settingError;
      }

      if (settingData && settingData.setting_value) {
        const config = settingData.setting_value as AllowedModelsConfig;
        setSelectedModelIds(config.modelIds || []);
      } else {
        // Default: allow all active models if not configured
        setSelectedModelIds(models?.filter(m => m.is_active).map(m => m.id) || []);
      }

      // Fetch admin upload model setting
      const { data: uploadModelData, error: uploadModelError } = await supabase
        .from('system_settings')
        .select('setting_value')
        .eq('setting_key', 'admin_upload_model')
        .maybeSingle();

      if (uploadModelError && uploadModelError.code !== 'PGRST116') {
        console.error('Error fetching upload model:', uploadModelError);
      }

      if (uploadModelData && uploadModelData.setting_value) {
        setAdminUploadModelId(uploadModelData.setting_value as string);
      } else {
        // Default: use Gemini 2.5 Flash or first active model
        const defaultModel = models?.find(m => m.model_name === 'gemini-2.5-flash' && m.is_active) || models?.find(m => m.is_active);
        if (defaultModel) {
          setAdminUploadModelId(defaultModel.id);
        }
      }
    } catch (error) {
      console.error('Error fetching AI model settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleModel = (modelId: string) => {
    setSelectedModelIds(prev => {
      if (prev.includes(modelId)) {
        // Don't allow deselecting all models - at least one must be selected
        if (prev.length === 1) {
          setMessage({ type: 'error', text: 'At least one AI model must be enabled' });
          setTimeout(() => setMessage(null), 3000);
          return prev;
        }
        return prev.filter(id => id !== modelId);
      } else {
        return [...prev, modelId];
      }
    });
  };

  const handleToggleActive = async (modelId: string, currentActive: boolean) => {
    try {
      // Don't allow deactivating the last active model
      const activeModels = aiModels.filter(m => m.is_active);
      if (currentActive && activeModels.length === 1) {
        setMessage({ type: 'error', text: 'Cannot deactivate the last active model. At least one model must remain active.' });
        setTimeout(() => setMessage(null), 3000);
        return;
      }

      const { error } = await supabase
        .from('ai_models')
        .update({ is_active: !currentActive, updated_at: new Date().toISOString() })
        .eq('id', modelId);

      if (error) throw error;

      // Update local state
      setAiModels(prev => prev.map(model =>
        model.id === modelId ? { ...model, is_active: !currentActive } : model
      ));

      // If deactivating, remove from selected models
      if (currentActive) {
        setSelectedModelIds(prev => prev.filter(id => id !== modelId));
      }

      setMessage({ type: 'success', text: `Model ${currentActive ? 'deactivated' : 'activated'} successfully!` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error toggling model status:', error);
      setMessage({ type: 'error', text: 'Failed to update model status' });
    }
  };

  const handleDeleteModel = async (modelId: string, modelName: string) => {
    if (!confirm(`Are you sure you want to delete "${modelName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('ai_models')
        .delete()
        .eq('id', modelId);

      if (error) throw error;

      // Update local state
      setAiModels(prev => prev.filter(model => model.id !== modelId));
      setSelectedModelIds(prev => prev.filter(id => id !== modelId));

      setMessage({ type: 'success', text: 'Model deleted successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error deleting model:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to delete model' });
    }
  };

  const handleAddNewModel = async () => {
    try {
      if (!newModelForm.model_name || !newModelForm.display_name) {
        setMessage({ type: 'error', text: 'Please fill in all required fields' });
        return;
      }

      const { data, error } = await supabase
        .from('ai_models')
        .insert([{
          provider: newModelForm.provider,
          model_name: newModelForm.model_name,
          display_name: newModelForm.display_name,
          description: newModelForm.description,
          token_multiplier: newModelForm.token_multiplier,
          input_token_cost_per_million: newModelForm.input_token_cost_per_million,
          output_token_cost_per_million: newModelForm.output_token_cost_per_million,
          supports_vision: newModelForm.supports_vision,
          supports_caching: newModelForm.supports_caching,
          max_context_tokens: newModelForm.max_context_tokens,
          max_output_tokens: newModelForm.max_output_tokens,
          api_endpoint: newModelForm.api_endpoint,
          temperature_default: newModelForm.temperature_default,
          is_active: true,
          is_default: false
        }])
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setAiModels(prev => [...prev, data]);
      setIsAddingNew(false);
      setNewModelForm({
        provider: 'gemini',
        model_name: '',
        display_name: '',
        description: '',
        token_multiplier: 1.0,
        input_token_cost_per_million: 0.30,
        output_token_cost_per_million: 2.50,
        supports_vision: true,
        supports_caching: false,
        max_context_tokens: 1000000,
        max_output_tokens: 8192,
        api_endpoint: '',
        temperature_default: 0.7
      });

      setMessage({ type: 'success', text: 'Model added successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Error adding model:', error);
      setMessage({ type: 'error', text: error.message || 'Failed to add model' });
    }
  };

  const handleStartEditPrice = (modelId: string, model: AIModel) => {
    setEditingPrices(prev => ({ ...prev, [modelId]: true }));
    setPriceChanges(prev => ({
      ...prev,
      [modelId]: {
        input: model.input_token_cost_per_million,
        output: model.output_token_cost_per_million
      }
    }));
  };

  const handleCancelEditPrice = (modelId: string) => {
    setEditingPrices(prev => ({ ...prev, [modelId]: false }));
    setPriceChanges(prev => {
      const updated = { ...prev };
      delete updated[modelId];
      return updated;
    });
  };

  const handlePriceChange = (modelId: string, field: 'input' | 'output', value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setPriceChanges(prev => ({
        ...prev,
        [modelId]: {
          ...prev[modelId],
          [field]: numValue
        }
      }));
    }
  };

  const handleSavePrices = async (modelId: string) => {
    try {
      const changes = priceChanges[modelId];
      if (!changes) return;

      const { error } = await supabase
        .from('ai_models')
        .update({
          input_token_cost_per_million: changes.input,
          output_token_cost_per_million: changes.output,
          updated_at: new Date().toISOString()
        })
        .eq('id', modelId);

      if (error) throw error;

      // Update local state
      setAiModels(prev => prev.map(model =>
        model.id === modelId
          ? { ...model, input_token_cost_per_million: changes.input, output_token_cost_per_million: changes.output }
          : model
      ));

      setEditingPrices(prev => ({ ...prev, [modelId]: false }));
      setMessage({ type: 'success', text: 'Prices updated successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error updating prices:', error);
      setMessage({ type: 'error', text: 'Failed to update prices' });
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage(null);

      if (selectedModelIds.length === 0) {
        setMessage({ type: 'error', text: 'At least one AI model must be enabled' });
        return;
      }

      if (!adminUploadModelId) {
        setMessage({ type: 'error', text: 'Please select a model for admin uploads' });
        return;
      }

      // Update or insert the allowed models setting
      const { error: allowedError } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: 'allowed_ai_models',
          setting_value: { modelIds: selectedModelIds },
          description: 'List of AI model IDs that students are allowed to select from in their settings',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });

      if (allowedError) throw allowedError;

      // Update or insert the admin upload model setting
      const { error: uploadError } = await supabase
        .from('system_settings')
        .upsert({
          setting_key: 'admin_upload_model',
          setting_value: adminUploadModelId,
          description: 'AI model ID used for admin operations (syllabus extraction, exam paper processing)',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });

      if (uploadError) throw uploadError;

      setMessage({ type: 'success', text: 'AI model settings saved successfully!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving AI model settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'gemini':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0L9.798 2.202L4.596 7.404L2.394 9.606L0 12l2.394 2.394l2.202 2.202l5.202 5.202L12 24l2.202-2.202l5.202-5.202l2.202-2.202L24 12l-2.394-2.394-2.202-2.202-5.202-5.202L12 0zm0 3.515l1.768 1.768l4.95 4.95l1.768 1.768L12 20.485l-8.485-8.485L12 3.515z"/>
          </svg>
        );
      case 'claude':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.3 5.3c-1.5-1.5-3.9-1.5-5.4 0L8.7 8.5c-1.5 1.5-1.5 3.9 0 5.4l.4.4c.3.3.7.3 1 0 .3-.3.3-.7 0-1l-.4-.4c-.9-.9-.9-2.3 0-3.2l3.2-3.2c.9-.9 2.3-.9 3.2 0s.9 2.3 0 3.2l-1.3 1.3c.1.5.1 1 0 1.5l2-2c1.5-1.5 1.5-3.9 0-5.4zm-5.9 8.4c-.3-.3-.7-.3-1 0-.3.3-.3.7 0 1l.4.4c.9.9.9 2.3 0 3.2l-3.2 3.2c-.9.9-2.3.9-3.2 0s-.9-2.3 0-3.2l1.3-1.3c-.1-.5-.1-1 0-1.5l-2 2c-1.5 1.5-1.5 3.9 0 5.4 1.5 1.5 3.9 1.5 5.4 0l3.2-3.2c1.5-1.5 1.5-3.9 0-5.4l-.4-.4z"/>
          </svg>
        );
      case 'openai':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"/>
          </svg>
        );
      default:
        return <Brain className="w-5 h-5" />;
    }
  };

  const getProviderLabel = (provider: string) => {
    switch (provider) {
      case 'gemini': return 'Google Gemini';
      case 'claude': return 'Anthropic Claude';
      case 'openai': return 'OpenAI';
      default: return provider;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Loading AI model settings...</p>
        </div>
      </div>
    );
  }

  // Filter models based on showInactive toggle
  const displayModels = showInactive ? aiModels : aiModels.filter(m => m.is_active);

  // Group models by provider
  const groupedModels = displayModels.reduce((acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  }, {} as Record<string, AIModel[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">AI Model Selection Settings</h2>
          <p className="text-sm text-gray-600">
            Manage all AI models in the system. Add new models, edit pricing, activate/deactivate, or delete models.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </button>
          <button
            onClick={() => setIsAddingNew(true)}
            className="px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add New Model
          </button>
        </div>
      </div>

      {/* Message Alert */}
      {message && (
        <div className={`p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}

      {/* Add New Model Form */}
      {isAddingNew && (
        <div className="border-2 border-purple-500 rounded-lg p-6 bg-purple-50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Add New AI Model</h3>
            <button
              onClick={() => setIsAddingNew(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider *</label>
              <select
                value={newModelForm.provider}
                onChange={(e) => setNewModelForm({ ...newModelForm, provider: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="gemini">Google Gemini</option>
                <option value="claude">Anthropic Claude</option>
                <option value="openai">OpenAI</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model Name * (e.g., gpt-4o)</label>
              <input
                type="text"
                value={newModelForm.model_name}
                onChange={(e) => setNewModelForm({ ...newModelForm, model_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="gemini-2.5-flash"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name *</label>
              <input
                type="text"
                value={newModelForm.display_name}
                onChange={(e) => setNewModelForm({ ...newModelForm, display_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Gemini 2.5 Flash"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Token Multiplier</label>
              <input
                type="number"
                step="0.1"
                value={newModelForm.token_multiplier}
                onChange={(e) => setNewModelForm({ ...newModelForm, token_multiplier: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Input Cost (per 1M tokens)</label>
              <input
                type="number"
                step="0.01"
                value={newModelForm.input_token_cost_per_million}
                onChange={(e) => setNewModelForm({ ...newModelForm, input_token_cost_per_million: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Output Cost (per 1M tokens)</label>
              <input
                type="number"
                step="0.01"
                value={newModelForm.output_token_cost_per_million}
                onChange={(e) => setNewModelForm({ ...newModelForm, output_token_cost_per_million: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={newModelForm.description}
                onChange={(e) => setNewModelForm({ ...newModelForm, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                placeholder="Model description..."
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newModelForm.supports_vision}
                  onChange={(e) => setNewModelForm({ ...newModelForm, supports_vision: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">Supports Vision</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={newModelForm.supports_caching}
                  onChange={(e) => setNewModelForm({ ...newModelForm, supports_caching: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-sm text-gray-700">Supports Caching</span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setIsAddingNew(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleAddNewModel}
              className="px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Add Model
            </button>
          </div>
        </div>
      )}

      {/* AI Models Section */}
      <div className="border border-gray-200 rounded-lg p-4 sm:p-6 bg-white">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Brain className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">All AI Models ({displayModels.length})</h3>
            <p className="text-sm text-gray-600">Configure models that students can select from</p>
          </div>
        </div>

        <div className="space-y-6">
          {Object.entries(groupedModels).map(([provider, models]) => (
            <div key={provider} className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
                {getProviderIcon(provider)}
                {getProviderLabel(provider)}
              </h4>

              <div className="space-y-3">
                {models.map(model => {
                  const isSelected = selectedModelIds.includes(model.id);
                  const isDefault = model.is_default;
                  const isActive = model.is_active;

                  const isEditing = editingPrices[model.id];
                  const currentPrices = priceChanges[model.id] || {
                    input: model.input_token_cost_per_million,
                    output: model.output_token_cost_per_million
                  };

                  return (
                    <div
                      key={model.id}
                      className={`border-2 rounded-lg p-4 transition-all ${
                        !isActive
                          ? 'border-gray-300 bg-gray-50 opacity-75'
                          : isSelected
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          {isActive && (
                            <div
                              className="flex-shrink-0 mt-1 cursor-pointer"
                              onClick={() => handleToggleModel(model.id)}
                            >
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'bg-purple-600 border-purple-600'
                                  : 'bg-white border-gray-300'
                              }`}>
                                {isSelected && <CheckCircle className="w-4 h-4 text-white" />}
                              </div>
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="font-semibold text-gray-900 text-sm sm:text-base">{model.display_name}</span>
                              {!isActive && (
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-700 text-xs font-medium rounded">
                                  Inactive
                                </span>
                              )}
                              {isDefault && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                  Default
                                </span>
                              )}
                              {model.token_multiplier > 1 && (
                                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">
                                  {model.token_multiplier}x tokens
                                </span>
                              )}
                            </div>

                            <p className="text-xs sm:text-sm text-gray-600 mb-3">{model.description}</p>

                            {/* Pricing Section */}
                            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1 text-xs font-semibold text-gray-700">
                                  <DollarSign className="w-3 h-3" />
                                  <span>Pricing (per 1M tokens)</span>
                                </div>
                                {!isEditing ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleStartEditPrice(model.id, model);
                                    }}
                                    className="text-purple-600 hover:text-purple-700 p-1 rounded hover:bg-purple-100 transition-colors"
                                    title="Edit prices"
                                  >
                                    <Edit className="w-3 h-3" />
                                  </button>
                                ) : (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSavePrices(model.id);
                                      }}
                                      className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-100 transition-colors"
                                      title="Save prices"
                                    >
                                      <Save className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleCancelEditPrice(model.id);
                                      }}
                                      className="text-gray-600 hover:text-gray-700 p-1 rounded hover:bg-gray-100 transition-colors"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              {!isEditing ? (
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-gray-600">Input:</span>
                                    <span className="ml-1 font-semibold text-gray-900">
                                      ${model.input_token_cost_per_million.toFixed(4)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Output:</span>
                                    <span className="ml-1 font-semibold text-gray-900">
                                      ${model.output_token_cost_per_million.toFixed(4)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">Input:</label>
                                    <input
                                      type="number"
                                      step="0.0001"
                                      min="0"
                                      value={currentPrices.input}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        handlePriceChange(model.id, 'input', e.target.value);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs text-gray-600 mb-1">Output:</label>
                                    <input
                                      type="number"
                                      step="0.0001"
                                      min="0"
                                      value={currentPrices.output}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        handlePriceChange(model.id, 'output', e.target.value);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                              {model.supports_vision && (
                                <span className="inline-flex items-center">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                    <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                                  </svg>
                                  Vision
                                </span>
                              )}
                              {model.supports_caching && (
                                <span className="inline-flex items-center">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                  </svg>
                                  Caching
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 ml-3">
                          <button
                            onClick={() => handleToggleActive(model.id, model.is_active)}
                            className={`p-2 rounded-lg transition-colors ${
                              isActive
                                ? 'text-gray-600 hover:bg-gray-100'
                                : 'text-green-600 hover:bg-green-100'
                            }`}
                            title={isActive ? 'Deactivate model' : 'Activate model'}
                          >
                            {isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => handleDeleteModel(model.id, model.display_name)}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete model"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Admin Upload Model */}
      <div className="border border-gray-200 rounded-lg p-4 sm:p-6 bg-white">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Admin Upload Model</h3>
          <p className="text-sm text-gray-600">
            Select the AI model to use for admin operations (syllabus extraction, exam paper processing)
          </p>
        </div>

        <select
          value={adminUploadModelId}
          onChange={(e) => setAdminUploadModelId(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="">Select a model...</option>
          {aiModels.filter(m => m.is_active).map(model => (
            <option key={model.id} value={model.id}>
              {model.display_name} ({model.provider})
            </option>
          ))}
        </select>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              Save Settings
            </>
          )}
        </button>
      </div>
    </div>
  );
}
