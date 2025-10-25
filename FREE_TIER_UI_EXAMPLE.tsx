/**
 * FREE TIER PAPER ACCESS - UI EXAMPLE
 *
 * This file demonstrates how to use the new free tier paper access functions
 * in your React components to show which papers are accessible and which are locked.
 *
 * DO NOT import this file directly. Copy the relevant parts into your existing components.
 */

import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './contexts/AuthContext';
import { Lock, CheckCircle, Clock } from 'lucide-react';

// Type definition for paper access status
interface PaperAccessStatus {
  paper_id: string;
  paper_title: string;
  grade_name: string;
  subject_name: string;
  year: number;
  month: string;
  is_accessible: boolean;
  is_recently_accessed: boolean;
  last_accessed_at: string | null;
  access_status: 'accessible' | 'locked' | 'recently_accessed';
}

/**
 * Example 1: User Profile - Show Recently Accessed Papers
 *
 * This component displays the 2 most recently accessed papers for free tier users
 */
export function RecentPapersProfile() {
  const { user, profile } = useAuth();
  const [papers, setPapers] = useState<PaperAccessStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchRecentPapers() {
      try {
        const { data, error } = await supabase
          .rpc('get_user_paper_access_status', { p_user_id: user.id });

        if (error) throw error;

        // Filter for recently accessed papers only
        const recentPapers = data?.filter((p: PaperAccessStatus) =>
          p.is_recently_accessed && p.last_accessed_at !== null
        ) || [];

        setPapers(recentPapers);
      } catch (error) {
        console.error('Error fetching recent papers:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchRecentPapers();
  }, [user]);

  if (loading) return <div>Loading...</div>;

  // Only show this section for free tier users
  if (profile?.subscription?.tier_name !== 'free') return null;

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">
        Your Recent Papers (Free Tier: {papers.length}/2)
      </h3>

      {papers.length === 0 ? (
        <p className="text-gray-600">
          You haven't accessed any papers yet. Browse our library to get started!
        </p>
      ) : (
        <div className="space-y-3">
          {papers.map((paper) => (
            <div
              key={paper.paper_id}
              className="flex items-start justify-between p-4 border rounded-lg hover:bg-gray-50"
            >
              <div className="flex-1">
                <h4 className="font-medium text-gray-900">{paper.paper_title}</h4>
                <p className="text-sm text-gray-600">
                  {paper.grade_name} - {paper.subject_name}
                </p>
                {paper.last_accessed_at && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Last accessed: {new Date(paper.last_accessed_at).toLocaleDateString()}
                  </p>
                )}
              </div>
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {papers.length >= 2 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
          <p className="text-sm text-yellow-800">
            You've reached your free tier limit (2 papers).
            To access more papers, please{' '}
            <button className="font-semibold underline">upgrade your subscription</button>.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Example 2: Paper Browser - Show All Papers with Lock Status
 *
 * This component displays all papers and shows which ones are locked for free tier users
 */
export function PaperBrowserWithAccessStatus() {
  const { user, profile } = useAuth();
  const [papers, setPapers] = useState<PaperAccessStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function fetchPapers() {
      try {
        const { data, error } = await supabase
          .rpc('get_user_paper_access_status', { p_user_id: user.id });

        if (error) throw error;
        setPapers(data || []);
      } catch (error) {
        console.error('Error fetching papers:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPapers();
  }, [user]);

  if (loading) return <div>Loading papers...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Exam Papers</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {papers.map((paper) => (
          <PaperCard key={paper.paper_id} paper={paper} />
        ))}
      </div>
    </div>
  );
}

/**
 * Paper Card Component - Shows access status with icons
 */
function PaperCard({ paper }: { paper: PaperAccessStatus }) {
  const handlePaperClick = () => {
    if (!paper.is_accessible) {
      alert('This paper is locked. Upgrade to access more papers!');
      return;
    }
    // Navigate to paper viewer
    window.location.href = `/paper/${paper.paper_id}`;
  };

  return (
    <div
      className={`
        border rounded-lg p-4 cursor-pointer transition-all
        ${paper.is_accessible
          ? 'hover:shadow-lg border-gray-300 bg-white'
          : 'border-gray-200 bg-gray-50 opacity-75'
        }
      `}
      onClick={handlePaperClick}
    >
      {/* Header with access indicator */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{paper.paper_title}</h3>
          <p className="text-sm text-gray-600">
            {paper.grade_name} - {paper.subject_name}
          </p>
          <p className="text-xs text-gray-500">
            {paper.year} {paper.month}
          </p>
        </div>

        {/* Access status icon */}
        <div className="flex-shrink-0 ml-2">
          {paper.access_status === 'recently_accessed' && (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="text-xs font-medium">Recent</span>
            </div>
          )}
          {paper.access_status === 'accessible' && (
            <CheckCircle className="w-5 h-5 text-gray-400" />
          )}
          {paper.access_status === 'locked' && (
            <div className="flex items-center gap-1 text-gray-400">
              <Lock className="w-5 h-5" />
              <span className="text-xs font-medium">Locked</span>
            </div>
          )}
        </div>
      </div>

      {/* Last accessed info for recently accessed papers */}
      {paper.is_recently_accessed && paper.last_accessed_at && (
        <div className="text-xs text-gray-500 flex items-center gap-1 mb-2">
          <Clock className="w-3 h-3" />
          Last used: {new Date(paper.last_accessed_at).toLocaleDateString()}
        </div>
      )}

      {/* Action button */}
      {paper.is_accessible ? (
        <button className="w-full mt-2 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors">
          Open Paper
        </button>
      ) : (
        <button className="w-full mt-2 py-2 bg-gray-200 text-gray-600 rounded cursor-not-allowed">
          Upgrade to Access
        </button>
      )}
    </div>
  );
}

/**
 * Example 3: Check if User Can Access a Specific Paper
 *
 * Use this before allowing a user to open a paper
 */
export async function checkPaperAccess(userId: string, paperId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .rpc('can_user_access_paper', {
        p_user_id: userId,
        p_paper_id: paperId
      });

    if (error) throw error;
    return data === true;
  } catch (error) {
    console.error('Error checking paper access:', error);
    return false;
  }
}

/**
 * Example 4: Get Recent Papers Array
 *
 * Get array of paper IDs for the most recent papers
 */
export async function getRecentPaperIds(userId: string, limit: number = 2): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .rpc('get_recent_accessed_papers', {
        p_user_id: userId,
        p_limit: limit
      });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting recent papers:', error);
    return [];
  }
}

/**
 * Example 5: Free Tier Warning Banner
 *
 * Show a warning when user approaches or reaches their limit
 */
export function FreeTierWarningBanner() {
  const { user, profile } = useAuth();
  const [accessedCount, setAccessedCount] = useState(0);
  const [limit, setLimit] = useState(2);

  useEffect(() => {
    if (!user || profile?.subscription?.tier_name !== 'free') return;

    async function fetchAccessCount() {
      try {
        // Get all papers with access status
        const { data, error } = await supabase
          .rpc('get_user_paper_access_status', { p_user_id: user.id });

        if (error) throw error;

        // Count papers that have been accessed
        const accessed = data?.filter((p: PaperAccessStatus) =>
          p.last_accessed_at !== null
        ).length || 0;

        setAccessedCount(accessed);

        // Get limit from subscription
        setLimit(profile?.subscription?.papers_limit || 2);
      } catch (error) {
        console.error('Error fetching access count:', error);
      }
    }

    fetchAccessCount();
  }, [user, profile]);

  // Don't show banner for non-free users
  if (profile?.subscription?.tier_name !== 'free') return null;

  // Don't show if under limit
  if (accessedCount < limit) return null;

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Lock className="h-5 w-5 text-yellow-400" />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">
            Free Tier Limit Reached ({accessedCount}/{limit} papers)
          </h3>
          <div className="mt-2 text-sm text-yellow-700">
            <p>
              You've accessed your maximum number of papers.
              You can continue to access your {limit} most recent papers, or upgrade to access more.
            </p>
          </div>
          <div className="mt-4">
            <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded text-sm font-medium">
              Upgrade Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Example 6: Integration with Existing ChatHub
 *
 * Add this logic to your existing ChatHub component to check access before loading a paper
 */
export async function handlePaperSelection(userId: string, paperId: string) {
  // Check if user can access this paper
  const canAccess = await checkPaperAccess(userId, paperId);

  if (!canAccess) {
    // Show upgrade modal or error message
    alert('You cannot access this paper. Please upgrade your subscription or select one of your recent papers.');
    return false;
  }

  // Proceed with loading the paper
  return true;
}

/**
 * Example 7: Show Upgrade Prompt for Locked Papers
 */
export function UpgradePromptModal({
  isOpen,
  onClose,
  paperTitle
}: {
  isOpen: boolean;
  onClose: () => void;
  paperTitle: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-yellow-100 mx-auto mb-4">
          <Lock className="w-6 h-6 text-yellow-600" />
        </div>

        <h2 className="text-xl font-bold text-center mb-2">Paper Locked</h2>

        <p className="text-gray-600 text-center mb-4">
          "{paperTitle}" is not accessible on your current free tier plan.
          You've reached your limit of 2 papers.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
          <h3 className="font-semibold text-blue-900 mb-2">
            Your Recent Papers:
          </h3>
          <p className="text-sm text-blue-800">
            You can access your 2 most recently used papers.
            If you want to access this paper, you can either:
          </p>
          <ul className="list-disc list-inside text-sm text-blue-800 mt-2 space-y-1">
            <li>Upgrade to Student or Pro plan</li>
            <li>Access this paper (it will replace your oldest recent paper)</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              window.location.href = '/subscription';
            }}
            className="flex-1 px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
          >
            Upgrade Now
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * USAGE NOTES:
 *
 * 1. Make sure to apply the migration first:
 *    - File: supabase/migrations/20251025000001_free_tier_recent_papers_access.sql
 *    - Apply via Supabase Dashboard SQL Editor or CLI
 *
 * 2. Import these functions in your existing components:
 *    - Use RecentPapersProfile in UserProfile component
 *    - Use PaperBrowserWithAccessStatus in ExamPapersBrowser
 *    - Use FreeTierWarningBanner at the top of ChatHub
 *    - Use checkPaperAccess before opening any paper
 *
 * 3. Test thoroughly:
 *    - Create a free tier user
 *    - Access 2 papers
 *    - Try accessing a 3rd paper (should be denied)
 *    - Access the 3rd paper anyway (should replace oldest)
 *    - Verify the recent papers list updates correctly
 */
