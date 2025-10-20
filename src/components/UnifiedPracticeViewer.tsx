import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, BookOpen, FileText, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  mode: 'year' | 'chapter';
  gradeId: string;
  subjectId: string;
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
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionsLoading, setQuestionsLoading] = useState(false);

  useEffect(() => {
    fetchGradeAndSubject();
    if (mode === 'year') {
      fetchPapers();
    } else {
      fetchChapters();
    }
  }, [mode, gradeId, subjectId]);

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

  const fetchChapters = async () => {
    try {
      setLoading(true);

      // First, get the syllabus for this grade and subject
      const { data: syllabusData, error: syllabusError } = await supabase
        .from('syllabus')
        .select('id')
        .eq('grade_id', gradeId)
        .eq('subject_id', subjectId)
        .maybeSingle();

      if (syllabusError) throw syllabusError;

      if (!syllabusData) {
        console.log('No syllabus found for this grade/subject');
        setChapters([]);
        setLoading(false);
        return;
      }

      // Fetch chapters with question counts
      const { data: chaptersData, error: chaptersError } = await supabase
        .from('syllabus_chapters')
        .select(`
          id,
          chapter_number,
          chapter_title,
          question_chapter_tags(count)
        `)
        .eq('syllabus_id', syllabusData.id)
        .order('chapter_number');

      if (chaptersError) throw chaptersError;

      // Format chapters with question counts
      const formattedChapters = (chaptersData || []).map(ch => ({
        id: ch.id,
        chapter_number: ch.chapter_number,
        chapter_title: ch.chapter_title,
        question_count: Array.isArray(ch.question_chapter_tags) ? ch.question_chapter_tags.length : 0
      }));

      // Filter out chapters with no questions
      const chaptersWithQuestions = formattedChapters.filter(ch => ch.question_count && ch.question_count > 0);

      setChapters(chaptersWithQuestions);

      // Auto-select first chapter with questions
      if (chaptersWithQuestions.length > 0) {
        handleChapterSelect(chaptersWithQuestions[0]);
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
    } finally {
      setLoading(false);
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

  const handleChapterSelect = async (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setCurrentQuestionIndex(0);
    await fetchQuestionsForChapter(chapter.id);
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
    } catch (error) {
      console.error('Error fetching questions:', error);
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];

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
              {mode === 'year' ? 'Exam Papers' : 'Chapters'}
            </h3>

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
                {chapters.map(chapter => (
                  <button
                    key={chapter.id}
                    onClick={() => handleChapterSelect(chapter)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selectedChapter?.id === chapter.id
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-900 border-gray-200 hover:border-black'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <BookOpen className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          Chapter {chapter.chapter_number}
                        </p>
                        <p className="text-xs mt-0.5 truncate">
                          {chapter.chapter_title}
                        </p>
                        <p className={`text-xs mt-0.5 ${
                          selectedChapter?.id === chapter.id ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          {chapter.question_count} questions
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

            {mode === 'chapter' && chapters.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No chapters with questions available
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
            // Chapter Mode: Question Viewer
            <div className="flex-1 bg-gray-100 flex flex-col">
              {questionsLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">Loading questions...</p>
                  </div>
                </div>
              ) : !selectedChapter ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md p-6">
                    <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Select a chapter to start practicing</p>
                  </div>
                </div>
              ) : questions.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md p-6">
                    <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">No questions available</p>
                    <p className="text-sm text-gray-500">
                      Chapter {selectedChapter.chapter_number} - {selectedChapter.chapter_title}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Question Display Area */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-4xl mx-auto">
                      {/* Question Info */}
                      <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {currentQuestion.exam_papers.title} - Question {currentQuestion.question_number}
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                              {currentQuestion.exam_papers.year} {currentQuestion.exam_papers.month}
                            </p>
                          </div>
                          <div className="text-sm text-gray-600">
                            Question {currentQuestionIndex + 1} of {questions.length}
                          </div>
                        </div>
                      </div>

                      {/* Question Images */}
                      <div className="space-y-4">
                        {(currentQuestion.image_urls && currentQuestion.image_urls.length > 0
                          ? currentQuestion.image_urls
                          : [currentQuestion.image_url]
                        ).map((imageUrl, idx) => (
                          <img
                            key={idx}
                            src={imageUrl}
                            alt={`Question ${currentQuestion.question_number} - Image ${idx + 1}`}
                            className="w-full rounded-lg shadow-sm bg-white"
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Navigation Controls */}
                  <div className="border-t border-gray-200 bg-white p-4">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                      <button
                        onClick={handlePrevQuestion}
                        disabled={currentQuestionIndex === 0}
                        className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span className="text-sm font-medium">Previous</span>
                      </button>

                      <div className="text-sm text-gray-600">
                        {currentQuestionIndex + 1} / {questions.length}
                      </div>

                      <button
                        onClick={handleNextQuestion}
                        disabled={currentQuestionIndex === questions.length - 1}
                        className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="text-sm font-medium">Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Chat Assistant (TODO - will be added in next phase) */}
        </div>
      </div>
    </div>
  );
}
