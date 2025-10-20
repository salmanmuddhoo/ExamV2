import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, BookOpen, FileText, Loader2 } from 'lucide-react';
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
  chapter_number: string;
  title: string;
  question_count?: number;
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
        .from('syllabi')
        .select('id')
        .eq('grade_level_id', gradeId)
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
          title,
          question_chapter_tags(count)
        `)
        .eq('syllabus_id', syllabusData.id)
        .order('chapter_number');

      if (chaptersError) throw chaptersError;

      // Format chapters with question counts
      const formattedChapters = (chaptersData || []).map(ch => ({
        id: ch.id,
        chapter_number: ch.chapter_number,
        title: ch.title,
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

  const handleChapterSelect = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    // TODO: Load questions for this chapter
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
                          {chapter.title}
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
            // Chapter Mode: Question Viewer (TODO)
            <div className="flex-1 bg-gray-100 flex items-center justify-center">
              <div className="text-center max-w-md p-6">
                <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Chapter Practice Mode</p>
                <p className="text-sm text-gray-500">
                  {selectedChapter
                    ? `Selected: Chapter ${selectedChapter.chapter_number} - ${selectedChapter.title}`
                    : 'Select a chapter to start practicing'}
                </p>
                <p className="text-xs text-gray-400 mt-4">
                  Question viewer coming next...
                </p>
              </div>
            </div>
          )}

          {/* Chat Assistant (TODO - will be added in next phase) */}
        </div>
      </div>
    </div>
  );
}
