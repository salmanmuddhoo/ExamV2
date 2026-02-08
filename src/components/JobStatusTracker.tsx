import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, Loader, Clock, Trash2 } from 'lucide-react';

interface ProcessingJob {
  id: string;
  job_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress_percentage: number;
  current_step: string;
  exam_paper_id: string;
  created_at: string;
  error_message?: string;
  exam_papers?: {
    title: string;
  };
}

interface JobStatusTrackerProps {
  userId: string;
  onJobComplete?: (jobId: string) => void;
}

export function JobStatusTracker({ userId, onJobComplete }: JobStatusTrackerProps) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    // Fetch initial jobs
    fetchJobs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('processing_jobs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'processing_jobs',
        },
        (payload) => {
          console.log('Job update received:', payload);

          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as ProcessingJob;
            setJobs((prev) => [newJob, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedJob = payload.new as ProcessingJob;
            setJobs((prev) =>
              prev.map((job) => (job.id === updatedJob.id ? updatedJob : job))
            );

            // Notify parent component when job completes
            if (updatedJob.status === 'completed' && onJobComplete) {
              onJobComplete(updatedJob.id);
            }
          } else if (payload.eventType === 'DELETE') {
            setJobs((prev) => prev.filter((job) => job.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, onJobComplete]);

  async function fetchJobs() {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select(`
        *,
        exam_papers (
          title
        )
      `)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching jobs:', error);
      return;
    }

    setJobs(data || []);
  }

  async function clearCompletedJobs() {
    setIsClearing(true);
    try {
      const { data, error } = await supabase.rpc('clear_completed_processing_jobs');

      if (error) {
        console.error('Error clearing jobs:', error);
        alert('Failed to clear completed jobs. Please try again.');
        return;
      }

      console.log(`Cleared ${data} completed/failed jobs`);
      await fetchJobs();
    } catch (error) {
      console.error('Error clearing jobs:', error);
      alert('Failed to clear completed jobs. Please try again.');
    } finally {
      setIsClearing(false);
    }
  }

  // Check if all jobs are completed or failed (no active jobs)
  const hasActiveJobs = jobs.some(
    (job) => job.status === 'pending' || job.status === 'processing'
  );
  const hasCompletedJobs = jobs.some(
    (job) => job.status === 'completed' || job.status === 'failed'
  );
  const canClearQueue = jobs.length > 0 && !hasActiveJobs && hasCompletedJobs;

  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Processing Queue</h3>
        {canClearQueue && (
          <button
            onClick={clearCompletedJobs}
            disabled={isClearing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-gray-400 rounded-lg transition-colors"
            title="Clear all completed and failed jobs"
          >
            <Trash2 className="w-4 h-4" />
            {isClearing ? 'Clearing...' : 'Clear Queue'}
          </button>
        )}
      </div>
      <div className="space-y-3">
        {jobs.map((job) => (
          <JobStatusItem key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

function JobStatusItem({ job }: { job: ProcessingJob }) {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-400" />;
      case 'processing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (job.status) {
      case 'pending':
        return 'bg-gray-100 text-gray-700';
      case 'processing':
        return 'bg-blue-100 text-blue-700';
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <p className="font-medium">
              {job.exam_papers?.title || `Job ${job.id.substring(0, 8)}`}
            </p>
            <p className="text-sm text-gray-500">{job.current_step}</p>
          </div>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}
        >
          {job.status}
        </span>
      </div>

      {job.status === 'processing' && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{job.progress_percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${job.progress_percentage}%` }}
            />
          </div>
        </div>
      )}

      {job.status === 'failed' && job.error_message && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
          {job.error_message}
        </div>
      )}
    </div>
  );
}
