import { useState, useEffect } from 'react';
import { DollarSign, Save, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ExchangeRate {
  id: string;
  currency_code: string;
  currency_name: string;
  currency_symbol: string;
  rate_to_usd: number;
  updated_at: string;
}

export function CurrencyExchangeManager() {
  const { user } = useAuth();
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedRates, setEditedRates] = useState<Record<string, number>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchRates();
  }, []);

  const fetchRates = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('currency_exchange_rates')
        .select('*')
        .order('currency_code');

      if (error) throw error;
      setRates(data || []);
    } catch (error) {
      setErrorMessage('Failed to load exchange rates');
    } finally {
      setLoading(false);
    }
  };

  const handleRateChange = (currencyCode: string, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      setEditedRates(prev => ({ ...prev, [currencyCode]: numValue }));
    }
  };

  const handleSave = async () => {
    if (Object.keys(editedRates).length === 0) {
      setErrorMessage('No changes to save');
      return;
    }

    try {
      setSaving(true);
      setSuccessMessage('');
      setErrorMessage('');

      // Update each edited rate
      for (const [currencyCode, rate] of Object.entries(editedRates)) {
        const { error } = await supabase
          .from('currency_exchange_rates')
          .update({
            rate_to_usd: rate,
            updated_by: user?.id
          })
          .eq('currency_code', currencyCode);

        if (error) throw error;
      }

      setSuccessMessage('Exchange rates updated successfully!');
      setEditedRates({});
      await fetchRates();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrorMessage('Failed to update exchange rates');
    } finally {
      setSaving(false);
    }
  };

  const getDisplayRate = (rate: ExchangeRate) => {
    return editedRates[rate.currency_code] ?? rate.rate_to_usd;
  };

  const hasChanges = Object.keys(editedRates).length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center space-x-3 mb-2">
          <div className="p-2 bg-blue-100 rounded-lg">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Currency Exchange Rates</h1>
        </div>
        <p className="text-gray-600">
          Manage currency conversion rates. All rates are relative to USD (1 USD = X units).
        </p>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start space-x-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-red-800">{errorMessage}</p>
        </div>
      )}

      {/* Exchange Rates Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Currency
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Symbol
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Code
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Rate (1 USD =)
              </th>
              <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                Last Updated
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rates.map(rate => (
              <tr key={rate.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {rate.currency_name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  <span className="text-lg font-semibold">{rate.currency_symbol}</span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  <span className="bg-gray-100 px-2 py-1 rounded font-mono text-xs">
                    {rate.currency_code}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {rate.currency_code === 'USD' ? (
                    <span className="text-sm text-gray-600 italic">1.0000 (Base Currency)</span>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={getDisplayRate(rate)}
                        onChange={(e) => handleRateChange(rate.currency_code, e.target.value)}
                        className="w-32 px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      />
                      <span className="text-xs text-gray-500">{rate.currency_symbol}</span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-xs text-gray-500">
                  {new Date(rate.updated_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Example Conversion */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Example Conversions:</h3>
        <div className="space-y-1 text-sm text-blue-800">
          {rates.filter(r => r.currency_code !== 'USD').map(rate => {
            const rateValue = getDisplayRate(rate);
            const example = 10 * rateValue;
            return (
              <p key={rate.currency_code}>
                $10 USD = {rate.currency_symbol}{example.toFixed(2)} {rate.currency_code}
              </p>
            );
          })}
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Save Exchange Rates</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">How it works:</h3>
        <ul className="space-y-1 text-sm text-gray-600">
          <li>• All prices in the system are stored in USD</li>
          <li>• When displaying to users, prices are converted based on the tier's currency setting</li>
          <li>• During checkout, the converted price is sent to the payment provider</li>
          <li>• Example: If tier price is $10 USD and MUR rate is 50, users see Rs 500</li>
        </ul>
      </div>
    </div>
  );
}
