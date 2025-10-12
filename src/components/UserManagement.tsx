import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, UserX, UserCheck, Loader2, AlertCircle, Mail, Calendar, Shield, Crown, Star, BookOpen, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { useAuth } from '../contexts/AuthContext';

interface User {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
}

interface UserSubscription {
  user_id: string;
  subscription_tiers: {
    display_name: string;
    name: string;
  };
  status: string;
}

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [subscriptions, setSubscriptions] = useState<Record<string, UserSubscription>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [deleteModal, setDeleteModal] = useState<{ show: boolean; userId: string | null; userEmail: string | null }>({
    show: false,
    userId: null,
    userEmail: null,
  });
  const [deleting, setDeleting] = useState(false);

  const getTierIcon = (tierName: string) => {
    switch (tierName) {
      case 'free':
        return <BookOpen className="w-4 h-4 text-gray-600" />;
      case 'student':
        return <Star className="w-4 h-4 text-blue-600" />;
      case 'pro':
        return <Crown className="w-4 h-4 text-yellow-500" />;
      default:
        return <BookOpen className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTierColor = (tierName: string) => {
    switch (tierName) {
      case 'free':
        return 'bg-gray-100 text-gray-800 border border-gray-200';
      case 'student':
        return 'bg-blue-100 text-blue-800 border border-blue-200';
      case 'pro':
        return 'bg-yellow-100 text-yellow-800 border border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch all users (excluding current admin if desired)
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      // Fetch subscriptions for all users
      const { data: subsData, error: subsError } = await supabase
        .from('user_subscriptions')
        .select(`
          user_id,
          status,
          subscription_tiers (
            display_name,
            name
          )
        `)
        .eq('status', 'active');

      if (subsError) throw subsError;

      // Create a map of user_id to subscription
      const subsMap: Record<string, UserSubscription> = {};
      subsData?.forEach((sub: any) => {
        subsMap[sub.user_id] = sub;
      });

      setUsers(usersData || []);
      setSubscriptions(subsMap);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      setUpdatingUserId(userId);
      setError('');
      setSuccess('');

      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;

      setSuccess(`User ${!currentStatus ? 'activated' : 'deactivated'} successfully`);

      // Update local state
      setUsers(users.map(user =>
        user.id === userId ? { ...user, is_active: !currentStatus } : user
      ));

      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Error updating user status:', err);
      setError('Failed to update user status. Please try again.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModal.userId || !currentUser) return;

    setDeleting(true);
    setError('');
    try {
      const { data, error } = await supabase
        .rpc('admin_delete_user_completely', {
          p_user_id: deleteModal.userId,
          p_admin_id: currentUser.id
        });

      if (error) throw error;

      if (data && data.length > 0 && data[0].success) {
        setSuccess('User deleted successfully!');
        setDeleteModal({ show: false, userId: null, userEmail: null });
        await fetchUsers();
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data[0]?.message || 'Failed to delete user');
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      setError(`Failed to delete user: ${error.message || 'Please try again.'}`);
    } finally {
      setDeleting(false);
    }
  };

  const filteredUsers = users.filter(user => {
    // Apply search filter
    const matchesSearch =
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.first_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.last_name?.toLowerCase().includes(searchQuery.toLowerCase());

    // Apply status filter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.is_active) ||
      (statusFilter === 'inactive' && !user.is_active);

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    inactive: users.filter(u => !u.is_active).length,
    admins: users.filter(u => u.role === 'admin').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">User Management</h2>
        <p className="text-sm text-gray-600">Manage user accounts and access</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Users</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Shield className="w-8 h-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-white border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700">Active Users</p>
              <p className="text-2xl font-bold text-green-900">{stats.active}</p>
            </div>
            <UserCheck className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-700">Inactive Users</p>
              <p className="text-2xl font-bold text-red-900">{stats.inactive}</p>
            </div>
            <UserX className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700">Administrators</p>
              <p className="text-2xl font-bold text-blue-900">{stats.admins}</p>
            </div>
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center space-x-3">
          <UserCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Status Filter */}
        <div className="flex space-x-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              statusFilter === 'all'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              statusFilter === 'active'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              statusFilter === 'inactive'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subscription
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joined
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    No users found matching your criteria
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const subscription = subscriptions[user.id];
                  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');

                  return (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                              <Mail className="w-5 h-5 text-gray-600" />
                            </div>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {fullName || 'No name'}
                            </p>
                            <p className="text-xs text-gray-500">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {subscription ? (
                          <div className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-medium ${getTierColor(subscription.subscription_tiers.name)}`}>
                            {getTierIcon(subscription.subscription_tiers.name)}
                            <span>{subscription.subscription_tiers.display_name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">No subscription</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(user.created_at).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {user.role !== 'admin' && (
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => toggleUserStatus(user.id, user.is_active)}
                              disabled={updatingUserId === user.id}
                              className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                user.is_active
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              {updatingUserId === user.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : user.is_active ? (
                                <>
                                  <UserX className="w-4 h-4" />
                                  <span>Deactivate</span>
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-4 h-4" />
                                  <span>Activate</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setDeleteModal({ show: true, userId: user.id, userEmail: user.email })}
                              className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors bg-red-50 text-red-700 hover:bg-red-100 border border-red-200"
                              title="Delete User Permanently"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                        {user.role === 'admin' && (
                          <span className="text-xs text-gray-500">Admin protected</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results Summary */}
      <div className="text-sm text-gray-600">
        Showing {filteredUsers.length} of {users.length} users
      </div>

      {/* Delete User Modal */}
      <Modal
        isOpen={deleteModal.show}
        onClose={() => setDeleteModal({ show: false, userId: null, userEmail: null })}
        onConfirm={handleDeleteUser}
        title="Delete User Permanently"
        message={
          <div className="text-left space-y-3">
            <p className="text-sm text-gray-700">
              Are you sure you want to permanently delete <span className="font-semibold">{deleteModal.userEmail}</span>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-red-900 mb-2">⚠️ This action cannot be undone!</p>
              <p className="text-xs text-red-800">
                This will permanently delete:
              </p>
              <ul className="text-xs text-red-800 list-disc list-inside mt-1 space-y-0.5">
                <li>User account and profile</li>
                <li>All conversations and chat messages</li>
                <li>Payment history</li>
                <li>Subscription data</li>
                <li>Token usage tracking</li>
                <li>Profile picture</li>
              </ul>
            </div>
          </div>
        }
        type="confirm"
        confirmText={deleting ? 'Deleting...' : 'Delete Permanently'}
        cancelText="Cancel"
        confirmDisabled={deleting}
      />
    </div>
  );
}
