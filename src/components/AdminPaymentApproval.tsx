import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendReceiptEmailWithRetry } from '../lib/receiptUtils';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
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

const ITEMS_PER_PAGE = 20;

export function AdminPaymentApproval() {
  const { user, profile } = useAuth();
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'completed' | 'failed'>('pending');
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithDetails | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetchTransactions();
    }
  }, [user, profile, filter]);

  useEffect(() => {
    // Filter transactions based on search query
    if (searchQuery.trim() === '') {
      setFilteredTransactions(transactions);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = transactions.filter(t =>
        t.profiles?.email?.toLowerCase().includes(query) ||
        t.profiles?.first_name?.toLowerCase().includes(query) ||
        t.profiles?.last_name?.toLowerCase().includes(query) ||
        t.phone_number?.toLowerCase().includes(query) ||
        t.reference_number?.toLowerCase().includes(query)
      );
      setFilteredTransactions(filtered);
    }
    setCurrentPage(1); // Reset to first page when search changes
  }, [searchQuery, transactions]);

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
      setFilteredTransactions(data || []);
    } catch (error) {
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

      // Send receipt email (non-blocking)
      sendReceiptEmailWithRetry(transactionId).catch(error => {
        // Don't fail the approval if receipt fails
      });

      alert('Payment approved successfully! User subscription has been activated. Receipt email will be sent shortly.');
      fetchTransactions();
      setSelectedTransaction(null);
    } catch (error: any) {
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
      alert(`Failed to reject payment: ${error.message}`);
    } finally {
      setProcessingId(null);
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

  // Pagination calculations
  const totalPages = Math.ceil(filteredTransactions.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentTransactions = filteredTransactions.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">Access denied. Admin only.</p>
      </div>
    );
  }

  return (
    <div className="max-w-full mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Payment Approvals</h2>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
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

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email, name, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent w-64"
            />
          </div>
        </div>

        {/* Results count */}
        <div className="text-sm text-gray-600 mb-4">
          Showing {startIndex + 1}-{Math.min(endIndex, filteredTransactions.length)} of {filteredTransactions.length} transactions
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-600">
            {searchQuery ? 'No transactions found matching your search' : 'No transactions found'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Student</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Method</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {currentTransactions.map((transaction) => (
                    <tr key={transaction.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {transaction.profiles?.first_name || 'Unknown'} {transaction.profiles?.last_name || ''}
                          </p>
                          <p className="text-xs text-blue-600 font-medium">{transaction.profiles?.email}</p>
                          {transaction.phone_number && (
                            <p className="text-xs text-gray-500 mt-0.5">📱 {transaction.phone_number}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        {transaction.subscription_tiers?.display_name}
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm font-semibold text-gray-900">
                          {transaction.currency} {transaction.amount.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">{transaction.billing_cycle}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        {transaction.payment_methods?.display_name}
                        {transaction.reference_number && (
                          <p className="text-xs text-gray-500 mt-0.5">Ref: {transaction.reference_number}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {new Date(transaction.created_at).toLocaleDateString()}
                        <div className="text-xs text-gray-500">
                          {new Date(transaction.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(transaction.status)}`}>
                          {transaction.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {transaction.payment_proof_url && (
                            <button
                              onClick={() => {
                                setSelectedTransaction(transaction);
                                setShowImageModal(true);
                              }}
                              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
                              title="View Proof"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}

                          {transaction.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(transaction.id)}
                                disabled={processingId === transaction.id}
                                className="p-2 text-green-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
                                title="Approve"
                              >
                                {processingId === transaction.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                              </button>

                              <button
                                onClick={() => {
                                  const reason = prompt('Enter rejection reason (required):');
                                  if (reason && reason.trim()) {
                                    handleReject(transaction.id, reason.trim());
                                  } else if (reason !== null) {
                                    alert('Rejection reason is required');
                                  }
                                }}
                                disabled={processingId === transaction.id}
                                className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                                title="Reject"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => goToPage(1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="First page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        currentPage === pageNum
                          ? 'bg-gray-900 text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => goToPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Last page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
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
            <div className="bg-white p-4 rounded-lg">
              <div className="mb-3">
                <p className="font-semibold text-gray-900">
                  {selectedTransaction.profiles?.first_name} {selectedTransaction.profiles?.last_name}
                </p>
                <p className="text-sm text-blue-600">{selectedTransaction.profiles?.email}</p>
              </div>
              <img
                src={selectedTransaction.payment_proof_url}
                alt="Payment Proof"
                className="w-full h-auto rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
