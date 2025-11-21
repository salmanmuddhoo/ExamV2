import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, ChevronRight, Loader2, FileText, ChevronLeft, Calendar, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface GradeLevel {
  id: string;
  name: string;
  display_order: number;
}

interface Subject {
  id: string;
  name: string;
}

interface ExamPaper {
  id: string;
  title: string;
  year: number;
  month?: number | null;
  subject_id: string;
  grade_level_id: string;
  is_accessible?: boolean; // Added for tier-based access control
  access_status?: string; // Added for free tier status
}

interface Syllabus {
  id: string;
  title: string | null;
  region: string | null;
  subject_id: string;
  grade_id: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectPaper: (paperId: string) => void;
  onSelectMode?: (mode: 'year' | 'chapter', gradeId: string, subjectId: string, chapterId?: string) => void;
}

type Step = 'grade' | 'subject' | 'mode' | 'year' | 'chapter' | 'paper';
type PracticeMode = 'year' | 'chapter';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  question_count?: number;
}

export function PaperSelectionModal({ isOpen, onClose, onSelectPaper, onSelectMode }: Props) {
  const { user } = useAuth();
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>('grade');
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [existingConvs, setExistingConvs] = useState<Record<string, boolean>>({});
  const [hasChapterAccess, setHasChapterAccess] = useState(true); // New state for chapter access
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]); // Available subjects for selected grade
  const [hasActiveSyllabus, setHasActiveSyllabus] = useState(true); // Track if subject has active syllabus

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setCurrentStep('grade');
      setSelectedGrade(null);
      setSelectedSubject(null);
      setSelectedMode(null);
      setSelectedYear(null);
      setSelectedChapter(null);
      setHasActiveSyllabus(true);
    }
  }, [isOpen]);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (user) {
        // Fetch accessible grades, subjects, and papers based on user's subscription
        const [accessibleGrades, allSubjects, accessiblePapers] = await Promise.all([
          supabase.rpc('get_accessible_grades_for_user', { p_user_id: user.id }),
          supabase.from('subjects').select('*').order('name'),
          supabase.rpc('get_user_paper_access_status', { p_user_id: user.id }),
        ]);

        if (accessibleGrades.error) {
          // Fallback to all grades
          const { data: allGrades } = await supabase.from('grade_levels').select('*').order('display_order');
          setGradeLevels(allGrades || []);
        } else {
          setGradeLevels(accessibleGrades.data?.map((g: any) => ({
            id: g.grade_id,
            name: g.grade_name,
            display_order: g.display_order
          })) || []);
        }

        setSubjects(allSubjects.data || []);

        // Handle RPC errors gracefully (might happen if user just signed up and migrations aren't applied)
        if (accessiblePapers.error) {
          console.warn('Could not fetch paper access status. User may need to verify email or migrations may need to be applied:', accessiblePapers.error.message);
        }

        // Fetch all papers with year/month information
        const { data: allPapersData } = await supabase
          .from('exam_papers')
          .select('id, title, year, month, subject_id, grade_level_id')
          .order('year', { ascending: false })
          .order('title');

        // Filter to only accessible papers and map to ExamPaper format
        if (accessiblePapers.error || !accessiblePapers.data) {
          // Fallback to all papers if RPC fails
          setPapers(allPapersData || []);
        } else {
          // Get accessible paper IDs from RPC
          const accessibleIds = new Set(
            accessiblePapers.data
              .filter((p: any) => p.is_accessible)
              .map((p: any) => p.paper_id)
          );

          // Filter papers to only accessible ones
          const papers = (allPapersData || [])
            .filter(p => accessibleIds.has(p.id))
            .map(p => ({
              ...p,
              is_accessible: true,
              access_status: 'accessible'
            }));

          setPapers(papers);
        }

        // Fetch existing conversations
        const { data: convs, error } = await supabase
          .from('conversations')
          .select('exam_paper_id')
          .eq('user_id', user.id);

        if (error) throw error;

        const convMap: Record<string, boolean> = {};
        convs?.forEach((c: any) => {
          convMap[c.exam_paper_id] = true;
        });
        setExistingConvs(convMap);

        // Fetch user's tier to check chapter_wise_access
        await fetchUserTierAccess();
      } else {
        // Not logged in - show all grades and subjects
        const [gradesRes, subjectsRes, papersRes] = await Promise.all([
          supabase.from('grade_levels').select('*').order('display_order'),
          supabase.from('subjects').select('*').order('name'),
          supabase.from('exam_papers').select('id, title, year, month, subject_id, grade_level_id').order('year', { ascending: false }).order('title'),
        ]);

        setGradeLevels(gradesRes.data || []);
        setSubjects(subjectsRes.data || []);
        setPapers(papersRes.data || []);
      }

    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const fetchUserTierAccess = async () => {
    if (!user) return;

    try {
      // Get user's active subscription
      const { data: subscription, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
          tier_id,
          subscription_tiers!inner(
            chapter_wise_access
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subError) {
        setHasChapterAccess(true); // Default to true on error
        return;
      }

      if (subscription && subscription.subscription_tiers) {
        const tierData = subscription.subscription_tiers as any;
        setHasChapterAccess(tierData.chapter_wise_access ?? true);
      } else {
        setHasChapterAccess(true); // Default to true if no subscription found
      }
    } catch (error) {
      setHasChapterAccess(true); // Default to true on error
    }
  };

  const getAvailableSubjectsForGrade = async (gradeId: string) => {
    if (!user) {
      // For non-logged in users, show all subjects for this grade
      const subjectIds = new Set(
        papers
          .filter(p => p.grade_level_id === gradeId)
          .map(p => p.subject_id)
      );
      return subjects.filter(s => subjectIds.has(s.id));
    }

    // For logged in users, fetch accessible subjects
    try {
      const { data: accessibleSubjects, error } = await supabase
        .rpc('get_accessible_subjects_for_user', {
          p_user_id: user.id,
          p_grade_id: gradeId
        });

      if (error) {
        // Fallback to all subjects for this grade
        const subjectIds = new Set(
          papers
            .filter(p => p.grade_level_id === gradeId)
            .map(p => p.subject_id)
        );
        return subjects.filter(s => subjectIds.has(s.id));
      }

      // Filter to only subjects that have papers in this grade
      const availableSubjectIds = new Set(
        papers
          .filter(p => p.grade_level_id === gradeId)
          .map(p => p.subject_id)
      );

      return subjects.filter(s =>
        availableSubjectIds.has(s.id) &&
        accessibleSubjects?.some((as: any) => as.subject_id === s.id)
      );
    } catch (error) {
      // Fallback
      const subjectIds = new Set(
        papers
          .filter(p => p.grade_level_id === gradeId)
          .map(p => p.subject_id)
      );
      return subjects.filter(s => subjectIds.has(s.id));
    }
  };

  const getPapersForSubjectAndGrade = (subjectId: string, gradeId: string) => {
    return papers.filter(p => p.subject_id === subjectId && p.grade_level_id === gradeId);
  };

  const getAvailableYears = () => {
    if (!selectedGrade || !selectedSubject) return [];

    const papersForSubject = getPapersForSubjectAndGrade(selectedSubject.id, selectedGrade.id);
    const years = Array.from(new Set(papersForSubject.map(p => p.year)));
    return years.sort((a, b) => b - a); // Descending order
  };

  const getPapersForYear = (year: number) => {
    if (!selectedGrade || !selectedSubject) return [];

    const filteredPapers = papers.filter(p =>
      p.subject_id === selectedSubject.id &&
      p.grade_level_id === selectedGrade.id &&
      p.year === year
    );

    // Sort by month - June (6) first, then November (11)
    return filteredPapers.sort((a, b) => {
      const monthA = a.month || 0;
      const monthB = b.month || 0;
      return monthA - monthB;
    });
  };

  const formatMonth = (month: number | null | undefined): string => {
    if (!month || month < 1 || month > 12) return '';
    return MONTHS[month - 1];
  };

  const handleGradeClick = async (grade: GradeLevel) => {
    setSelectedGrade(grade);
    setSelectedSubject(null);
    setSelectedMode(null);
    setLoading(true);

    // Fetch available subjects for this grade
    const subjects = await getAvailableSubjectsForGrade(grade.id);
    setAvailableSubjects(subjects);

    setLoading(false);
    setCurrentStep('subject');
  };

  const handleSubjectClick = (subject: Subject) => {
    setSelectedSubject(subject);
    setSelectedMode(null);
    setCurrentStep('mode');
  };

  const handleModeClick = async (mode: PracticeMode) => {
    setSelectedMode(mode);
    if (mode === 'chapter') {
      // For chapter mode, fetch chapters directly from active syllabus
      await fetchChaptersForSelection();
      setCurrentStep('chapter');
    } else {
      // For year mode, show year selection first
      setCurrentStep('year');
    }
  };

  const handleYearClick = (year: number) => {
    setSelectedYear(year);
    setCurrentStep('paper');
  };

  const fetchChaptersForSelection = async () => {
    if (!selectedGrade || !selectedSubject) return;

    try {
      setLoading(true);

      // First, get the active syllabus for this grade/subject
      // Use maybeSingle() to handle cases where there's no active syllabus
      const { data: syllabusData, error: syllabusError } = await supabase
        .from('syllabus')
        .select('id')
        .eq('subject_id', selectedSubject.id)
        .eq('grade_id', selectedGrade.id)
        .eq('processing_status', 'completed')
        .eq('is_active', true)
        .maybeSingle();

      // If no active syllabus found, set flag and clear chapters
      if (!syllabusData) {
        console.warn(
          `⚠️ No active syllabus found for ${selectedSubject.name} (${selectedGrade.name}).`
        );

        setHasActiveSyllabus(false);
        setChapters([]);
        return;
      }

      // Active syllabus exists
      setHasActiveSyllabus(true);
      var activeSyllabusId = syllabusData.id;

      // Query from question_chapter_tags and join with chapters
      // This ensures we only get chapters that have at least one tag
      const { data: tagsData, error } = await supabase
        .from('question_chapter_tags')
        .select(`
          chapter_id,
          syllabus_chapters!inner(
            id,
            chapter_number,
            chapter_title,
            syllabus_id
          )
        `)
        .eq('syllabus_chapters.syllabus_id', activeSyllabusId);

      if (error) {
        setChapters([]);
        return;
      }

      if (!tagsData || tagsData.length === 0) {
        setChapters([]);
        return;
      }

      // Count questions per chapter
      const chapterCounts = new Map<string, number>();
      const chapterDetails = new Map<string, any>();

      tagsData.forEach((row: any) => {
        const chapterId = row.chapter_id;
        const chapterInfo = row.syllabus_chapters;

        // Count tags per chapter
        chapterCounts.set(chapterId, (chapterCounts.get(chapterId) || 0) + 1);

        // Store chapter details (only once per chapter)
        if (!chapterDetails.has(chapterId)) {
          chapterDetails.set(chapterId, {
            id: chapterInfo.id,
            chapter_number: chapterInfo.chapter_number,
            chapter_title: chapterInfo.chapter_title
          });
        }
      });

      // Build unique chapters array with counts
      const chaptersWithQuestions = Array.from(chapterDetails.values()).map(chapter => ({
        ...chapter,
        question_count: chapterCounts.get(chapter.id) || 0
      }));

      // Sort by chapter number
      chaptersWithQuestions.sort((a, b) => a.chapter_number - b.chapter_number);

      setChapters(chaptersWithQuestions);
    } catch (error) {
      setChapters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChapterClick = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    if (onSelectMode && selectedGrade && selectedSubject) {
      onSelectMode('chapter', selectedGrade.id, selectedSubject.id, chapter.id);
      handleClose();
    }
  };

  const handlePaperClick = (paper: ExamPaper) => {
    onSelectPaper(paper.id);
    handleClose();
  };

  const handleBack = () => {
    if (currentStep === 'paper' && selectedMode === 'year') {
      setSelectedYear(null);
      setCurrentStep('year');
    } else if (currentStep === 'paper') {
      setSelectedMode(null);
      setCurrentStep('mode');
    } else if (currentStep === 'year') {
      setSelectedMode(null);
      setCurrentStep('mode');
    } else if (currentStep === 'chapter') {
      setSelectedChapter(null);
      setSelectedMode(null);
      setCurrentStep('mode');
    } else if (currentStep === 'mode') {
      setSelectedSubject(null);
      setCurrentStep('subject');
    } else if (currentStep === 'subject') {
      setSelectedGrade(null);
      setCurrentStep('grade');
    }
  };

  const handleClose = () => {
    setSelectedGrade(null);
    setSelectedSubject(null);
    setSelectedMode(null);
    setSelectedChapter(null);
    setHasActiveSyllabus(true);
    setCurrentStep('grade');
    onClose();
  };

  if (!isOpen) return null;

  const availableYears = getAvailableYears();
  const availablePapers = selectedGrade && selectedSubject && selectedYear
    ? getPapersForYear(selectedYear)
    : [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {currentStep !== 'grade' && (
              <button onClick={handleBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {currentStep === 'grade' && 'Select Grade Level'}
                {currentStep === 'subject' && `Grade ${selectedGrade?.name} - Select Subject`}
                {currentStep === 'mode' && `${selectedSubject?.name} - Choose Practice Mode`}
                {currentStep === 'year' && `Practice by Year - Select Year`}
                {currentStep === 'chapter' && `Practice by Chapter - Select Chapter`}
                {currentStep === 'paper' && `${selectedYear} - Select Paper`}
              </h2>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading...</p>
            </div>
          ) : (
            <>
              {currentStep === 'grade' && gradeLevels
                .filter(grade => {
                  // Only show grades that have at least 1 accessible subject
                  const subjectCount = new Set(
                    papers.filter(p => p.grade_level_id === grade.id).map(p => p.subject_id)
                  ).size;
                  return subjectCount > 0;
                })
                .map(grade => {
                  const subjectCount = new Set(
                    papers.filter(p => p.grade_level_id === grade.id).map(p => p.subject_id)
                  ).size;

                  return (
                    <button key={grade.id} onClick={() => handleGradeClick(grade)} className="w-full text-left px-4 py-4 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-center justify-between group">
                      <div>
                        <p className="font-semibold text-gray-900 text-lg">Grade {grade.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {subjectCount} {subjectCount === 1 ? 'subject' : 'subjects'} available
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-black transition-colors" />
                    </button>
                  );
                })}

              {currentStep === 'subject' && availableSubjects.map(subject => (
                <button key={subject.id} onClick={() => handleSubjectClick(subject)} className="w-full text-left px-4 py-4 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-center justify-between group">
                  <div>
                    <p className="font-semibold text-gray-900 text-lg">{subject.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {getPapersForSubjectAndGrade(subject.id, selectedGrade!.id).length} papers available
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-black transition-colors" />
                </button>
              ))}

              {currentStep === 'year' && (
                <div className="space-y-3">
                  {availableYears.length === 0 ? (
                    <div className="text-center py-12">
                      <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No papers available for this subject</p>
                    </div>
                  ) : (
                    availableYears.map((year) => {
                      const yearPapers = getPapersForYear(year);
                      return (
                        <button
                          key={year}
                          onClick={() => handleYearClick(year)}
                          className="w-full text-left px-4 py-4 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-center justify-between group"
                        >
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-black group-hover:text-white transition-colors">
                              <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 text-lg">{year}</p>
                              <p className="text-sm text-gray-500 mt-0.5">
                                {yearPapers.length} {yearPapers.length === 1 ? 'paper' : 'papers'} available
                              </p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-black transition-colors" />
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              {currentStep === 'mode' && (
                <div className="space-y-3">
                  <button
                    onClick={() => handleModeClick('year')}
                    className="w-full text-left px-5 py-5 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-start space-x-4 group"
                  >
                    <div className="p-3 bg-gray-100 rounded-lg group-hover:bg-black group-hover:text-white transition-colors">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900 text-lg mb-1">Practice by Year</p>
                      <p className="text-sm text-gray-600">
                        Select an exam paper and practice with the full PDF. Perfect for doing complete past papers.
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-black transition-colors flex-shrink-0 mt-1" />
                  </button>

                  {hasChapterAccess ? (
                    <button
                      onClick={() => handleModeClick('chapter')}
                      className="w-full text-left px-5 py-5 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-start space-x-4 group"
                    >
                      <div className="p-3 bg-gray-100 rounded-lg group-hover:bg-black group-hover:text-white transition-colors">
                        <BookOpen className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-lg mb-1">Practice by Chapter</p>
                        <p className="text-sm text-gray-600">
                          Focus on specific topics. View questions organized by syllabus chapters with AI assistance.
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-black transition-colors flex-shrink-0 mt-1" />
                    </button>
                  ) : (
                    <div className="relative">
                      <div className="w-full text-left px-5 py-5 rounded-lg border-2 border-gray-200 bg-gray-50 opacity-60 flex items-start space-x-4">
                        <div className="p-3 bg-gray-200 rounded-lg">
                          <BookOpen className="w-6 h-6 text-gray-400" />
                        </div>
                        <div className="flex-1">
                          <p className="font-semibold text-gray-500 text-lg mb-1">Practice by Chapter</p>
                          <p className="text-sm text-gray-500">
                            Upgrade your plan to access chapter-wise practice.
                          </p>
                          <p className="text-xs text-amber-600 mt-2 font-medium">
                            🔒 Not available in your current plan
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 'chapter' && (
                <>
                  {chapters.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">
                        {!hasActiveSyllabus
                          ? 'No chapter-wise questions exist for this subject.'
                          : 'No chapter-wise questions available yet.'}
                      </p>
                      <p className="text-sm text-gray-500 mt-2">
                        {!hasActiveSyllabus
                          ? 'There is no active syllabus uploaded for this subject. Chapter-wise practice requires an active syllabus with tagged questions.'
                          : 'Questions haven\'t been tagged to chapters for this subject yet.'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Please try practicing by year instead.
                      </p>
                    </div>
                  ) : (
                    chapters.map(chapter => (
                      <button key={chapter.id} onClick={() => handleChapterClick(chapter)} className="w-full text-left px-4 py-4 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-center justify-between group mb-3">
                        <div className="flex items-center space-x-2">
                          <BookOpen className="w-5 h-5 text-gray-600" />
                          <div>
                            <p className="font-semibold text-gray-900">Chapter {chapter.chapter_number}</p>
                            <p className="text-sm text-gray-600 mt-0.5">{chapter.chapter_title}</p>
                            <p className="text-xs text-gray-500 mt-1">{chapter.question_count} questions</p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-black transition-colors" />
                      </button>
                    ))
                  )}
                </>
              )}

              {currentStep === 'paper' && availablePapers.map(paper => (
                <button key={paper.id} onClick={() => handlePaperClick(paper)} className="w-full text-left px-4 py-4 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                      <FileText className="w-5 h-5 text-gray-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{paper.title}</p>
                        {paper.month && (
                          <div className="flex items-center space-x-2 mt-1">
                            <Calendar className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-sm text-gray-600 font-medium">
                              {formatMonth(paper.month)} {selectedYear}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                      {existingConvs[paper.id] && (
                        <span className="text-xs text-green-600 font-medium">Continue</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <p className="text-xs text-gray-500">
            {currentStep === 'grade' && 'Select a grade level to view available subjects'}
            {currentStep === 'subject' && 'Select a subject to choose your practice mode'}
            {currentStep === 'mode' && 'Choose how you want to practice - by year or by chapter'}
            {currentStep === 'year' && 'Select a year to view exam papers from that year'}
            {currentStep === 'chapter' && 'Select a chapter to practice questions from that topic'}
            {currentStep === 'paper' && 'Select an exam paper to start or continue a conversation'}
          </p>
        </div>
      </div>
    </div>
  );
}
