import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { BookOpen, Filter, ChevronDown, ChevronRight, Tag } from 'lucide-react';

interface Subject {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  name: string;
}

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  chapter_description: string | null;
  questionCount: number;
}

interface Question {
  id: string;
  question_number: string;
  ocr_text: string;
  image_url: string;
  image_urls: string[];
  exam_title: string;
  exam_year: number;
  exam_month: number | null;
  confidence_score: number;
  is_primary: boolean;
  match_reasoning: string | null;
}

export function QuestionBankByChapter() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedSubject && selectedGrade) {
      fetchChapters();
    } else {
      setChapters([]);
      setQuestions([]);
      setSelectedChapter('');
    }
  }, [selectedSubject, selectedGrade]);

  useEffect(() => {
    if (selectedChapter) {
      fetchQuestions();
    } else {
      setQuestions([]);
    }
  }, [selectedChapter]);

  const fetchInitialData = async () => {
    try {
      const [subjectsRes, gradesRes] = await Promise.all([
        supabase.from('subjects').select('*').order('name'),
        supabase.from('grade_levels').select('*').order('display_order'),
      ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (gradesRes.error) throw gradesRes.error;

      setSubjects(subjectsRes.data || []);
      setGradeLevels(gradesRes.data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const fetchChapters = async () => {
    try {
      // First, get the syllabus for this subject and grade
      const { data: syllabus, error: syllabusError } = await supabase
        .from('syllabus')
        .select('id')
        .eq('subject_id', selectedSubject)
        .eq('grade_id', selectedGrade)
        .eq('processing_status', 'completed')
        .single();

      if (syllabusError || !syllabus) {
        setChapters([]);
        return;
      }

      // Get chapters with question counts
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('syllabus_chapters')
        .select(`
          id,
          chapter_number,
          chapter_title,
          chapter_description
        `)
        .eq('syllabus_id', syllabus.id)
        .order('display_order');

      if (chaptersError) throw chaptersError;

      // Get question counts for each chapter
      const chaptersWithCounts = await Promise.all(
        (chaptersData || []).map(async (chapter) => {
          const { count } = await supabase
            .from('question_chapter_tags')
            .select('*', { count: 'exact', head: true })
            .eq('chapter_id', chapter.id);

          return {
            ...chapter,
            questionCount: count || 0,
          };
        })
      );

      setChapters(chaptersWithCounts);
    } catch (error) {
    }
  };

  const fetchQuestions = async () => {
    setLoadingQuestions(true);
    try {
      const { data, error } = await supabase
        .from('question_chapter_tags')
        .select(`
          confidence_score,
          is_primary,
          match_reasoning,
          exam_questions (
            id,
            question_number,
            ocr_text,
            image_url,
            image_urls,
            exam_papers (
              title,
              year,
              month
            )
          )
        `)
        .eq('chapter_id', selectedChapter);

      if (error) throw error;

      const formattedQuestions = (data || []).map((item: any) => ({
        id: item.exam_questions.id,
        question_number: item.exam_questions.question_number,
        ocr_text: item.exam_questions.ocr_text,
        image_url: item.exam_questions.image_url,
        image_urls: item.exam_questions.image_urls,
        exam_title: item.exam_questions.exam_papers.title,
        exam_year: item.exam_questions.exam_papers.year,
        exam_month: item.exam_questions.exam_papers.month,
        confidence_score: item.confidence_score,
        is_primary: item.is_primary,
        match_reasoning: item.match_reasoning,
      }));

      // Sort by year (most recent first), then by month, then by question number
      formattedQuestions.sort((a, b) => {
        // First sort by year (descending - most recent first)
        if (a.exam_year !== b.exam_year) {
          return b.exam_year - a.exam_year;
        }
        // Then by month (descending - most recent first)
        if (a.exam_month !== b.exam_month) {
          return (b.exam_month || 0) - (a.exam_month || 0);
        }
        // Then by question number (ascending)
        return parseInt(a.question_number) - parseInt(b.question_number);
      });

      setQuestions(formattedQuestions);
    } catch (error) {
    } finally {
      setLoadingQuestions(false);
    }
  };

  const getMonthName = (month: number | null): string => {
    if (!month) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1] || '';
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading...</div>;
  }

  return (
    <div>
      <div className="flex items-center space-x-3 mb-6">
        <BookOpen className="w-6 h-6 text-black" />
        <h2 className="text-2xl font-semibold text-gray-900">Question Bank by Chapter</h2>
      </div>

      {/* Filters */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center space-x-2 mb-3">
          <Filter className="w-4 h-4 text-gray-600" />
          <h3 className="text-sm font-medium text-gray-900">Filter Questions</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-900 mb-1">
              Subject
            </label>
            <select
              id="subject"
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value);
                setSelectedChapter('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black"
            >
              <option value="">Select a subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="grade" className="block text-sm font-medium text-gray-900 mb-1">
              Grade Level
            </label>
            <select
              id="grade"
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setSelectedChapter('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black"
            >
              <option value="">Select a grade</option>
              {gradeLevels.map((grade) => (
                <option key={grade.id} value={grade.id}>
                  {grade.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chapters List */}
      {selectedSubject && selectedGrade && (
        <div className="space-y-3 mb-6">
          {chapters.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No syllabus found for this subject and grade level.
              <br />
              Please upload a syllabus first.
            </div>
          ) : (
            chapters.map((chapter) => (
              <div
                key={chapter.id}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => {
                    if (selectedChapter === chapter.id) {
                      setSelectedChapter('');
                      setExpandedChapter(null);
                    } else {
                      setSelectedChapter(chapter.id);
                      setExpandedChapter(chapter.id);
                    }
                  }}
                  className="w-full flex items-center justify-between p-4 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    {expandedChapter === chapter.id ? (
                      <ChevronDown className="w-5 h-5 text-gray-600" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    )}
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">
                        Chapter {chapter.chapter_number}: {chapter.chapter_title}
                      </h3>
                      {chapter.chapter_description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {chapter.chapter_description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full">
                      {chapter.questionCount} {chapter.questionCount === 1 ? 'question' : 'questions'}
                    </span>
                  </div>
                </button>

                {/* Questions for this chapter */}
                {expandedChapter === chapter.id && (
                  <div className="border-t border-gray-200 bg-gray-50 p-4">
                    {loadingQuestions ? (
                      <div className="text-center py-4 text-gray-600">Loading questions...</div>
                    ) : questions.length === 0 ? (
                      <div className="text-center py-4 text-gray-600">
                        No questions found for this chapter.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Summary Table */}
                        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                  Question
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                  Year
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                  Exam Paper
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                  Match
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {questions.map((question, idx) => (
                                <tr key={question.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center">
                                      <span className="font-medium text-gray-900">Q{question.question_number}</span>
                                      {question.is_primary && (
                                        <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                          Primary
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <span className="text-sm font-medium text-gray-900">
                                      {question.exam_year}
                                    </span>
                                    {question.exam_month && (
                                      <span className="ml-1 text-sm text-gray-600">
                                        ({getMonthName(question.exam_month)})
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-sm text-gray-900">{question.exam_title}</span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                      {Math.round(question.confidence_score * 100)}%
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                                    <button
                                      onClick={() => {
                                        const element = document.getElementById(`question-detail-${idx}`);
                                        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                      }}
                                      className="text-black hover:text-gray-700 font-medium"
                                    >
                                      View
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Detailed Questions View */}
                        <div className="space-y-4 mt-6">
                          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                            Question Details
                          </h4>
                          {questions.map((question, idx) => (
                            <div
                              id={`question-detail-${idx}`}
                              key={question.id}
                              className="bg-white p-4 rounded-lg border border-gray-200 scroll-mt-4"
                            >
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-semibold text-gray-900">
                                    Question {question.question_number}
                                  </h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    {question.exam_title} • {getMonthName(question.exam_month)} {question.exam_year}
                                  </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                  {question.is_primary && (
                                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">
                                      Primary
                                    </span>
                                  )}
                                  <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                                    {Math.round(question.confidence_score * 100)}% match
                                  </span>
                                </div>
                              </div>

                              {question.match_reasoning && (
                                <div className="flex items-start space-x-2 mb-3 p-2 bg-blue-50 rounded">
                                  <Tag className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                  <p className="text-sm text-blue-900">{question.match_reasoning}</p>
                                </div>
                              )}

                              {/* Question Images */}
                              <div className="space-y-2">
                                {(question.image_urls && question.image_urls.length > 0
                                  ? question.image_urls
                                  : [question.image_url]
                                ).map((imageUrl, imageIdx) => (
                                  <img
                                    key={imageIdx}
                                    src={imageUrl}
                                    alt={`Question ${question.question_number} - Page ${imageIdx + 1}`}
                                    className="w-full border border-gray-300 rounded-lg"
                                  />
                                ))}
                              </div>

                              {/* OCR Text Preview */}
                              {question.ocr_text && (
                                <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                                  <p className="text-xs text-gray-600 font-medium mb-1">Question Text:</p>
                                  <p className="text-sm text-gray-800">
                                    {question.ocr_text.substring(0, 200)}
                                    {question.ocr_text.length > 200 ? '...' : ''}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {!selectedSubject && !selectedGrade && (
        <div className="text-center py-12 text-gray-600">
          <BookOpen className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>Select a subject and grade level to view the question bank organized by chapters.</p>
        </div>
      )}
    </div>
  );
}
