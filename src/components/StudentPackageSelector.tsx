import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Check, AlertCircle, GraduationCap, BookOpen, ArrowRight, Search, X } from 'lucide-react';

interface Grade {
  id: string;
  name: string;
  display_order: number;
}

interface Subject {
  id: string;
  name: string;
  description: string | null;
}

interface StudentPackageSelectorProps {
  onComplete: (gradeId: string, subjectIds: string[]) => void;
  onCancel: () => void;
  maxSubjects?: number;
}

export function StudentPackageSelector({ onComplete, onCancel, maxSubjects = 3 }: StudentPackageSelectorProps) {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [filteredSubjects, setFilteredSubjects] = useState<Subject[]>([]);
  const [selectedGradeId, setSelectedGradeId] = useState<string>('');
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [step, setStep] = useState<'grade' | 'subjects'>('grade');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    fetchGradesAndSubjects();
  }, []);

  useEffect(() => {
    // Filter subjects based on search query
    if (searchQuery.trim() === '') {
      setFilteredSubjects(subjects);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = subjects.filter(subject =>
        subject.name.toLowerCase().includes(query) ||
        (subject.description && subject.description.toLowerCase().includes(query))
      );
      setFilteredSubjects(filtered);
    }
  }, [searchQuery, subjects]);

  const fetchGradesAndSubjects = async () => {
    try {
      setLoading(true);

      const [gradesResult, subjectsResult] = await Promise.all([
        supabase
          .from('grade_levels')
          .select('*')
          .order('display_order', { ascending: true }),
        supabase
          .from('subjects')
          .select('*')
          .order('name', { ascending: true })
      ]);

      if (gradesResult.error) throw gradesResult.error;
      if (subjectsResult.error) throw subjectsResult.error;

      setGrades(gradesResult.data || []);
      setSubjects(subjectsResult.data || []);
      setFilteredSubjects(subjectsResult.data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load grades and subjects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGradeSelect = async (gradeId: string) => {
    setSelectedGradeId(gradeId);
    setSelectedSubjectIds([]); // Clear previously selected subjects
    setLoading(true);
    setError('');

    try {
      // Fetch subjects that have exam papers for the selected grade
      const { data: papersData, error: papersError } = await supabase
        .from('exam_papers')
        .select('subject_id, subjects(id, name, description)')
        .eq('grade_level_id', gradeId);

      if (papersError) throw papersError;

      // Extract unique subjects from exam papers
      const subjectsForGrade: Subject[] = [];
      const seenSubjectIds = new Set<string>();

      papersData?.forEach(paper => {
        const subject = paper.subjects as any;
        if (subject && !seenSubjectIds.has(subject.id)) {
          seenSubjectIds.add(subject.id);
          subjectsForGrade.push({
            id: subject.id,
            name: subject.name,
            description: subject.description
          });
        }
      });

      // Sort subjects by name
      subjectsForGrade.sort((a, b) => a.name.localeCompare(b.name));

      setSubjects(subjectsForGrade);
      setFilteredSubjects(subjectsForGrade);
      setStep('subjects');
    } catch (err) {
      console.error('Error fetching subjects for grade:', err);
      setError('Failed to load subjects for this grade. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubjectToggle = (subjectId: string) => {
    setSelectedSubjectIds(prev => {
      if (prev.includes(subjectId)) {
        return prev.filter(id => id !== subjectId);
      } else {
        if (prev.length >= maxSubjects) {
          setError(`You can select a maximum of ${maxSubjects} subjects`);
          setTimeout(() => setError(''), 3000);
          return prev;
        }
        return [...prev, subjectId];
      }
    });
  };

  const handleBackToGrades = () => {
    setStep('grade');
    setSelectedSubjectIds([]);
    setSearchQuery('');
    setSubjects([]); // Clear subjects when going back
    setFilteredSubjects([]);
  };

  const clearSearch = () => {
    setSearchQuery('');
  };

  const handleComplete = () => {
    if (!selectedGradeId) {
      setError('Please select a grade level');
      return;
    }
    if (selectedSubjectIds.length === 0) {
      setError('Please select at least one subject');
      return;
    }
    onComplete(selectedGradeId, selectedSubjectIds);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
          Customize Your Student Package
        </h2>
        <p className="text-xs sm:text-sm text-gray-600">
          {step === 'grade'
            ? 'Select your grade level to get started'
            : `Choose up to ${maxSubjects} subjects for your study plan`
          }
        </p>
      </div>

      {/* Progress Indicator */}
      <div className="flex items-center justify-center mb-8">
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Step 1 */}
          <div className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full ${
              step === 'grade' || selectedGradeId
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}>
              {selectedGradeId ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <span className="text-sm sm:text-base">1</span>}
            </div>
            <span className={`ml-2 text-xs sm:text-sm font-medium ${
              step === 'grade' || selectedGradeId ? 'text-blue-600' : 'text-gray-600'
            }`}>
              Grade
            </span>
          </div>

          {/* Divider */}
          <div className="w-8 sm:w-16 h-1 bg-gray-200"></div>

          {/* Step 2 */}
          <div className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full ${
              step === 'subjects'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-600'
            }`}>
              <span className="text-sm sm:text-base">2</span>
            </div>
            <span className={`ml-2 text-xs sm:text-sm font-medium ${
              step === 'subjects' ? 'text-blue-600' : 'text-gray-600'
            }`}>
              Subjects
            </span>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Grade Selection */}
      {step === 'grade' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {grades.map((grade) => (
              <button
                key={grade.id}
                onClick={() => handleGradeSelect(grade.id)}
                className={`p-4 sm:p-6 rounded-lg border-2 transition-all hover:scale-105 ${
                  selectedGradeId === grade.id
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center ${
                    selectedGradeId === grade.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base">{grade.name}</p>
                  </div>
                  {selectedGradeId === grade.id && (
                    <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Subject Selection */}
      {step === 'subjects' && (
        <div className="space-y-6">
          {/* Selected Grade Display */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <GraduationCap className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-xs text-blue-600 font-medium">Selected Grade</p>
                <p className="text-sm font-semibold text-gray-900">
                  {grades.find(g => g.id === selectedGradeId)?.name}
                </p>
              </div>
            </div>
            <button
              onClick={handleBackToGrades}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Change
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subjects..."
              className="w-full pl-12 pr-12 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            )}
          </div>

          {/* Subject Selection Counter */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-5 h-5 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Subjects Selected</span>
            </div>
            <span className={`text-lg font-bold ${
              selectedSubjectIds.length === maxSubjects
                ? 'text-orange-600'
                : 'text-blue-600'
            }`}>
              {selectedSubjectIds.length} / {maxSubjects}
            </span>
          </div>

          {/* Selected Subjects Pills */}
          {selectedSubjectIds.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs font-medium text-blue-700 mb-2">Selected Subjects:</p>
              <div className="flex flex-wrap gap-2">
                {selectedSubjectIds.map(subjectId => {
                  const subject = subjects.find(s => s.id === subjectId);
                  return subject ? (
                    <div
                      key={subject.id}
                      className="inline-flex items-center space-x-2 bg-blue-600 text-white px-3 py-1.5 rounded-full text-sm"
                    >
                      <span>{subject.name}</span>
                      <button
                        onClick={() => handleSubjectToggle(subject.id)}
                        className="hover:bg-blue-700 rounded-full p-0.5 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}

          {/* Search Results Info */}
          {searchQuery && (
            <div className="text-sm text-gray-600">
              Found <strong>{filteredSubjects.length}</strong> subject{filteredSubjects.length !== 1 ? 's' : ''}
              {filteredSubjects.length === 0 && ' - try a different search term'}
            </div>
          )}

          {/* Subject Grid */}
          {filteredSubjects.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {filteredSubjects.map((subject) => {
                const isSelected = selectedSubjectIds.includes(subject.id);
                const isDisabled = !isSelected && selectedSubjectIds.length >= maxSubjects;

                return (
                  <button
                    key={subject.id}
                    onClick={() => handleSubjectToggle(subject.id)}
                    disabled={isDisabled}
                    className={`p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50'
                        : isDisabled
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : 'border-gray-200 bg-white hover:border-blue-300 hover:scale-105'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm mb-1">{subject.name}</p>
                        {subject.description && (
                          <p className="text-xs text-gray-600 line-clamp-2">{subject.description}</p>
                        )}
                      </div>
                      <div className={`ml-2 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        isSelected
                          ? 'border-blue-600 bg-blue-600'
                          : 'border-gray-300'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-1">No subjects found</p>
              <p className="text-sm text-gray-500">Try adjusting your search terms</p>
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-8 flex flex-col sm:flex-row gap-3 sm:gap-4">
        <button
          onClick={onCancel}
          className="flex-1 px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
        {step === 'subjects' && (
          <button
            onClick={handleComplete}
            disabled={selectedSubjectIds.length === 0}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-lg font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Continue to Payment</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Info Note */}
      {step === 'subjects' && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs sm:text-sm text-gray-600">
            <strong>Note:</strong> You'll have access to exam papers from <strong>{grades.find(g => g.id === selectedGradeId)?.name}</strong> for the{' '}
            <strong>{selectedSubjectIds.length} subject{selectedSubjectIds.length !== 1 ? 's' : ''}</strong> you've selected.
            You can change your selection after purchase from your account settings.
          </p>
        </div>
      )}
    </div>
  );
}
