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
  Edit3,
  AlertCircle
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
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [notesTimeoutId, setNotesTimeoutId] = useState<NodeJS.Timeout | null>(null);

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
      setEditTitle(event.title);
      setEditDescription(event.description || '');
      setIsEditingDetails(false);
    }
  }, [event]);

  // Auto-save notes with debounce
  useEffect(() => {
    if (!event) return;

    // Clear existing timeout
    if (notesTimeoutId) {
      clearTimeout(notesTimeoutId);
    }

    // Only auto-save if notes have changed from the original
    if (notes !== (event.completion_notes || '')) {
      const timeoutId = setTimeout(async () => {
        try {
          const { error } = await supabase
            .from('study_plan_events')
            .update({
              completion_notes: notes,
              updated_at: new Date().toISOString()
            })
            .eq('id', event.id);

          if (!error) {
            onUpdate();
          }
        } catch (error) {
          console.error('Error auto-saving notes:', error);
        }
      }, 1000); // Wait 1 second after user stops typing

      setNotesTimeoutId(timeoutId);
    }

    // Cleanup on unmount
    return () => {
      if (notesTimeoutId) {
        clearTimeout(notesTimeoutId);
      }
    };
  }, [notes, event]);

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

  const handleSaveEditedDetails = async () => {
    // Validate title is not empty
    if (!editTitle.trim()) {
      setAlertConfig({
        title: 'Error',
        message: 'Title cannot be empty',
        type: 'error'
      });
      setShowAlert(true);
      return;
    }

    // Check if anything changed
    const titleChanged = editTitle !== event.title;
    const descriptionChanged = editDescription !== (event.description || '');
    const dateChanged = editDate !== event.event_date;
    const startTimeChanged = editStartTime !== event.start_time;
    const endTimeChanged = editEndTime !== event.end_time;

    if (!titleChanged && !descriptionChanged && !dateChanged && !startTimeChanged && !endTimeChanged) {
      setIsEditingDetails(false);
      return;
    }

    // If date/time changed, check for conflicts
    if (dateChanged || startTimeChanged || endTimeChanged) {
      try {
        const { data: existingEvents, error: fetchError } = await supabase
          .from('study_plan_events')
          .select('id, start_time, end_time')
          .eq('user_id', event.user_id)
          .eq('event_date', editDate)
          .neq('id', event.id);

        if (fetchError) throw fetchError;

        const timeToMinutes = (timeStr: string) => {
          const [hours, minutes] = timeStr.split(':').map(Number);
          return hours * 60 + minutes;
        };

        const newStartMinutes = timeToMinutes(editStartTime);
        const newEndMinutes = timeToMinutes(editEndTime);

        const hasOverlap = existingEvents?.some((existingEvent) => {
          const existingStartMinutes = timeToMinutes(existingEvent.start_time);
          const existingEndMinutes = timeToMinutes(existingEvent.end_time);
          return newStartMinutes < existingEndMinutes && existingStartMinutes < newEndMinutes;
        });

        if (hasOverlap) {
          setAlertConfig({
            title: 'Time Conflict',
            message: 'There is already another study session scheduled during this time.',
            type: 'error'
          });
          setShowAlert(true);
          return;
        }
      } catch (error) {
        console.error('Error checking conflicts:', error);
      }
    }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('study_plan_events')
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          event_date: editDate,
          start_time: editStartTime,
          end_time: editEndTime,
          updated_at: new Date().toISOString()
        })
        .eq('id', event.id);

      if (error) throw error;

      onUpdate();
      setIsEditingDetails(false);
      setAlertConfig({
        title: 'Success',
        message: 'Details updated successfully',
        type: 'success'
      });
      setShowAlert(true);
    } catch (error) {
      console.error('Error saving details:', error);
      setAlertConfig({
        title: 'Error',
        message: 'Failed to save changes',
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

  // Check if event is overdue
  const isEventOverdue = (event: StudyPlanEvent) => {
    if (event.status === 'completed' || event.status === 'skipped') {
      return false; // Completed and skipped events are never overdue
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const eventDate = new Date(event.event_date);
    eventDate.setHours(0, 0, 0, 0);
    return eventDate < today;
  };

  const getStatusConfig = (status: StudyPlanEvent['status'], isOverdue: boolean) => {
    if (isOverdue) {
      return {
        icon: AlertCircle,
        label: 'Overdue',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-300'
      };
    }
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

  const isOverdue = isEventOverdue(event);
  const statusConfig = getStatusConfig(event.status, isOverdue);
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
          <div className="flex items-center space-x-2">
            {/* Mobile only: Edit button in header */}
            <div className="md:hidden flex items-center space-x-2">
              {!isEditingDetails ? (
                <button
                  onClick={() => setIsEditingDetails(true)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Edit details"
                >
                  <Edit3 className="w-4 h-4 text-gray-600" />
                </button>
              ) : (
                <button
                  onClick={handleSaveEditedDetails}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Subject Badge with Edit Button (Desktop) */}
          {(() => {
            const subjectName = (event as any).study_plan_schedules?.subjects?.name;
            if (subjectName) {
              return (
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm">
                    <BookOpen className="w-4 h-4 mr-1.5" />
                    {subjectName}
                  </span>
                  {/* Desktop only: Edit button next to subject badge */}
                  <div className="hidden md:flex items-center space-x-2">
                    {!isEditingDetails ? (
                      <button
                        onClick={() => setIsEditingDetails(true)}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Edit details"
                      >
                        <Edit3 className="w-4 h-4 mr-1.5" />
                        Edit
                      </button>
                    ) : (
                      <button
                        onClick={handleSaveEditedDetails}
                        disabled={saving}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-medium bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* Overdue Warning Banner */}
          {isOverdue && (
            <div className="bg-red-50 border-2 border-red-400 rounded-lg p-3 mb-3">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-900">This task is overdue!</p>
                  <p className="text-xs text-red-700 mt-0.5">
                    This session was scheduled for {formatDate(event.event_date)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Title & Description */}
          {!isEditingDetails ? (
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{event.title}</h3>
              {event.description && (
                <p className="text-sm text-gray-600">{event.description}</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                  Session Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-base font-semibold border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  placeholder="Enter session title..."
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                  Session Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Add a description for this session..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent resize-none"
                  rows={2}
                />
              </div>
            </>
          )}

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

          {/* Date & Time */}
          {!isEditingDetails ? (
            <div className="flex items-center space-x-4 text-sm text-gray-700">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span>{formatDate(event.event_date)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <span>{formatTime(event.start_time)} - {formatTime(event.end_time)}</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-gray-900 mb-1.5">
                Date & Time
              </label>
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                    placeholder="Start"
                  />
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                    placeholder="End"
                  />
                </div>
              </div>
            </div>
          )}

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
              <span className="ml-2 text-xs text-gray-500 font-normal">(Auto-saved)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about your study session..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-black focus:border-transparent resize-none"
              rows={3}
            />
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
