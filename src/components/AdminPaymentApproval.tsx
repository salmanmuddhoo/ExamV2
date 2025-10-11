import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  DollarSign,
  Calendar,
  User,
  Phone,
  Hash,
  FileText,
  Filter
} from 'lucide-react';
import type { PaymentTransaction } from '../types/payment';

interface TransactionWithDetails extends PaymentTransaction {
  profiles?: {
    email: string;
    first_name?: string;
    last_name?: string;
  };
  subscription_tiers?: {
    display_name: string;
  };
  payment_methods?: {
    display_name: string;
  };
}

export function AdminPaymentApproval() {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'completed' | 'failed'>('pending');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithDetails | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetchTransactions();
    }
  }, [user, profile, filter]);

  const fetchTransactions = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('payment_transactions')
        .select(`
          *,
          profiles!payment_transactions_user_id_fkey(email, first_name, last_name),
          subscription_tiers(display_name),
          payment_methods(display_name)
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setTransactions(data || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (transactionId: string, notes?: string) => {
    if (!user) return;

    setProcessingId(transactionId);

    try {
      const { error } = await supabase
        .from('payment_transactions')
        .update({
          status: 'completed',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          approval_notes: notes
        })
        .eq('id', transactionId);

      if (error) throw error;

      alert('Payment approved successfully! User subscription has been activated.');
      fetchTransactions();
      setSelectedTransaction(null);
    } catch (error: any) {
      console.error('Error approving payment:', error);
      alert(`Failed to approve payment: ${error.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (transactionId: string, reason: string) => {
    if (!user) return;

    setProcessingId(transactionId);

    try {
      const { error } = await supabase
        .from('payment_transactions')
        .update({
          status: 'failed',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          approval_notes: `Rejected: ${reason}`,
          error_message: reason
        })
        .eq('id', transactionId);

      if (error) throw error;

      alert('Payment rejected.');
      fetchTransactions();
      setSelectedTransaction(null);
    } catch (error: any) {
      console.error('Error rejecting payment:', error);
      alert(`Failed to reject payment: ${error.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      approved: 'bg-blue-100 text-blue-800 border-blue-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      failed: 'bg-red-100 text-red-800 border-red-200',
      cancelled: 'bg-gray-100 text-gray-800 border-gray-200',
      refunded: 'bg-purple-100 text-purple-800 border-purple-200'
    };

    return badges[status as keyof typeof badges] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Access denied. Admin only.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Payment Approvals</h2>

        {/* Filter Tabs */}
        <div className="flex space-x-2 border-b border-gray-200">
          {[
            { value: 'all', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'completed', label: 'Completed' },
            { value: 'failed', label: 'Failed' }
          ].map(tab => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value as any)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filter === tab.value
                  ? 'text-gray-900 border-b-2 border-gray-900'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {tab.value === 'pending' && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                  {transactions.filter(t => t.status === 'pending').length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12">
          <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">No transactions found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((transaction) => (
            <div
              key={transaction.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {/* User Info */}
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <User className="w-5 h-5 text-gray-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">
                        {transaction.profiles?.first_name || 'Unknown'} {transaction.profiles?.last_name || ''}
                      </p>
                      <p className="text-sm text-gray-600">{transaction.profiles?.email}</p>
                    </div>
                  </div>

                  {/* Transaction Details */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Plan</p>
                      <p className="text-sm font-medium text-gray-900">
                        {transaction.subscription_tiers?.display_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Amount</p>
                      <p className="text-sm font-medium text-gray-900">
                        {transaction.currency} {transaction.amount.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Method</p>
                      <p className="text-sm font-medium text-gray-900">
                        {transaction.payment_methods?.display_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Date</p>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(transaction.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* MCB Juice Details */}
                  {transaction.phone_number && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center space-x-2">
                          <Phone className="w-4 h-4 text-gray-600" />
                          <div>
                            <p className="text-xs text-gray-500">Phone</p>
                            <p className="text-sm font-medium text-gray-900">{transaction.phone_number}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Hash className="w-4 h-4 text-gray-600" />
                          <div>
                            <p className="text-xs text-gray-500">Reference</p>
                            <p className="text-sm font-medium text-gray-900">{transaction.reference_number}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                <div>
                  <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${getStatusBadge(transaction.status)}`}>
                    {transaction.status.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-4 border-t border-gray-200">
                {transaction.payment_proof_url && (
                  <button
                    onClick={() => {
                      setSelectedTransaction(transaction);
                      setShowImageModal(true);
                    }}
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Proof</span>
                  </button>
                )}

                {transaction.status === 'pending' && (
                  <>
                    <button
                      onClick={() => {
                        const notes = prompt('Add approval notes (optional):');
                        handleApprove(transaction.id, notes || undefined);
                      }}
                      disabled={processingId === transaction.id}
                      className="flex items-center space-x-2 px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {processingId === transaction.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      <span>Approve</span>
                    </button>

                    <button
                      onClick={() => {
                        const reason = prompt('Enter rejection reason:');
                        if (reason) {
                          handleReject(transaction.id, reason);
                        }
                      }}
                      disabled={processingId === transaction.id}
                      className="flex items-center space-x-2 px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                  </>
                )}

                {transaction.approval_notes && (
                  <div className="flex-1 text-sm text-gray-600 italic">
                    Note: {transaction.approval_notes}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Image Modal */}
      {showImageModal && selectedTransaction?.payment_proof_url && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4"
          onClick={() => setShowImageModal(false)}
        >
          <div className="relative max-w-4xl w-full">
            <button
              onClick={() => setShowImageModal(false)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300"
            >
              <XCircle className="w-8 h-8" />
            </button>
            <img
              src={selectedTransaction.payment_proof_url}
              alt="Payment Proof"
              className="w-full h-auto rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
