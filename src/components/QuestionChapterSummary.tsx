import { useState, useEffect } from 'react';
import { X, List, AlertCircle, CheckCircle, BookOpen, Edit2, Save, XCircle, FileImage } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface QuestionChapterData {
  question_id: string;
  question_number: number;
  references_insert: boolean;
  chapters: {
    chapter_id: string;
    chapter_number: string;
    chapter_title: string;
    confidence_score: number;
    is_primary: boolean;
  }[];
}

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  chapter_description: string | null;
}

interface Props {
  examPaperId: string;
  examTitle: string;
  syllabusId: string | null;
  onClose: () => void;
}

export function QuestionChapterSummary({ examPaperId, examTitle, syllabusId, onClose }: Props) {
  const [questions, setQuestions] = useState<QuestionChapterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [availableChapters, setAvailableChapters] = useState<Chapter[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [primaryChapterId, setPrimaryChapterId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchQuestionChapterData();
    if (syllabusId) {
      fetchAvailableChapters();
    }
  }, [examPaperId, syllabusId]);

  const fetchAvailableChapters = async () => {
    if (!syllabusId) return;

    try {
      const { data, error } = await supabase
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title, chapter_description')
        .eq('syllabus_id', syllabusId)
        .order('display_order');

      if (error) throw error;
      setAvailableChapters(data || []);
    } catch (err) {
      console.error('Error fetching chapters:', err);
    }
  };

  const fetchQuestionChapterData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch questions with their chapter tags
      const { data, error: fetchError } = await supabase
        .from('question_with_chapters')
        .select('*')
        .eq('exam_paper_id', examPaperId)
        .order('question_number', { ascending: true });

      if (fetchError) throw fetchError;

      setQuestions(data || []);
    } catch (err) {
      console.error('Error fetching question-chapter data:', err);
      setError('Failed to load question-chapter summary');
    } finally {
      setLoading(false);
    }
  };

  const getTotalQuestions = () => questions.length;
  const getTaggedQuestions = () => questions.filter(q => q.chapters && q.chapters.length > 0).length;
  const getUntaggedQuestions = () => questions.filter(q => !q.chapters || q.chapters.length === 0).length;

  const handleStartEdit = (question: QuestionChapterData) => {
    setEditingQuestionId(question.question_id);
    // Set current chapter selections
    const currentChapterIds = question.chapters?.map(c => c.chapter_id) || [];
    setSelectedChapterIds(currentChapterIds);
    // Set primary chapter
    const primary = question.chapters?.find(c => c.is_primary);
    setPrimaryChapterId(primary?.chapter_id || null);
  };

  const handleCancelEdit = () => {
    setEditingQuestionId(null);
    setSelectedChapterIds([]);
    setPrimaryChapterId(null);
  };

  const toggleChapterSelection = (chapterId: string) => {
    setSelectedChapterIds(prev => {
      if (prev.includes(chapterId)) {
        // Deselecting - also clear primary if it was primary
        if (primaryChapterId === chapterId) {
          setPrimaryChapterId(null);
        }
        return prev.filter(id => id !== chapterId);
      } else {
        // Selecting - if no primary set, make this primary
        const newSelection = [...prev, chapterId];
        if (!primaryChapterId) {
          setPrimaryChapterId(chapterId);
        }
        return newSelection;
      }
    });
  };

  const handleSaveChanges = async () => {
    if (!editingQuestionId) return;

    setSaving(true);
    try {
      // Call RPC function to update question chapter tags
      const { data, error } = await supabase.rpc('update_question_chapter_tags', {
        p_question_id: editingQuestionId,
        p_chapter_ids: selectedChapterIds,
        p_primary_chapter_id: primaryChapterId
      });

      if (error) throw error;

      // Refresh the question data
      await fetchQuestionChapterData();
      handleCancelEdit();
    } catch (err: any) {
      console.error('Error saving chapter tags:', err);
      alert(`Failed to save changes: ${err.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleInsertReference = async (questionId: string, currentValue: boolean) => {
    try {
      const { error } = await supabase
        .from('exam_questions')
        .update({ references_insert: !currentValue })
        .eq('id', questionId);

      if (error) throw error;

      // Refresh the question data
      await fetchQuestionChapterData();
    } catch (err: any) {
      console.error('Error updating insert reference:', err);
      alert(`Failed to update insert reference: ${err.message || 'Unknown error'}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-2 rounded-lg">
              <List className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Question-Chapter Summary</h2>
              <p className="text-sm text-gray-600">{examTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Summary Stats */}
        {!loading && !error && (
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{getTotalQuestions()}</div>
                <div className="text-xs text-gray-600">Total Questions</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{getTaggedQuestions()}</div>
                <div className="text-xs text-gray-600">Tagged to Chapters</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{getUntaggedQuestions()}</div>
                <div className="text-xs text-gray-600">Untagged</div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black mb-2"></div>
                <p className="text-gray-600 text-sm">Loading question data...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                <p className="text-red-600 font-medium">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && questions.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <List className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 font-medium mb-1">No questions found</p>
                <p className="text-sm text-gray-500">This exam paper hasn't been processed yet</p>
              </div>
            </div>
          )}

          {!loading && !error && questions.length > 0 && (
            <div className="space-y-3">
              {questions.map((question) => (
                <div
                  key={question.question_id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                >
                  {editingQuestionId === question.question_id ? (
                    /* Edit Mode */
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-sm">Q{question.question_number}</span>
                          </div>
                          <span className="font-semibold text-gray-900">Edit Chapter Tags</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={handleSaveChanges}
                            disabled={saving || selectedChapterIds.length === 0}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{saving ? 'Saving...' : 'Save'}</span>
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={saving}
                            className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium flex items-center space-x-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>

                      {availableChapters.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                          <p className="text-sm">No syllabus assigned to this exam paper.</p>
                          <p className="text-xs mt-1">Please assign a syllabus to enable chapter tagging.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          <p className="text-xs text-gray-600 mb-2">
                            Select chapters for this question. Click the radio button to mark a chapter as primary.
                          </p>
                          {availableChapters.map((chapter) => {
                            const isSelected = selectedChapterIds.includes(chapter.id);
                            const isPrimary = primaryChapterId === chapter.id;

                            return (
                              <div
                                key={chapter.id}
                                className={`flex items-center space-x-3 p-3 rounded-lg border-2 transition-all ${
                                  isSelected
                                    ? isPrimary
                                      ? 'border-green-500 bg-green-50'
                                      : 'border-blue-500 bg-blue-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleChapterSelection(chapter.id)}
                                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <input
                                  type="radio"
                                  checked={isPrimary}
                                  onChange={() => setPrimaryChapterId(chapter.id)}
                                  disabled={!isSelected}
                                  className="w-4 h-4 border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2">
                                    <span className={`text-sm font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                                      Chapter {chapter.chapter_number}: {chapter.chapter_title}
                                    </span>
                                    {isPrimary && (
                                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                        Primary
                                      </span>
                                    )}
                                  </div>
                                  {chapter.chapter_description && (
                                    <p className="text-xs text-gray-500 mt-1">{chapter.chapter_description}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* View Mode */
                    <div className="flex items-start space-x-3">
                      {/* Question Number Badge */}
                      <div className="flex-shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                          <span className="text-white font-bold text-sm">Q{question.question_number}</span>
                        </div>
                      </div>

                      {/* Insert Reference Checkbox */}
                      <div className="flex-shrink-0 flex items-center">
                        <label className="flex items-center space-x-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={question.references_insert}
                            onChange={() => handleToggleInsertReference(question.question_id, question.references_insert)}
                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                            title={question.references_insert ? "Question references insert" : "Question does not reference insert"}
                          />
                          <FileImage
                            className={`w-4 h-4 ${question.references_insert ? 'text-purple-600' : 'text-gray-400'} group-hover:text-purple-500 transition-colors`}
                            title="Insert"
                          />
                        </label>
                      </div>

                      {/* Chapter Tags */}
                      <div className="flex-1 min-w-0">
                        {question.chapters && question.chapters.length > 0 ? (
                          <div className="space-y-2">
                            {question.chapters.map((chapter, idx) => (
                              <div
                                key={chapter.chapter_id}
                                className={`flex items-center space-x-2 ${
                                  chapter.is_primary ? 'font-medium' : ''
                                }`}
                              >
                                {chapter.is_primary && (
                                  <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                                )}
                                {!chapter.is_primary && (
                                  <BookOpen className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                )}
                                <span className="text-sm text-gray-900">
                                  Chapter {chapter.chapter_number}: {chapter.chapter_title}
                                </span>
                                {chapter.is_primary && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                    Primary
                                  </span>
                                )}
                                <span className="text-xs text-gray-500">
                                  {(chapter.confidence_score * 100).toFixed(0)}% match
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 text-orange-600">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm font-medium">Not tagged to any chapter</span>
                          </div>
                        )}
                      </div>

                      {/* Edit Button */}
                      {syllabusId && (
                        <button
                          onClick={() => handleStartEdit(question)}
                          className="flex-shrink-0 p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Edit chapter tags"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-600">
              <span className="inline-flex items-center mr-4">
                <CheckCircle className="w-3 h-3 text-green-600 mr-1" />
                Primary chapter
              </span>
              <span className="inline-flex items-center mr-4">
                <BookOpen className="w-3 h-3 text-gray-400 mr-1" />
                Secondary chapter
              </span>
              <span className="inline-flex items-center">
                <FileImage className="w-3 h-3 text-purple-600 mr-1" />
                Requires insert
              </span>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
