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
  BookOpen
} from 'lucide-react';
import { StudyPlanEvent } from '../types/studyPlan';
import { AlertModal } from './AlertModal';
import { ConfirmModal } from './ConfirmModal';

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
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Alert modal state
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'info' | 'warning'
  });

  // Confirm modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    title: '',
    message: '',
    onConfirm: () => {}
  });

  useEffect(() => {
    if (event) {
      setNotes(event.completion_notes || '');
      setEditDate(event.event_date);
      setEditStartTime(event.start_time);
      setEditEndTime(event.end_time);
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
      setAlertConfig({
        title: 'Error',
        message: 'Failed to update event status',
        type: 'error'
      });
      setShowAlert(true);
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
      setAlertConfig({
        title: 'Success',
        message: 'Notes saved successfully',
        type: 'success'
      });
      setShowAlert(true);
    } catch (error) {
      console.error('Error saving notes:', error);
      setAlertConfig({
        title: 'Error',
        message: 'Failed to save notes',
        type: 'error'
      });
      setShowAlert(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    setConfirmConfig({
      title: 'Delete Study Session',
      message: 'Are you sure you want to delete this study session? This action cannot be undone.',
      onConfirm: async () => {
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
          setAlertConfig({
            title: 'Error',
            message: 'Failed to delete event',
            type: 'error'
          });
          setShowAlert(true);
        } finally {
          setDeleting(false);
        }
      }
    });
    setShowConfirm(true);
  };

  const handleSaveDateTime = async () => {
    // Only save if values have changed
    if (editDate === event.event_date && editStartTime === event.start_time && editEndTime === event.end_time) {
      return;
    }

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

      onUpdate();
    } catch (error) {
      console.error('Error updating date/time:', error);
      setAlertConfig({
        title: 'Error',
        message: 'Failed to update date/time',
        type: 'error'
      });
      setShowAlert(true);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (timeStr: string) => {
    // Parse HH:MM or HH:MM:SS format and format according to user's locale
    const timeParts = timeStr.split(':');
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0]);
      const minutes = parseInt(timeParts[1]);

      // Create a date object with the time (date doesn't matter for formatting)
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);

      // Format using user's locale (automatically uses 12/24 hour based on locale)
      return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: undefined // Let the locale decide
      });
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
    return new Date(dateStr).toLocaleDateString(undefined, {
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
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900">Study Session Details</h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Subject Badge */}
          {(() => {
            const subjectName = (event as any).study_plan_schedules?.subjects?.name;
            if (subjectName) {
              return (
                <div className="mb-3">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm">
                    <BookOpen className="w-4 h-4 mr-1.5" />
                    {subjectName}
                  </span>
                </div>
              );
            }
            return null;
          })()}

          {/* Title */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{event.title}</h3>
            {event.description && (
              <p className="text-sm text-gray-600">{event.description}</p>
            )}
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1.5">
              Status
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {/* Pending */}
              <button
                onClick={() => handleUpdateStatus('pending')}
                disabled={saving}
                title="Pending"
                className={`p-2 md:p-1.5 border-2 rounded-lg transition-all disabled:opacity-50 ${
                  event.status === 'pending'
                    ? 'border-gray-400 bg-gray-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <Circle className={`w-4 h-4 md:w-3.5 md:h-3.5 mx-auto md:mb-0.5 ${
                  event.status === 'pending' ? 'text-gray-600' : 'text-gray-400'
                }`} />
                <span className={`hidden md:block text-[10px] font-medium ${
                  event.status === 'pending' ? 'text-gray-900' : 'text-gray-700'
                }`}>
                  Pending
                </span>
              </button>

              {/* In Progress */}
              <button
                onClick={() => handleUpdateStatus('in_progress')}
                disabled={saving}
                title="In Progress"
                className={`p-2 md:p-1.5 border-2 rounded-lg transition-all disabled:opacity-50 ${
                  event.status === 'in_progress'
                    ? 'border-blue-500 bg-blue-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <PlayCircle className={`w-4 h-4 md:w-3.5 md:h-3.5 mx-auto md:mb-0.5 ${
                  event.status === 'in_progress' ? 'text-blue-600' : 'text-gray-400'
                }`} />
                <span className={`hidden md:block text-[10px] font-medium ${
                  event.status === 'in_progress' ? 'text-blue-900' : 'text-gray-700'
                }`}>
                  In Progress
                </span>
              </button>

              {/* Completed */}
              <button
                onClick={() => handleUpdateStatus('completed')}
                disabled={saving}
                title="Completed"
                className={`p-2 md:p-1.5 border-2 rounded-lg transition-all disabled:opacity-50 ${
                  event.status === 'completed'
                    ? 'border-green-500 bg-green-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 md:w-3.5 md:h-3.5 mx-auto md:mb-0.5 ${
                  event.status === 'completed' ? 'text-green-600' : 'text-gray-400'
                }`} />
                <span className={`hidden md:block text-[10px] font-medium ${
                  event.status === 'completed' ? 'text-green-900' : 'text-gray-700'
                }`}>
                  Completed
                </span>
              </button>

              {/* Skipped */}
              <button
                onClick={() => handleUpdateStatus('skipped')}
                disabled={saving}
                title="Skipped"
                className={`p-2 md:p-1.5 border-2 rounded-lg transition-all disabled:opacity-50 ${
                  event.status === 'skipped'
                    ? 'border-orange-400 bg-orange-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <SkipForward className={`w-4 h-4 md:w-3.5 md:h-3.5 mx-auto md:mb-0.5 ${
                  event.status === 'skipped' ? 'text-orange-600' : 'text-gray-400'
                }`} />
                <span className={`hidden md:block text-[10px] font-medium ${
                  event.status === 'skipped' ? 'text-orange-900' : 'text-gray-700'
                }`}>
                  Skipped
                </span>
              </button>
            </div>
          </div>

          {/* Date & Time - Compact & Always Editable */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1.5">
              Date & Time
            </label>
            <div className="grid grid-cols-1 gap-2">
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                onBlur={handleSaveDateTime}
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={editStartTime}
                  onChange={(e) => setEditStartTime(e.target.value)}
                  onBlur={handleSaveDateTime}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="Start"
                />
                <input
                  type="time"
                  value={editEndTime}
                  onChange={(e) => setEditEndTime(e.target.value)}
                  onBlur={handleSaveDateTime}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="End"
                />
              </div>
            </div>
          </div>

          {/* Topics */}
          {event.topics && event.topics.length > 0 && (
            <div>
              <div className="flex items-center space-x-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-gray-700" />
                <label className="text-xs font-semibold text-gray-900">
                  Topics to Cover
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {event.topics.map((topic, index) => (
                  <span
                    key={index}
                    className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium border border-gray-200"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-900 mb-1.5">
              Notes & Progress
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about your study session..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-black focus:border-transparent resize-none"
              rows={3}
            />
            <button
              onClick={handleSaveNotes}
              disabled={saving || notes === (event.completion_notes || '')}
              className="mt-1.5 flex items-center space-x-1.5 px-3 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? 'Saving...' : 'Save Notes'}</span>
            </button>
          </div>

          {/* Completion Info */}
          {event.completed_at && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-2.5">
              <div className="flex items-center space-x-1.5 mb-0.5">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold text-green-900">Completed</span>
              </div>
              <p className="text-xs text-green-800">
                {new Date(event.completed_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short'
                })}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleting ? 'Deleting...' : 'Delete Session'}</span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Alert Modal */}
      <AlertModal
        isOpen={showAlert}
        onClose={() => setShowAlert(false)}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
      />

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type="danger"
        confirmText="Delete"
      />
    </div>
  );
}
