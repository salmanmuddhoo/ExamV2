import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  PlayCircle,
  Circle,
  SkipForward,
  Save,
  Trash2,
  BookOpen,
  Edit2
} from 'lucide-react';
import { StudyPlanEvent } from '../types/studyPlan';

interface EventDetailModalProps {
  event: StudyPlanEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

export function EventDetailModal({ event, isOpen, onClose, onUpdate, onDelete }: EventDetailModalProps) {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditingDateTime, setIsEditingDateTime] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  useEffect(() => {
    if (event) {
      setNotes(event.completion_notes || '');
      setEditDate(event.event_date);
      setEditStartTime(event.start_time);
      setEditEndTime(event.end_time);
      setIsEditingDateTime(false);
    }
  }, [event]);

  if (!isOpen || !event) return null;

  const handleUpdateStatus = async (status: StudyPlanEvent['status']) => {
    try {
      setSaving(true);
      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        updateData.completion_notes = notes;
      } else if (event.status === 'completed' && status !== 'completed') {
        // If unchecking completed, remove completion data
        updateData.completed_at = null;
        updateData.completion_notes = null;
      }

      const { error } = await supabase
        .from('study_plan_events')
        .update(updateData)
        .eq('id', event.id);

      if (error) throw error;

      onUpdate();
    } catch (error) {
      console.error('Error updating event:', error);
      alert('Failed to update event status');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('study_plan_events')
        .update({
          completion_notes: notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', event.id);

      if (error) throw error;

      onUpdate();
      alert('Notes saved successfully');
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this study session?')) {
      return;
    }

    try {
      setDeleting(true);
      const { error } = await supabase
        .from('study_plan_events')
        .delete()
        .eq('id', event.id);

      if (error) throw error;

      onDelete();
      onClose();
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveDateTime = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('study_plan_events')
        .update({
          event_date: editDate,
          start_time: editStartTime,
          end_time: editEndTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', event.id);

      if (error) throw error;

      setIsEditingDateTime(false);
      onUpdate();
    } catch (error) {
      console.error('Error updating date/time:', error);
      alert('Failed to update date/time');
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (timeStr: string) => {
    // Remove seconds if present (HH:MM:SS -> HH:MM)
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0]);
      const minutes = timeParts[1];
      const period = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      return `${displayHours}:${minutes} ${period}`;
    }
    return timeStr;
  };

  const getStatusConfig = (status: StudyPlanEvent['status']) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle2,
          label: 'Completed',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'in_progress':
        return {
          icon: PlayCircle,
          label: 'In Progress',
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
      case 'skipped':
        return {
          icon: SkipForward,
          label: 'Skipped',
          color: 'text-gray-500',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        };
      default:
        return {
          icon: Circle,
          label: 'Pending',
          color: 'text-gray-400',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        };
    }
  };

  const statusConfig = getStatusConfig(event.status);
  const StatusIcon = statusConfig.icon;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900">Study Session Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Title */}
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h3>
            {event.description && (
              <p className="text-gray-600">{event.description}</p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              Status
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { status: 'pending', icon: Circle, label: 'Pending', color: 'gray' },
                { status: 'in_progress', icon: PlayCircle, label: 'In Progress', color: 'blue' },
                { status: 'completed', icon: CheckCircle2, label: 'Completed', color: 'green' },
                { status: 'skipped', icon: SkipForward, label: 'Skipped', color: 'gray' }
              ].map(({ status, icon: Icon, label, color }) => (
                <button
                  key={status}
                  onClick={() => handleUpdateStatus(status as StudyPlanEvent['status'])}
                  disabled={saving}
                  className={`p-3 border-2 rounded-lg transition-all ${
                    event.status === status
                      ? `border-${color}-600 bg-${color}-50`
                      : 'border-gray-200 hover:border-gray-300'
                  } disabled:opacity-50`}
                >
                  <Icon className={`w-5 h-5 mx-auto mb-1 ${
                    event.status === status ? `text-${color}-600` : 'text-gray-400'
                  }`} />
                  <span className={`text-xs font-medium ${
                    event.status === status ? `text-${color}-900` : 'text-gray-700'
                  }`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-900">
                Date & Time
              </label>
              {!isEditingDateTime ? (
                <button
                  onClick={() => setIsEditingDateTime(true)}
                  className="flex items-center space-x-1 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              ) : (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setEditDate(event.event_date);
                      setEditStartTime(event.start_time);
                      setEditEndTime(event.end_time);
                      setIsEditingDateTime(false);
                    }}
                    className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveDateTime}
                    disabled={saving}
                    className="flex items-center space-x-1 px-3 py-1 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    <Save className="w-3 h-3" />
                    <span>{saving ? 'Saving...' : 'Save'}</span>
                  </button>
                </div>
              )}
            </div>

            {isEditingDateTime ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => setEditStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                    <input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => setEditEndTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`p-4 rounded-lg border ${statusConfig.bgColor} ${statusConfig.borderColor}`}>
                  <div className="flex items-center space-x-2 mb-1">
                    <Calendar className={`w-4 h-4 ${statusConfig.color}`} />
                    <span className="text-sm font-semibold text-gray-900">Date</span>
                  </div>
                  <p className="text-gray-900 font-medium">{formatDate(event.event_date)}</p>
                </div>
                <div className={`p-4 rounded-lg border ${statusConfig.bgColor} ${statusConfig.borderColor}`}>
                  <div className="flex items-center space-x-2 mb-1">
                    <Clock className={`w-4 h-4 ${statusConfig.color}`} />
                    <span className="text-sm font-semibold text-gray-900">Time</span>
                  </div>
                  <p className="text-gray-900 font-medium">
                    {formatTime(event.start_time)} - {formatTime(event.end_time)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Topics */}
          {event.topics && event.topics.length > 0 && (
            <div>
              <div className="flex items-center space-x-2 mb-3">
                <BookOpen className="w-4 h-4 text-gray-700" />
                <label className="text-sm font-semibold text-gray-900">
                  Topics to Cover
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                {event.topics.map((topic, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium border border-purple-200"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Notes & Progress
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about your study session, what you learned, or any challenges..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              rows={4}
            />
            <button
              onClick={handleSaveNotes}
              disabled={saving || notes === (event.completion_notes || '')}
              className="mt-2 flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Notes'}</span>
            </button>
          </div>

          {/* Completion Info */}
          {event.completed_at && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-1">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-green-900">Completed</span>
              </div>
              <p className="text-sm text-green-800">
                {new Date(event.completed_at).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center space-x-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>{deleting ? 'Deleting...' : 'Delete Session'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
