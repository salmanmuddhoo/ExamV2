import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Loader2, CheckCircle, XCircle, Clock, Receipt } from 'lucide-react';
import type { PaymentTransaction } from '../types/payment';

interface TransactionWithDetails extends PaymentTransaction {
  subscription_tiers?: {
    display_name: string;
  };
  payment_methods?: {
    display_name: string;
  };
}

export function PaymentHistory() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchTransactions();
    }
  }, [user]);

  const fetchTransactions = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('payment_transactions')
        .select(`
          *,
          subscription_tiers(display_name),
          payment_methods(display_name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'failed':
      case 'cancelled':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Receipt className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-800',
      refunded: 'bg-purple-100 text-purple-800'
    };

    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const texts = {
      pending: 'Awaiting Approval',
      approved: 'Approved',
      completed: 'Completed',
      failed: 'Failed',
      cancelled: 'Cancelled',
      refunded: 'Refunded'
    };

    return texts[status as keyof typeof texts] || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 md:p-8 text-center">
        <Receipt className="w-10 h-10 md:w-12 md:h-12 text-gray-400 mx-auto mb-3 md:mb-4" />
        <p className="text-sm md:text-base text-gray-600">No payment history available yet.</p>
        <p className="text-xs md:text-sm text-gray-500 mt-2">
          Once you make a payment, your transaction history will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {transactions.map((transaction) => (
        <div
          key={transaction.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-start space-x-3">
              <div className="mt-0.5">
                {getStatusIcon(transaction.status)}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900 text-sm">
                  {transaction.subscription_tiers?.display_name}
                </h4>
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(transaction.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="font-semibold text-gray-900 text-sm">
                {transaction.currency} {transaction.amount.toLocaleString()}
              </p>
              <span className={`inline-flex mt-1 px-2 py-0.5 text-xs font-semibold rounded-full ${getStatusBadge(transaction.status)}`}>
                {getStatusText(transaction.status)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Payment Method</p>
              <p className="text-sm text-gray-900 font-medium">
                {transaction.payment_methods?.display_name}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Billing Cycle</p>
              <p className="text-sm text-gray-900 font-medium capitalize">
                {transaction.billing_cycle}
              </p>
            </div>

            {transaction.reference_number && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Reference Number</p>
                <p className="text-sm text-gray-900 font-mono">
                  {transaction.reference_number}
                </p>
              </div>
            )}

            {transaction.status === 'pending' && (
              <div className="col-span-2">
                <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded border border-yellow-200">
                  ⏳ Your payment is being reviewed. You'll receive a notification once it's approved.
                </p>
              </div>
            )}

            {transaction.status === 'failed' && transaction.error_message && (
              <div className="col-span-2">
                <p className="text-xs text-red-700 bg-red-50 p-2 rounded border border-red-200">
                  ❌ {transaction.error_message}
                </p>
              </div>
            )}

            {transaction.approval_notes && transaction.status === 'completed' && (
              <div className="col-span-2">
                <p className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                  ✓ {transaction.approval_notes}
                </p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
