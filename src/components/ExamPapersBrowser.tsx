import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, ChevronDown, ChevronUp, FileText, Loader2, BookOpen, Calendar } from 'lucide-react';

interface ExamPaper {
  id: string;
  title: string;
  year: number;
  month: number | null;
  subject_id: string;
  grade_level_id: string;
}

interface Subject {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  name: string;
}

interface SubjectWithPapers {
  subject: Subject;
  papers: ExamPaper[];
  paperCount: number;
}

interface Props {
  onSelectPaper: (paperId: string) => void;
  selectedGradeFromNavbar?: { id: string; name: string } | null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function ExamPapersBrowser({ onSelectPaper, selectedGradeFromNavbar }: Props) {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  // Set the selected grade from navbar when component mounts or when it changes
  useEffect(() => {
    if (selectedGradeFromNavbar) {
      setSelectedGrade(selectedGradeFromNavbar.name);
    }
  }, [selectedGradeFromNavbar]);

  const fetchData = async () => {
    try {
      setLoading(true);

      const [papersRes, subjectsRes, gradesRes] = await Promise.all([
        supabase
          .from('exam_papers')
          .select(`
            id,
            title,
            year,
            month,
            subject_id,
            grade_level_id
          `)
          .order('year', { ascending: false })
          .order('month', { ascending: false }),
        supabase
          .from('subjects')
          .select('id, name')
          .order('name'),
        supabase
          .from('grade_levels')
          .select('id, name')
          .order('display_order')
      ]);

      if (papersRes.error) throw papersRes.error;
      if (subjectsRes.error) throw subjectsRes.error;
      if (gradesRes.error) throw gradesRes.error;

      setPapers(papersRes.data || []);
      setSubjects(subjectsRes.data || []);
      setGradeLevels(gradesRes.data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const getFilteredSubjectsWithPapers = (): SubjectWithPapers[] => {
    // Filter papers by grade
    let filteredPapers = [...papers];
    if (selectedGrade) {
      const selectedGradeId = gradeLevels.find(g => g.name === selectedGrade)?.id;
      if (selectedGradeId) {
        filteredPapers = filteredPapers.filter(p => p.grade_level_id === selectedGradeId);
      }
    }

    // Group papers by subject
    const subjectMap = new Map<string, ExamPaper[]>();
    filteredPapers.forEach(paper => {
      if (!subjectMap.has(paper.subject_id)) {
        subjectMap.set(paper.subject_id, []);
      }
      subjectMap.get(paper.subject_id)!.push(paper);
    });

    // Create SubjectWithPapers array
    let subjectsWithPapers = subjects
      .map(subject => ({
        subject,
        papers: subjectMap.get(subject.id) || [],
        paperCount: (subjectMap.get(subject.id) || []).length
      }))
      .filter(swp => swp.paperCount > 0); // Only show subjects with papers

    // Filter by letter
    if (selectedLetter) {
      subjectsWithPapers = subjectsWithPapers.filter(swp =>
        swp.subject.name.toUpperCase().startsWith(selectedLetter)
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      subjectsWithPapers = subjectsWithPapers.filter(swp =>
        swp.subject.name.toLowerCase().includes(query) ||
        swp.papers.some(p => p.title.toLowerCase().includes(query))
      );
    }

    return subjectsWithPapers;
  };

  const toggleSubject = (subjectId: string) => {
    const newExpanded = new Set(expandedSubjects);
    if (newExpanded.has(subjectId)) {
      newExpanded.delete(subjectId);
    } else {
      newExpanded.add(subjectId);
    }
    setExpandedSubjects(newExpanded);
  };

  const getAvailableLetters = (): Set<string> => {
    const letters = new Set<string>();

    // Filter papers by selected grade first
    let relevantPapers = [...papers];
    if (selectedGrade) {
      const selectedGradeId = gradeLevels.find(g => g.name === selectedGrade)?.id;
      if (selectedGradeId) {
        relevantPapers = relevantPapers.filter(p => p.grade_level_id === selectedGradeId);
      }
    }

    // Get unique subject IDs from relevant papers
    const subjectIds = new Set(relevantPapers.map(p => p.subject_id));

    // Get first letters of subjects that have papers
    subjects.forEach(subject => {
      if (subjectIds.has(subject.id)) {
        const firstLetter = subject.name.charAt(0).toUpperCase();
        if (ALPHABET.includes(firstLetter)) {
          letters.add(firstLetter);
        }
      }
    });

    return letters;
  };

  const formatMonth = (month: number | null): string => {
    if (month === null || month < 1 || month > 12) return '';
    return MONTHS[month - 1];
  };

  const filteredSubjects = getFilteredSubjectsWithPapers();
  const availableLetters = getAvailableLetters();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">
            {selectedGrade ? `${selectedGrade} Exam Papers` : 'Exam Papers'}
          </h1>
          <p className="text-gray-600 text-sm sm:text-base">
            Browse subjects and select exam papers with AI assistance
          </p>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search subjects or papers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
            />
          </div>

          {/* Grade Filter */}
          {!selectedGradeFromNavbar && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black text-sm"
              >
                <option value="">All Grades</option>
                {gradeLevels.map(grade => (
                  <option key={grade.id} value={grade.name}>{grade.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* A-Z Filter */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center space-x-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedLetter('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                selectedLetter === ''
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {ALPHABET.map(letter => {
              const isAvailable = availableLetters.has(letter);
              const isSelected = selectedLetter === letter;

              return (
                <button
                  key={letter}
                  onClick={() => isAvailable && setSelectedLetter(letter)}
                  disabled={!isAvailable}
                  className={`flex-shrink-0 w-9 h-9 rounded-lg font-medium text-sm transition-colors ${
                    isSelected
                      ? 'bg-black text-white'
                      : isAvailable
                      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading subjects...</p>
            </div>
          </div>
        ) : filteredSubjects.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No subjects found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery || selectedLetter || selectedGrade
                ? 'Try adjusting your search or filters'
                : 'No exam papers are available yet'}
            </p>
            {(searchQuery || selectedLetter) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedLetter('');
                }}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Showing {filteredSubjects.length} {filteredSubjects.length === 1 ? 'subject' : 'subjects'}
            </div>

            <div className="space-y-3">
              {filteredSubjects.map(({ subject, papers, paperCount }) => {
                const isExpanded = expandedSubjects.has(subject.id);

                return (
                  <div
                    key={subject.id}
                    className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden hover:border-gray-300 transition-colors"
                  >
                    {/* Subject Header */}
                    <button
                      onClick={() => toggleSubject(subject.id)}
                      className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <BookOpen className="w-5 h-5 text-gray-600" />
                        </div>
                        <div className="text-left">
                          <h3 className="font-semibold text-gray-900 text-lg">{subject.name}</h3>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {paperCount} {paperCount === 1 ? 'paper' : 'papers'} available
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Papers List */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-white">
                        <div className="divide-y divide-gray-100">
                          {papers.map((paper, index) => (
                            <button
                              key={paper.id}
                              onClick={() => onSelectPaper(paper.id)}
                              className="w-full px-5 py-3 hover:bg-gray-50 transition-colors text-left group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3 flex-1 min-w-0">
                                  <FileText className="w-4 h-4 text-gray-400 group-hover:text-black transition-colors flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-medium text-gray-900 text-sm group-hover:text-black truncate">
                                      {paper.title}
                                    </h4>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2 text-xs text-gray-600 flex-shrink-0 ml-4">
                                  <Calendar className="w-3.5 h-3.5" />
                                  <span className="font-medium whitespace-nowrap">
                                    {paper.month ? `${formatMonth(paper.month)} ` : ''}{paper.year}
                                  </span>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
