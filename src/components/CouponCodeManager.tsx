import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Tag,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  X,
  Loader2,
  Copy,
  Check
} from 'lucide-react';
import type { CouponAnalytics, CreateCouponInput, UpdateCouponInput } from '../types/coupon';
import type { SubscriptionTier } from '../types/subscription';

const ITEMS_PER_PAGE = 20;

export function CouponCodeManager() {
  const { user, profile } = useAuth();
  const [coupons, setCoupons] = useState<CouponAnalytics[]>([]);
  const [filteredCoupons, setFilteredCoupons] = useState<CouponAnalytics[]>([]);
  const [subscriptionTiers, setSubscriptionTiers] = useState<SubscriptionTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive' | 'expired' | 'scheduled'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponAnalytics | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<CreateCouponInput>({
    code: '',
    description: '',
    discount_percentage: 10,
    valid_from: new Date(),
    valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    is_active: true,
    max_uses: null,
    applicable_tiers: [],
    applicable_billing_cycles: []
  });

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      fetchCoupons();
      fetchSubscriptionTiers();
    }
  }, [user, profile]);

  useEffect(() => {
    // Filter coupons based on search query and status filter
    let filtered = coupons;

    // Apply status filter
    if (filter !== 'all') {
      filtered = filtered.filter(c => c.status === filter);
    }

    // Apply search filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c =>
        c.code.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query)
      );
    }

    setFilteredCoupons(filtered);
    setCurrentPage(1);
  }, [searchQuery, filter, coupons]);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('coupon_analytics')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCoupons(data || []);
      setFilteredCoupons(data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptionTiers = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_tiers')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setSubscriptionTiers(data || []);
    } catch (error) {
    }
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setSaving(true);

      // Prepare data
      const couponData = {
        code: formData.code.toUpperCase().trim(),
        description: formData.description?.trim() || null,
        discount_percentage: formData.discount_percentage,
        valid_from: formData.valid_from.toISOString(),
        valid_until: formData.valid_until.toISOString(),
        is_active: formData.is_active,
        max_uses: formData.max_uses,
        applicable_tiers: formData.applicable_tiers || [],
        applicable_billing_cycles: formData.applicable_billing_cycles || []
      };

      if (editingCoupon) {
        // Update existing coupon
        const { error } = await supabase
          .from('coupon_codes')
          .update(couponData)
          .eq('id', editingCoupon.id);

        if (error) throw error;
      } else {
        // Create new coupon
        const { error } = await supabase
          .from('coupon_codes')
          .insert({
            ...couponData,
            created_by: user.id
          });

        if (error) throw error;
      }

      // Refresh the list
      await fetchCoupons();

      // Close modal and reset form
      setShowModal(false);
      setEditingCoupon(null);
      resetForm();
    } catch (error: any) {
      alert(error.message || 'Failed to save coupon code');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (couponId: string) => {
    if (!confirm('Are you sure you want to delete this coupon code? This action cannot be undone.')) {
      return;
    }

    try {
      setDeleting(couponId);
      const { error } = await supabase
        .from('coupon_codes')
        .delete()
        .eq('id', couponId);

      if (error) throw error;

      // Refresh the list
      await fetchCoupons();
    } catch (error: any) {
      alert(error.message || 'Failed to delete coupon code');
    } finally {
      setDeleting(null);
    }
  };

  const handleEdit = (coupon: CouponAnalytics) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      discount_percentage: coupon.discount_percentage,
      valid_from: new Date(coupon.valid_from),
      valid_until: new Date(coupon.valid_until),
      is_active: coupon.is_active,
      max_uses: coupon.max_uses,
      applicable_tiers: coupon.applicable_tiers || [],
      applicable_billing_cycles: coupon.applicable_billing_cycles || []
    });
    setShowModal(true);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const resetForm = () => {
    setFormData({
      code: '',
      description: '',
      discount_percentage: 10,
      valid_from: new Date(),
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      is_active: true,
      max_uses: null,
      applicable_tiers: [],
      applicable_billing_cycles: []
    });
  };

  const handleNewCoupon = () => {
    setEditingCoupon(null);
    resetForm();
    setShowModal(true);
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      expired: 'bg-red-100 text-red-800',
      scheduled: 'bg-blue-100 text-blue-800',
      maxed_out: 'bg-yellow-100 text-yellow-800'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${styles[status as keyof typeof styles] || styles.inactive}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Pagination
  const totalPages = Math.ceil(filteredCoupons.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentCoupons = filteredCoupons.slice(startIndex, endIndex);

  if (!profile?.role || profile.role !== 'admin') {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Coupon Code Management</h1>
            <p className="text-gray-600 mt-1">Create and manage discount coupon codes for students</p>
          </div>
          <button
            onClick={handleNewCoupon}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Plus size={20} />
            New Coupon
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Coupons</p>
                <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
              </div>
              <Tag className="text-indigo-600" size={32} />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Coupons</p>
                <p className="text-2xl font-bold text-green-600">
                  {coupons.filter(c => c.status === 'active').length}
                </p>
              </div>
              <TrendingUp className="text-green-600" size={32} />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Usage</p>
                <p className="text-2xl font-bold text-blue-600">
                  {coupons.reduce((sum, c) => sum + c.total_usages, 0)}
                </p>
              </div>
              <Users className="text-blue-600" size={32} />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Discounts</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(coupons.reduce((sum, c) => sum + Number(c.total_discount_given), 0))}
                </p>
              </div>
              <DollarSign className="text-purple-600" size={32} />
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search by code or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-2 flex-wrap">
              {(['all', 'active', 'inactive', 'expired', 'scheduled'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filter === status
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        ) : currentCoupons.length === 0 ? (
          <div className="text-center py-12">
            <Tag className="mx-auto text-gray-400 mb-4" size={48} />
            <p className="text-gray-600">
              {searchQuery || filter !== 'all'
                ? 'No coupons found matching your criteria'
                : 'No coupon codes created yet'}
            </p>
            {!searchQuery && filter === 'all' && (
              <button
                onClick={handleNewCoupon}
                className="mt-4 text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Create your first coupon code
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Discount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Valid Period
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Discount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {currentCoupons.map((coupon) => (
                    <tr key={coupon.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-indigo-600">
                              {coupon.code}
                            </span>
                            <button
                              onClick={() => handleCopyCode(coupon.code)}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="Copy code"
                            >
                              {copiedCode === coupon.code ? (
                                <Check size={16} className="text-green-600" />
                              ) : (
                                <Copy size={16} />
                              )}
                            </button>
                          </div>
                          {coupon.description && (
                            <p className="text-sm text-gray-500 mt-1 max-w-xs truncate">
                              {coupon.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-lg font-bold text-green-600">
                          {coupon.discount_percentage}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="text-gray-900">{formatDate(coupon.valid_from)}</div>
                          <div className="text-gray-500">to {formatDate(coupon.valid_until)}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="font-semibold text-gray-900">
                            {coupon.total_usages} uses
                          </div>
                          <div className="text-gray-500">
                            {coupon.unique_users} unique users
                          </div>
                          {coupon.max_uses && (
                            <div className="text-xs text-gray-400 mt-1">
                              Limit: {coupon.max_uses}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="font-semibold text-gray-900">
                            {formatCurrency(Number(coupon.total_discount_given))}
                          </div>
                          <div className="text-xs text-gray-500">
                            from {formatCurrency(Number(coupon.total_original_amount))}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(coupon.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(coupon)}
                            className="text-indigo-600 hover:text-indigo-900 transition-colors"
                            title="Edit coupon"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(coupon.id)}
                            disabled={deleting === coupon.id}
                            className="text-red-600 hover:text-red-900 transition-colors disabled:opacity-50"
                            title="Delete coupon"
                          >
                            {deleting === coupon.id ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : (
                              <Trash2 size={18} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {startIndex + 1} to {Math.min(endIndex, filteredCoupons.length)} of{' '}
                    {filteredCoupons.length} coupons
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronsLeft size={20} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <span className="px-4 py-2 text-sm font-medium">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronsRight size={20} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingCoupon ? 'Edit Coupon Code' : 'Create New Coupon Code'}
                </h2>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingCoupon(null);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={24} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleCreateOrUpdate} className="space-y-6">
                {/* Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Coupon Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingCoupon}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    placeholder="e.g., SUMMER2024"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono disabled:bg-gray-100"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {editingCoupon ? 'Code cannot be changed after creation' : 'Will be converted to uppercase'}
                  </p>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Optional description for this coupon"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                {/* Discount Percentage */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Discount Percentage *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      required
                      min="1"
                      max="100"
                      value={formData.discount_percentage}
                      onChange={(e) => setFormData({ ...formData, discount_percentage: parseInt(e.target.value) })}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <span className="text-2xl font-bold text-gray-700">%</span>
                  </div>
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Valid From *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.valid_from.toISOString().slice(0, 16)}
                      onChange={(e) => setFormData({ ...formData, valid_from: new Date(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Valid Until *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={formData.valid_until.toISOString().slice(0, 16)}
                      onChange={(e) => setFormData({ ...formData, valid_until: new Date(e.target.value) })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Max Uses */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Maximum Uses
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_uses || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      max_uses: e.target.value ? parseInt(e.target.value) : null
                    })}
                    placeholder="Leave empty for unlimited"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Leave empty for unlimited uses
                  </p>
                </div>

                {/* Applicable Tiers */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Applicable Subscription Tiers
                  </label>
                  <div className="space-y-2">
                    {subscriptionTiers.map((tier) => (
                      <label key={tier.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.applicable_tiers?.includes(tier.id)}
                          onChange={(e) => {
                            const tiers = formData.applicable_tiers || [];
                            if (e.target.checked) {
                              setFormData({ ...formData, applicable_tiers: [...tiers, tier.id] });
                            } else {
                              setFormData({
                                ...formData,
                                applicable_tiers: tiers.filter(id => id !== tier.id)
                              });
                            }
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">{tier.display_name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Leave all unchecked to apply to all tiers
                  </p>
                </div>

                {/* Applicable Billing Cycles */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Applicable Billing Cycles
                  </label>
                  <div className="space-y-2">
                    {(['monthly', 'yearly'] as const).map((cycle) => (
                      <label key={cycle} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.applicable_billing_cycles?.includes(cycle)}
                          onChange={(e) => {
                            const cycles = formData.applicable_billing_cycles || [];
                            if (e.target.checked) {
                              setFormData({ ...formData, applicable_billing_cycles: [...cycles, cycle] });
                            } else {
                              setFormData({
                                ...formData,
                                applicable_billing_cycles: cycles.filter(c => c !== cycle)
                              });
                            }
                          }}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700 capitalize">{cycle}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Leave all unchecked to apply to all billing cycles
                  </p>
                </div>

                {/* Active Status */}
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      Coupon is active
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-gray-500 ml-6">
                    Inactive coupons cannot be used even if within the valid date range
                  </p>
                </div>

                {/* Form Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingCoupon(null);
                      resetForm();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {saving && <Loader2 size={16} className="animate-spin" />}
                    {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
