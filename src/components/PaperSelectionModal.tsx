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

type Step = 'grade' | 'subject' | 'mode' | 'syllabus' | 'chapter' | 'paper';
type PracticeMode = 'year' | 'chapter';

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
  const [syllabuses, setSyllabuses] = useState<Syllabus[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState<Step>('grade');
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedMode, setSelectedMode] = useState<PracticeMode | null>(null);
  const [selectedSyllabus, setSelectedSyllabus] = useState<Syllabus | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [existingConvs, setExistingConvs] = useState<Record<string, boolean>>({});
  const [hasChapterAccess, setHasChapterAccess] = useState(true); // New state for chapter access
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]); // Available subjects for selected grade

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setCurrentStep('grade');
      setSelectedGrade(null);
      setSelectedSubject(null);
      setSelectedMode(null);
      setSelectedSyllabus(null);
      setSelectedChapter(null);
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
          console.error('Error fetching accessible grades:', accessibleGrades.error);
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

        // Filter to only accessible papers and map to ExamPaper format
        if (accessiblePapers.error) {
          console.error('Error fetching accessible papers:', accessiblePapers.error);
          // Fallback to all papers if RPC fails
          const { data: allPapers } = await supabase
            .from('exam_papers')
            .select('id, title, subject_id, grade_level_id')
            .order('title');
          setPapers(allPapers || []);
        } else {
          // Map accessible papers from RPC result
          const papers = (accessiblePapers.data || [])
            .filter((p: any) => p.is_accessible) // Only show accessible papers
            .map((p: any) => ({
              id: p.paper_id,
              title: p.paper_title,
              subject_id: p.subject_id,
              grade_level_id: p.grade_level_id,
              is_accessible: p.is_accessible,
              access_status: p.access_status
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
          supabase.from('exam_papers').select('id, title, subject_id, grade_level_id').order('title'),
        ]);

        setGradeLevels(gradesRes.data || []);
        setSubjects(subjectsRes.data || []);
        setPapers(papersRes.data || []);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
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
        console.error('Error fetching subscription:', subError);
        setHasChapterAccess(true); // Default to true on error
        return;
      }

      if (subscription && subscription.subscription_tiers) {
        const tierData = subscription.subscription_tiers as any;
        setHasChapterAccess(tierData.chapter_wise_access ?? true);
        console.log('Chapter-wise access:', tierData.chapter_wise_access);
      } else {
        setHasChapterAccess(true); // Default to true if no subscription found
      }
    } catch (error) {
      console.error('Error checking chapter access:', error);
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
        console.error('Error fetching accessible subjects:', error);
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
      console.error('Error in getAvailableSubjectsForGrade:', error);
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
      // For chapter mode, fetch syllabuses first
      await fetchSyllabusesForSelection();
      setCurrentStep('syllabus');
    } else {
      // For year mode, continue to paper selection
      setCurrentStep('paper');
    }
  };

  const fetchSyllabusesForSelection = async () => {
    if (!selectedGrade || !selectedSubject) return;

    try {
      setLoading(true);

      // Get all syllabuses for this grade/subject that:
      // 1. Are used by at least one exam paper
      // 2. Have at least one chapter with questions tagged
      const { data: syllabusData } = await supabase
        .from('syllabus')
        .select(`
          id,
          title,
          region,
          subject_id,
          grade_id,
          exam_papers!inner(id),
          syllabus_chapters!inner(
            id,
            question_chapter_tags!inner(id)
          )
        `)
        .eq('grade_id', selectedGrade.id)
        .eq('subject_id', selectedSubject.id)
        .eq('processing_status', 'completed')
        .order('region');

      // Filter to unique syllabuses (since inner joins create duplicates)
      const uniqueSyllabuses = syllabusData?.reduce((acc: Syllabus[], curr: any) => {
        if (!acc.find(s => s.id === curr.id)) {
          acc.push({
            id: curr.id,
            title: curr.title,
            region: curr.region,
            subject_id: curr.subject_id,
            grade_id: curr.grade_id
          });
        }
        return acc;
      }, []) || [];

      setSyllabuses(uniqueSyllabuses);
    } catch (error) {
      console.error('Error fetching syllabuses:', error);
      setSyllabuses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSyllabusClick = async (syllabus: Syllabus) => {
    setSelectedSyllabus(syllabus);
    await fetchChaptersForSelection(syllabus.id);
    setCurrentStep('chapter');
  };

  const fetchChaptersForSelection = async (syllabusId: string) => {
    try {
      setLoading(true);

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
        .eq('syllabus_chapters.syllabus_id', syllabusId);

      if (error) {
        console.error('Error fetching chapters:', error);
        setChapters([]);
        return;
      }

      if (!tagsData || tagsData.length === 0) {
        console.log('No chapters with questions found for this syllabus');
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

      console.log(`Found ${chaptersWithQuestions.length} chapters with questions`);
      setChapters(chaptersWithQuestions);
    } catch (error) {
      console.error('Error fetching chapters:', error);
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
    if (currentStep === 'paper') {
      setSelectedMode(null);
      setCurrentStep('mode');
    } else if (currentStep === 'chapter') {
      setSelectedChapter(null);
      setSelectedSyllabus(null);
      setCurrentStep('syllabus');
    } else if (currentStep === 'syllabus') {
      setSelectedMode(null);
      setSelectedSyllabus(null);
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
    setSelectedSyllabus(null);
    setSelectedChapter(null);
    setCurrentStep('grade');
    onClose();
  };

  if (!isOpen) return null;

  const availablePapers = selectedGrade && selectedSubject
    ? getPapersForSubjectAndGrade(selectedSubject.id, selectedGrade.id)
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
                {currentStep === 'syllabus' && `Select Your Syllabus / Region`}
                {currentStep === 'chapter' && `Practice by Chapter - Select Chapter`}
                {currentStep === 'paper' && `Practice by Year - Select Paper`}
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

              {currentStep === 'syllabus' && (
                <>
                  {syllabuses.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No syllabuses with exam papers available.</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Please ensure exam papers have been uploaded with a syllabus selected.
                      </p>
                    </div>
                  ) : (
                    syllabuses.map(syllabus => (
                      <button
                        key={syllabus.id}
                        onClick={() => handleSyllabusClick(syllabus)}
                        className="w-full text-left px-4 py-4 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-center justify-between group mb-3"
                      >
                        <div>
                          <p className="font-semibold text-gray-900 text-lg">
                            {syllabus.region || 'Default Syllabus'}
                          </p>
                          {syllabus.title && (
                            <p className="text-sm text-gray-600 mt-0.5">{syllabus.title}</p>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-black transition-colors" />
                      </button>
                    ))
                  )}
                </>
              )}

              {currentStep === 'chapter' && (
                <>
                  {chapters.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">No chapter-wise questions available yet.</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Questions haven't been tagged to chapters for this syllabus yet.
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Try a different syllabus or practice by year instead.
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
                <button key={paper.id} onClick={() => handlePaperClick(paper)} className="w-full text-left px-4 py-4 rounded-lg border-2 border-gray-200 hover:border-black hover:bg-gray-50 transition-all flex items-center justify-between group">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <p className="font-semibold text-gray-900">{paper.title}</p>
                  </div>
                  {existingConvs[paper.id] && <span className="text-xs text-green-600 font-medium">Continue conversation</span>}
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
            {currentStep === 'syllabus' && 'Select your syllabus/region to see relevant chapters'}
            {currentStep === 'chapter' && 'Select a chapter to practice questions from that topic'}
            {currentStep === 'paper' && 'Select an exam paper to start or continue a conversation'}
          </p>
        </div>
      </div>
    </div>
  );
}
