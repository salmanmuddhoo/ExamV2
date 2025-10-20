import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, BookOpen, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  mode: 'year' | 'chapter';
  gradeId: string;
  subjectId: string;
  chapterId?: string | null;
  onBack: () => void;
  onLoginRequired: () => void;
  onOpenSubscriptions?: () => void;
}

interface ExamPaper {
  id: string;
  title: string;
  pdf_url: string;
  pdf_path: string;
  year: number;
  month: string;
}

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  question_count?: number;
}

interface Question {
  id: string;
  question_number: string;
  image_url: string;
  image_urls: string[];
  exam_papers: {
    title: string;
    year: number;
    month: string;
  };
}

interface Grade {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
}

export function UnifiedPracticeViewer({
  mode,
  gradeId,
  subjectId,
  chapterId,
  onBack,
  onLoginRequired,
  onOpenSubscriptions
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);

  // Year mode state
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Chapter mode state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [chapterInfo, setChapterInfo] = useState<Chapter | null>(null);

  useEffect(() => {
    fetchGradeAndSubject();
    if (mode === 'year') {
      fetchPapers();
    } else if (mode === 'chapter' && chapterId) {
      fetchChapterInfo();
      fetchQuestionsForChapter(chapterId);
    }
  }, [mode, gradeId, subjectId, chapterId]);

  const fetchGradeAndSubject = async () => {
    try {
      const [gradeRes, subjectRes] = await Promise.all([
        supabase.from('grade_levels').select('*').eq('id', gradeId).single(),
        supabase.from('subjects').select('*').eq('id', subjectId).single(),
      ]);

      if (gradeRes.data) setGrade(gradeRes.data);
      if (subjectRes.data) setSubject(subjectRes.data);
    } catch (error) {
      console.error('Error fetching grade/subject:', error);
    }
  };

  const fetchPapers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('exam_papers')
        .select('id, title, pdf_url, pdf_path, year, month')
        .eq('grade_level_id', gradeId)
        .eq('subject_id', subjectId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (error) throw error;
      setPapers(data || []);

      // Auto-select first paper
      if (data && data.length > 0) {
        handlePaperSelect(data[0]);
      }
    } catch (error) {
      console.error('Error fetching papers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChapterInfo = async () => {
    if (!chapterId) return;

    try {
      const { data, error } = await supabase
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title')
        .eq('id', chapterId)
        .single();

      if (error) throw error;

      if (data) {
        setChapterInfo({
          id: data.id,
          chapter_number: data.chapter_number,
          chapter_title: data.chapter_title
        });
      }
    } catch (error) {
      console.error('Error fetching chapter info:', error);
    }
  };

  const handlePaperSelect = async (paper: ExamPaper) => {
    setSelectedPaper(paper);
    setPdfLoading(true);

    try {
      // Get signed URL for PDF
      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from('exam-papers')
        .createSignedUrl(paper.pdf_path, 3600);

      if (signedUrlError || !signedData?.signedUrl) {
        console.error('Failed to get signed URL:', signedUrlError);
        throw new Error('Failed to get signed URL');
      }

      setPdfBlobUrl(signedData.signedUrl);
    } catch (error) {
      console.error('Error loading PDF:', error);
      const { data: { publicUrl } } = supabase.storage
        .from('exam-papers')
        .getPublicUrl(paper.pdf_path);
      setPdfBlobUrl(publicUrl || paper.pdf_url);
    } finally {
      setPdfLoading(false);
    }
  };

  const fetchQuestionsForChapter = async (chapterId: string) => {
    try {
      setQuestionsLoading(true);

      const { data, error } = await supabase
        .from('question_chapter_tags')
        .select(`
          question_id,
          exam_questions!inner(
            id,
            question_number,
            image_url,
            image_urls,
            exam_papers!inner(
              title,
              year,
              month
            )
          )
        `)
        .eq('chapter_id', chapterId);

      if (error) throw error;

      // Format questions and sort by year (in JavaScript)
      const formattedQuestions = (data || [])
        .map((tag: any) => ({
          id: tag.exam_questions.id,
          question_number: tag.exam_questions.question_number,
          image_url: tag.exam_questions.image_url,
          image_urls: tag.exam_questions.image_urls || [],
          exam_papers: tag.exam_questions.exam_papers
        }))
        .sort((a, b) => {
          // Sort by year (most recent first), then by question number
          if (a.exam_papers.year !== b.exam_papers.year) {
            return b.exam_papers.year - a.exam_papers.year;
          }
          return parseInt(a.question_number) - parseInt(b.question_number);
        });

      setQuestions(formattedQuestions);

      // Auto-select first question
      if (formattedQuestions.length > 0) {
        setSelectedQuestion(formattedQuestions[0]);
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
      setLoading(false);
    }
  };

  const handleQuestionSelect = (question: Question) => {
    setSelectedQuestion(question);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">
              {subject?.name} - Grade {grade?.name}
            </h1>
            <p className="text-xs text-gray-500">
              {mode === 'year' ? 'Practice by Year' : 'Practice by Chapter'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {mode === 'year' ? 'Exam Papers' : chapterInfo ? `Chapter ${chapterInfo.chapter_number}` : 'Questions'}
            </h3>
            {mode === 'chapter' && chapterInfo && (
              <p className="text-xs text-gray-600 mb-3">{chapterInfo.chapter_title}</p>
            )}

            {mode === 'year' ? (
              <div className="space-y-2">
                {papers.map(paper => (
                  <button
                    key={paper.id}
                    onClick={() => handlePaperSelect(paper)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selectedPaper?.id === paper.id
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-900 border-gray-200 hover:border-black'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{paper.title}</p>
                        <p className={`text-xs mt-0.5 ${
                          selectedPaper?.id === paper.id ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          {paper.year} {paper.month}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((question, idx) => (
                  <button
                    key={question.id}
                    onClick={() => handleQuestionSelect(question)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selectedQuestion?.id === question.id
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-900 border-gray-200 hover:border-black'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          Q{question.question_number}
                        </p>
                        <p className={`text-xs mt-0.5 truncate ${
                          selectedQuestion?.id === question.id ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          {question.exam_papers.title}
                        </p>
                        <p className={`text-xs mt-0.5 ${
                          selectedQuestion?.id === question.id ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          {question.exam_papers.year} {question.exam_papers.month}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {mode === 'year' && papers.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No exam papers available
              </p>
            )}

            {mode === 'chapter' && questions.length === 0 && !questionsLoading && (
              <p className="text-sm text-gray-500 text-center py-8">
                No questions available
              </p>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {mode === 'year' ? (
            // Year Mode: PDF Viewer
            <div className="flex-1 bg-gray-100 relative">
              {pdfLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">Loading PDF...</p>
                  </div>
                </div>
              ) : pdfBlobUrl && selectedPaper ? (
                <iframe
                  src={pdfBlobUrl}
                  className="w-full h-full border-0"
                  title={selectedPaper.title}
                  allow="fullscreen"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md p-6">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Select an exam paper to view</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Chapter Mode: Question Image Viewer
            <div className="flex-1 bg-gray-100">
              {questionsLoading ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">Loading questions...</p>
                  </div>
                </div>
              ) : !selectedQuestion ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md p-6">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Select a question to view</p>
                  </div>
                </div>
              ) : (
                <div className="h-full overflow-y-auto p-6">
                  <div className="max-w-4xl mx-auto">
                    {/* Question Images */}
                    <div className="space-y-4">
                      {(selectedQuestion.image_urls && selectedQuestion.image_urls.length > 0
                        ? selectedQuestion.image_urls
                        : [selectedQuestion.image_url]
                      ).map((imageUrl, idx) => (
                        <img
                          key={idx}
                          src={imageUrl}
                          alt={`Question ${selectedQuestion.question_number} - Image ${idx + 1}`}
                          className="w-full rounded-lg shadow-sm bg-white"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat Assistant (TODO - will be added in next phase) */}
        </div>
      </div>
    </div>
  );
}
