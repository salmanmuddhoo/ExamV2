import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, FileText, Calendar, Loader2 } from 'lucide-react';

interface ChapterQuestionSummaryProps {
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onQuestionClick?: (questionId: string) => void;
}

interface QuestionTag {
  question_id: string;
  exam_questions: {
    question_number: string;
    exam_papers: {
      year: number;
      month: number | null;
      title: string;
    } | null;
  } | null;
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function ChapterQuestionSummary({
  chapterId,
  chapterNumber,
  chapterTitle,
  isOpen,
  onClose,
  onQuestionClick
}: ChapterQuestionSummaryProps) {
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<QuestionTag[]>([]);

  const getMonthName = (monthNumber: number | null): string => {
    if (!monthNumber) return 'N/A';
    return MONTH_NAMES[monthNumber] || 'N/A';
  };

  useEffect(() => {
    if (isOpen && chapterId) {
      fetchQuestions();
    }
  }, [isOpen, chapterId]);

  const fetchQuestions = async () => {
    try {
      setLoading(true);

      console.log('Fetching questions for chapter:', chapterId);

      const { data, error } = await supabase
        .from('question_chapter_tags')
        .select(`
          question_id,
          exam_questions!inner(
            question_number,
            exam_papers!inner(
              year,
              month,
              title
            )
          )
        `)
        .eq('chapter_id', chapterId);

      console.log('Raw data from query:', data);
      console.log('Query error:', error);

      if (error) {
        console.error('Error fetching chapter questions:', error);
        throw error;
      }

      console.log('Valid data:', data);

      // Sort in JavaScript instead of Supabase
      // !inner join already filters out nulls, so no need for additional filtering
      const sortedData = (data || []).sort((a: any, b: any) => {
        const aYear = a.exam_questions.exam_papers.year;
        const bYear = b.exam_questions.exam_papers.year;
        const aMonth = a.exam_questions.exam_papers.month || 0;
        const bMonth = b.exam_questions.exam_papers.month || 0;

        if (aYear !== bYear) {
          return bYear - aYear; // Descending
        }
        return aMonth - bMonth; // Ascending
      });

      setQuestions(sortedData);
    } catch (error) {
      console.error('Error fetching chapter questions:', error);
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Group questions by year/month/paper (each paper gets its own row)
  const groupedQuestions = questions.reduce((acc, q) => {
    if (!q.exam_questions?.exam_papers) return acc;

    const paper = q.exam_questions.exam_papers;
    const key = `${paper.year}-${paper.month || 0}-${paper.title}`;
    if (!acc[key]) {
      acc[key] = {
        year: paper.year,
        month: paper.month,
        monthName: getMonthName(paper.month),
        title: paper.title,
        questions: []
      };
    }
    acc[key].questions.push({
      id: q.question_id,
      number: q.exam_questions.question_number
    });
    return acc;
  }, {} as Record<string, { year: number; month: number | null; monthName: string; title: string; questions: { id: string; number: string }[] }>);

  // Sort groups by year (descending), month (descending), then by title
  const sortedGroups = Object.values(groupedQuestions).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year; // Latest year first
    if (a.month !== b.month) return (b.month || 0) - (a.month || 0); // Latest month first within same year
    return a.title.localeCompare(b.title); // Then sort by paper title alphabetically
  });

  // Sort questions within each group by question number (ascending)
  sortedGroups.forEach(group => {
    group.questions.sort((a, b) => {
      const numA = parseInt(a.number) || 0;
      const numB = parseInt(b.number) || 0;
      return numA - numB;
    });
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
                            Exam Paper
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
                                  {group.year} / {group.monthName}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-700">{group.title}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-2">
                                {group.questions.map((q, qIdx) => (
                                  <button
                                    key={qIdx}
                                    onClick={() => {
                                      if (onQuestionClick) {
                                        onQuestionClick(q.id);
                                        onClose();
                                      }
                                    }}
                                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer"
                                  >
                                    Q{q.number}
                                  </button>
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
                        <div className="mb-3">
                          <div className="flex items-center space-x-2 mb-1">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-semibold text-gray-900">
                              {group.year} / {group.monthName}
                            </span>
                          </div>
                          <span className="text-xs text-gray-600">{group.title}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {group.questions.map((q, qIdx) => (
                            <button
                              key={qIdx}
                              onClick={() => {
                                if (onQuestionClick) {
                                  onQuestionClick(q.id);
                                  onClose();
                                }
                              }}
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer"
                            >
                              Q{q.number}
                            </button>
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
