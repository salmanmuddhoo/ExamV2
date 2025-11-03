import { useState, useEffect } from 'react';
import { X, List, AlertCircle, CheckCircle, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface QuestionChapterData {
  question_id: string;
  question_number: number;
  chapters: {
    chapter_id: string;
    chapter_number: string;
    chapter_title: string;
    confidence_score: number;
    is_primary: boolean;
  }[];
}

interface Props {
  examPaperId: string;
  examTitle: string;
  onClose: () => void;
}

export function QuestionChapterSummary({ examPaperId, examTitle, onClose }: Props) {
  const [questions, setQuestions] = useState<QuestionChapterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuestionChapterData();
  }, [examPaperId]);

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
                  <div className="flex items-start space-x-3">
                    {/* Question Number Badge */}
                    <div className="flex-shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-bold text-sm">Q{question.question_number}</span>
                      </div>
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
                  </div>
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
              <span className="inline-flex items-center">
                <BookOpen className="w-3 h-3 text-gray-400 mr-1" />
                Secondary chapter
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
