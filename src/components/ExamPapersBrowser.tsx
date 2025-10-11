import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Filter, Calendar, FileText, Loader2, X } from 'lucide-react';

interface ExamPaper {
  id: string;
  title: string;
  year: number;
  month: number | null;
  subjects: { name: string };
  grade_levels: { name: string };
}

interface Subject {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  name: string;
}

interface Props {
  onSelectPaper: (paperId: string) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function ExamPapersBrowser({ onSelectPaper }: Props) {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [filteredPapers, setFilteredPapers] = useState<ExamPaper[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [papers, searchQuery, selectedSubject, selectedGrade, selectedYear, selectedMonth]);

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
            subjects (name),
            grade_levels (name)
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
      setFilteredPapers(papersRes.data || []);
      setSubjects(subjectsRes.data || []);
      setGradeLevels(gradesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...papers];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(paper =>
        paper.title.toLowerCase().includes(query) ||
        paper.subjects.name.toLowerCase().includes(query) ||
        paper.grade_levels.name.toLowerCase().includes(query)
      );
    }

    // Subject filter
    if (selectedSubject) {
      filtered = filtered.filter(paper => paper.subjects.name === selectedSubject);
    }

    // Grade filter
    if (selectedGrade) {
      filtered = filtered.filter(paper => paper.grade_levels.name === selectedGrade);
    }

    // Year filter
    if (selectedYear) {
      filtered = filtered.filter(paper => paper.year.toString() === selectedYear);
    }

    // Month filter
    if (selectedMonth) {
      filtered = filtered.filter(paper => paper.month?.toString() === selectedMonth);
    }

    setFilteredPapers(filtered);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedSubject('');
    setSelectedGrade('');
    setSelectedYear('');
    setSelectedMonth('');
  };

  const getUniqueYears = () => {
    const years = new Set(papers.map(p => p.year));
    return Array.from(years).sort((a, b) => b - a);
  };

  const activeFiltersCount = [selectedSubject, selectedGrade, selectedYear, selectedMonth].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Exam Papers</h1>
          <p className="text-gray-600 text-sm sm:text-base">Browse and search for exam papers with AI assistance</p>
        </div>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by title, subject, or grade..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:border-black transition-colors"
              />
            </div>

            {/* Filter Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors relative"
            >
              <Filter className="w-5 h-5" />
              <span className="font-medium">Filters</span>
              {activeFiltersCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-black text-white text-xs rounded-full flex items-center justify-center">
                  {activeFiltersCount}
                </span>
              )}
            </button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
                {/* Subject Filter */}
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black text-sm"
                >
                  <option value="">All Subjects</option>
                  {subjects.map(subject => (
                    <option key={subject.id} value={subject.name}>{subject.name}</option>
                  ))}
                </select>

                {/* Grade Filter */}
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black text-sm"
                >
                  <option value="">All Grades</option>
                  {gradeLevels.map(grade => (
                    <option key={grade.id} value={grade.name}>Grade {grade.name}</option>
                  ))}
                </select>

                {/* Year Filter */}
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black text-sm"
                >
                  <option value="">All Years</option>
                  {getUniqueYears().map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>

                {/* Month Filter */}
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-black text-sm"
                >
                  <option value="">All Months</option>
                  {MONTHS.map((month, index) => (
                    <option key={index + 1} value={index + 1}>{month}</option>
                  ))}
                </select>
              </div>

              {activeFiltersCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="flex items-center space-x-1 text-sm text-gray-600 hover:text-black transition-colors"
                >
                  <X className="w-4 h-4" />
                  <span>Clear all filters</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading exam papers...</p>
            </div>
          </div>
        ) : filteredPapers.length === 0 ? (
          <div className="text-center py-20">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No exam papers found</h3>
            <p className="text-gray-500 mb-4">
              {searchQuery || activeFiltersCount > 0
                ? 'Try adjusting your search or filters'
                : 'No exam papers are available yet'}
            </p>
            {(searchQuery || activeFiltersCount > 0) && (
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 text-sm text-gray-600">
              Showing {filteredPapers.length} {filteredPapers.length === 1 ? 'paper' : 'papers'}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPapers.map((paper) => (
                <button
                  key={paper.id}
                  onClick={() => onSelectPaper(paper.id)}
                  className="bg-white border-2 border-gray-200 rounded-lg p-4 sm:p-5 hover:border-black hover:shadow-lg transition-all group text-left"
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-black transition-colors flex-shrink-0">
                      <FileText className="w-5 h-5 text-gray-600 group-hover:text-white transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 mb-2 group-hover:text-black line-clamp-2">
                        {paper.title}
                      </h3>
                      <div className="space-y-1">
                        <div className="flex items-center text-xs text-gray-600">
                          <span className="font-medium">{paper.subjects.name}</span>
                          <span className="mx-1.5">•</span>
                          <span>Grade {paper.grade_levels.name}</span>
                        </div>
                        <div className="flex items-center text-xs text-gray-600">
                          <Calendar className="w-3.5 h-3.5 mr-1" />
                          <span>{paper.month ? `${MONTHS[paper.month - 1]} ` : ''}{paper.year}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
