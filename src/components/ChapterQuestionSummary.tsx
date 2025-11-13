import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, FileText, Calendar, Loader2 } from 'lucide-react';

interface ChapterQuestionSummaryProps {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

interface QuestionTag {
  id: string;
  question_number: string;
  exam_paper: {
    year: number;
    month: string;
    variant: string;
  };
}

export function ChapterQuestionSummary({
  chapterId,
  chapterNumber,
  chapterTitle,
  isOpen,
  onClose
}: ChapterQuestionSummaryProps) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionTag[]>([]);

  useEffect(() => {
    if (isOpen && chapterId) {
      fetchQuestions();
    }
  }, [isOpen, chapterId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('question_chapter_tags')
        .select(`
          id,
          question_number,
          exam_papers!inner(
            year,
            month,
            variant
          )
        `)
        .eq('chapter_id', chapterId)
        .order('exam_papers(year)', { ascending: false })
        .order('exam_papers(month)', { ascending: true });

      if (error) throw error;

      setQuestions(data || []);
    } catch (error) {
      console.error('Error fetching chapter questions:', error);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Group questions by year/month
  const groupedQuestions = questions.reduce((acc, q) => {
    const paper = q.exam_paper;
    const key = `${paper.year}-${paper.month}`;
    if (!acc[key]) {
      acc[key] = {
        year: paper.year,
        month: paper.month,
        variant: paper.variant,
        questions: []
      };
    }
    acc[key].questions.push(q.question_number);
    return acc;
  }, {} as Record<string, { year: number; month: string; variant: string; questions: string[] }>);

  const sortedGroups = Object.values(groupedQuestions).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return a.month.localeCompare(b.month);
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="relative bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                    Chapter {chapterNumber}: {chapterTitle}
                  </h2>
                  <p className="text-xs sm:text-sm text-gray-600 mt-1">
                    {questions.length} question{questions.length !== 1 ? 's' : ''} tagged to this chapter
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : questions.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-600">No questions tagged to this chapter yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Desktop Table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Year/Month
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Variant
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Question Numbers
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {sortedGroups.map((group, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center space-x-2">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                <span className="text-sm font-medium text-gray-900">
                                  {group.year} / {group.month}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-700">{group.variant}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-2">
                                {group.questions.map((qNum, qIdx) => (
                                  <span
                                    key={qIdx}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                                  >
                                    Q{qNum}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="sm:hidden space-y-3">
                    {sortedGroups.map((group, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-semibold text-gray-900">
                              {group.year} / {group.month}
                            </span>
                          </div>
                          <span className="text-xs text-gray-600">{group.variant}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.questions.map((qNum, qIdx) => (
                            <span
                              key={qIdx}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                            >
                              Q{qNum}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
