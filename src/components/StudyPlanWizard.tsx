import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { X, Calendar, Clock, BookOpen, Sparkles, ChevronRight, ChevronLeft, Loader, Zap } from 'lucide-react';
import { formatTokenCount } from '../lib/formatUtils';

interface Subject {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  name: string;
}

interface Syllabus {
  id: string;
  title: string | null;
  description: string | null;
  academic_year: string | null;
  region: string | null;
}

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  chapter_description: string | null;
}

interface StudyPlanWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  tokensRemaining?: number;
  tokensLimit?: number | null;
  tokensUsed?: number;
}

export function StudyPlanWizard({ isOpen, onClose, onSuccess, tokensRemaining = 0, tokensLimit = null, tokensUsed = 0 }: StudyPlanWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [generating, setGenerating] = useState(false);

  // Form state
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedSyllabus, setSelectedSyllabus] = useState('');
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [studyDuration, setStudyDuration] = useState(60);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3);
  const [preferredTimes, setPreferredTimes] = useState<string[]>(['evening']);
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    return threeMonths.toISOString().split('T')[0];
  });

  useEffect(() => {
    if (isOpen) {
      fetchSubjects();
      fetchGrades();
    }
  }, [isOpen]);

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchGrades = async () => {
    try {
      const { data, error } = await supabase
        .from('grade_levels')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setGrades(data || []);
    } catch (error) {
      console.error('Error fetching grades:', error);
    }
  };

  const fetchSyllabi = async (subjectId: string, gradeId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('syllabus')
        .select('id, title, description, academic_year, region')
        .eq('subject_id', subjectId)
        .eq('grade_id', gradeId)
        .eq('processing_status', 'completed')
        .order('region', { ascending: true });

      if (error) {
        console.error('Error fetching syllabi:', error);
        setSyllabi([]);
      } else {
        setSyllabi(data || []);
        // Auto-select if only one syllabus
        if (data && data.length === 1) {
          setSelectedSyllabus(data[0].id);
        } else {
          setSelectedSyllabus('');
        }
      }
    } catch (error) {
      console.error('Error fetching syllabi:', error);
      setSyllabi([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchChapters = async (syllabusId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title, chapter_description')
        .eq('syllabus_id', syllabusId)
        .order('display_order');

      if (error) {
        console.error('Error fetching chapters:', error);
        setChapters([]);
      } else {
        console.log('Fetched chapters:', data);
        setChapters(data || []);
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
      setChapters([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleChapter = (chapterId: string) => {
    if (selectedChapters.includes(chapterId)) {
      setSelectedChapters(selectedChapters.filter(id => id !== chapterId));
    } else {
      setSelectedChapters([...selectedChapters, chapterId]);
    }
  };

  const togglePreferredTime = (time: string) => {
    if (preferredTimes.includes(time)) {
      setPreferredTimes(preferredTimes.filter(t => t !== time));
    } else {
      setPreferredTimes([...preferredTimes, time]);
    }
  };

  // Fetch syllabi when both subject and grade are selected
  useEffect(() => {
    if (selectedSubject && selectedGrade) {
      fetchSyllabi(selectedSubject, selectedGrade);
    } else {
      setSyllabi([]);
      setSelectedSyllabus('');
      setChapters([]);
      setSelectedChapters([]);
    }
  }, [selectedSubject, selectedGrade]);

  // Fetch chapters when a syllabus is selected
  useEffect(() => {
    if (selectedSyllabus) {
      fetchChapters(selectedSyllabus);
    } else {
      setChapters([]);
      setSelectedChapters([]);
    }
  }, [selectedSyllabus]);

  const handleGenerateStudyPlan = async () => {
    if (!user || !selectedSubject || !selectedGrade || !selectedSyllabus) return;

    try {
      setGenerating(true);

      // Create the schedule
      const { data: schedule, error: scheduleError } = await supabase
        .from('study_plan_schedules')
        .insert({
          user_id: user.id,
          subject_id: selectedSubject,
          grade_id: selectedGrade,
          study_duration_minutes: studyDuration,
          sessions_per_week: sessionsPerWeek,
          preferred_times: preferredTimes,
          start_date: startDate,
          end_date: endDate,
          ai_generated: true,
          is_active: true
        })
        .select()
        .single();

      if (scheduleError) throw scheduleError;

      // Generate events using AI via Supabase Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`${supabaseUrl}/functions/v1/generate-study-plan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          schedule_id: schedule.id,
          user_id: user.id,
          subject_id: selectedSubject,
          grade_id: selectedGrade,
          syllabus_id: selectedSyllabus,
          chapter_ids: selectedChapters.length > 0 ? selectedChapters : undefined,
          study_duration_minutes: studyDuration,
          sessions_per_week: sessionsPerWeek,
          preferred_times: preferredTimes,
          start_date: startDate,
          end_date: endDate
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate study plan');
      }

      // Reset form
      resetForm();
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error generating study plan:', error);
      alert('Failed to generate study plan. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedGrade('');
    setSelectedSubject('');
    setSelectedSyllabus('');
    setSyllabi([]);
    setSelectedChapters([]);
    setChapters([]);
    setStudyDuration(60);
    setSessionsPerWeek(3);
    setPreferredTimes(['evening']);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setStartDate(tomorrow.toISOString().split('T')[0]);
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    setEndDate(threeMonths.toISOString().split('T')[0]);
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return selectedSubject && selectedGrade && selectedSyllabus;
      case 2:
        return studyDuration > 0 && sessionsPerWeek > 0;
      case 3:
        return preferredTimes.length > 0 && startDate && endDate;
      default:
        return false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-black" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Create Study Plan</h2>
                <p className="text-sm text-gray-600">AI-powered personalized schedule</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          {/* AI Tokens Display */}
          <div className="flex items-center space-x-2 px-3 py-2 bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg">
            <Zap className="w-4 h-4 text-purple-600" />
            <div className="text-xs flex-1">
              <span className="text-gray-600">AI Tokens: </span>
              <span className="font-semibold text-gray-900">
                {tokensLimit === null
                  ? `Unlimited`
                  : `${formatTokenCount(tokensUsed)} / ${formatTokenCount(tokensLimit)}`
                }
              </span>
            </div>
            <div className="text-xs text-gray-600">
              • Tokens will be used to generate your study plan
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className={`flex items-center space-x-2 ${step >= 1 ? 'text-black' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 1 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                1
              </div>
              <span className="text-sm font-medium hidden sm:inline">Grade & Subject</span>
            </div>
            <div className={`flex-1 h-1 mx-2 ${step >= 2 ? 'bg-black' : 'bg-gray-200'}`} />
            <div className={`flex items-center space-x-2 ${step >= 2 ? 'text-black' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 2 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                2
              </div>
              <span className="text-sm font-medium hidden sm:inline">Duration</span>
            </div>
            <div className={`flex-1 h-1 mx-2 ${step >= 3 ? 'bg-black' : 'bg-gray-200'}`} />
            <div className={`flex items-center space-x-2 ${step >= 3 ? 'text-black' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                step >= 3 ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
              }`}>
                3
              </div>
              <span className="text-sm font-medium hidden sm:inline">Schedule</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Grade, Subject, Syllabus & Chapters */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Select Grade Level
                </label>
                <select
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors text-gray-900 font-medium"
                >
                  <option value="">Choose a grade level...</option>
                  {grades.map(grade => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Select Subject
                </label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors text-gray-900 font-medium"
                  disabled={!selectedGrade}
                >
                  <option value="">Choose a subject...</option>
                  {subjects.map(subject => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
                {!selectedGrade && (
                  <p className="text-xs text-gray-500 mt-2">Please select a grade level first</p>
                )}
              </div>

              {selectedSubject && selectedGrade && syllabi.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Select Syllabus
                  </label>
                  <select
                    value={selectedSyllabus}
                    onChange={(e) => setSelectedSyllabus(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-black focus:outline-none transition-colors text-gray-900 font-medium"
                  >
                    <option value="">Choose a syllabus...</option>
                    {syllabi.map(syllabus => {
                      // Display only the title if available, otherwise show descriptive text
                      const displayName = syllabus.title ||
                        [syllabus.region, syllabus.academic_year].filter(Boolean).join(' - ') ||
                        'Syllabus';

                      return (
                        <option key={syllabus.id} value={syllabus.id}>
                          {displayName}
                        </option>
                      );
                    })}
                  </select>
                  <p className="text-xs text-gray-600 mt-2">
                    Different syllabi may be available for different regions or exam boards
                  </p>
                </div>
              )}

              {selectedSubject && selectedGrade && loading && !syllabi.length && (
                <div className="border border-gray-200 rounded-lg p-6">
                  <div className="flex items-center justify-center">
                    <Loader className="w-5 h-5 animate-spin text-gray-400 mr-2" />
                    <span className="text-gray-600 text-sm">Loading syllabi...</span>
                  </div>
                </div>
              )}

              {selectedSubject && selectedGrade && !loading && syllabi.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-900">
                    No syllabus found for this subject and grade combination. Please contact support to add a syllabus, or select a different combination.
                  </p>
                </div>
              )}

              {selectedSyllabus && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Select Chapters (Optional)
                  </label>
                  <p className="text-xs text-gray-600 mb-3">
                    Leave unselected to create a study plan for all chapters
                  </p>
                  {loading ? (
                    <div className="border border-gray-200 rounded-lg p-6">
                      <div className="flex items-center justify-center py-8">
                        <Loader className="w-6 h-6 animate-spin text-gray-400" />
                        <span className="ml-3 text-gray-600">Loading chapters...</span>
                      </div>
                    </div>
                  ) : chapters.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 space-y-2">
                      {chapters.map(chapter => (
                        <button
                          key={chapter.id}
                          onClick={() => toggleChapter(chapter.id)}
                          className={`w-full p-3 border-2 rounded-lg transition-all text-left ${
                            selectedChapters.includes(chapter.id)
                              ? 'border-black bg-gray-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 ${
                              selectedChapters.includes(chapter.id)
                                ? 'border-black bg-black'
                                : 'border-gray-300'
                            }`}>
                              {selectedChapters.includes(chapter.id) && (
                                <span className="text-white text-xs">✓</span>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className={`font-medium ${
                                selectedChapters.includes(chapter.id) ? 'text-black' : 'text-gray-900'
                              }`}>
                                Chapter {chapter.chapter_number}: {chapter.chapter_title}
                              </div>
                              {chapter.chapter_description && (
                                <div className="text-xs text-gray-600 mt-1">
                                  {chapter.chapter_description}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-gray-200 rounded-lg p-6 text-center">
                      <div className="text-gray-500 text-sm">
                        <p className="mb-2">No syllabus chapters available for this combination.</p>
                        <p className="text-xs">The AI will generate a study plan based on the subject curriculum.</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2: Duration & Sessions */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Study Duration per Session
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="range"
                    min="15"
                    max="180"
                    step="15"
                    value={studyDuration}
                    onChange={(e) => setStudyDuration(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-black"
                  />
                  <div className="flex items-center space-x-2 bg-gray-50 px-4 py-2 rounded-lg border border-gray-300">
                    <Clock className="w-5 h-5 text-black" />
                    <span className="font-bold text-black min-w-[4rem]">{studyDuration} min</span>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>15 min</span>
                  <span>3 hours</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Sessions per Week
                </label>
                <div className="grid grid-cols-7 gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map(num => (
                    <button
                      key={num}
                      onClick={() => setSessionsPerWeek(num)}
                      className={`p-3 border-2 rounded-lg transition-all ${
                        sessionsPerWeek === num
                          ? 'border-black bg-gray-50 text-black'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <div className="text-center">
                        <div className="font-bold">{num}</div>
                        <div className="text-xs">{num === 1 ? 'day' : 'days'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Recommendation:</strong> For optimal learning, we recommend 3-5 study sessions per week,
                  each lasting 45-90 minutes with regular breaks.
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Schedule & Dates */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  Preferred Study Times
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { value: 'morning', label: 'Morning', time: '6 AM - 12 PM', icon: '🌅' },
                    { value: 'afternoon', label: 'Afternoon', time: '12 PM - 6 PM', icon: '☀️' },
                    { value: 'evening', label: 'Evening', time: '6 PM - 11 PM', icon: '🌙' }
                  ].map(timeSlot => (
                    <button
                      key={timeSlot.value}
                      onClick={() => togglePreferredTime(timeSlot.value)}
                      className={`p-4 border-2 rounded-lg transition-all text-left ${
                        preferredTimes.includes(timeSlot.value)
                          ? 'border-black bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 mb-1">
                        <span className="text-2xl">{timeSlot.icon}</span>
                        <span className={`font-semibold ${
                          preferredTimes.includes(timeSlot.value) ? 'text-black' : 'text-gray-900'
                        }`}>
                          {timeSlot.label}
                        </span>
                      </div>
                      <span className="text-xs text-gray-600">{timeSlot.time}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">Select one or more preferred times</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  />
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Sparkles className="w-5 h-5 text-black mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-black mb-1">AI Will Generate:</h4>
                    <ul className="text-sm text-gray-900 space-y-1">
                      <li>• Personalized study schedule based on your preferences</li>
                      <li>• Optimal topic distribution across sessions</li>
                      <li>• Progress tracking and milestone reminders</li>
                      <li>• Adaptive scheduling based on your pace</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                disabled={generating}
                className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              disabled={generating}
              className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="flex items-center space-x-2 px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleGenerateStudyPlan}
                disabled={!canProceed() || generating}
                className="flex items-center space-x-2 px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Study Plan</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* CSS for slider */}
      <style>{`
        .slider-black::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #000000;
          cursor: pointer;
        }
        .slider-black::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #000000;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}
