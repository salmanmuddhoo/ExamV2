import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, BookOpen, ToggleLeft, ToggleRight } from 'lucide-react';
import { Modal } from './Modal';
import { useModal } from '../hooks/useModal';

interface Subject {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  ai_prompt_id: string | null;
  ai_prompts?: { name: string } | null;
}

interface GradeLevel {
  id: string;
  name: string;
  display_order: number;
}

interface SubjectGradeActivation {
  subject_id: string;
  grade_id: string;
  is_active: boolean;
}

interface AIPrompt {
  id: string;
  name: string;
  description: string | null;
}

export function SubjectManager() {
  const { modalState, showAlert, showConfirm, closeModal } = useModal();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [activations, setActivations] = useState<SubjectGradeActivation[]>([]);
  const [aiPrompts, setAiPrompts] = useState<AIPrompt[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', ai_prompt_id: '' });
  const [selectedGrades, setSelectedGrades] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [subjectsRes, gradesRes, activationsRes, promptsRes] = await Promise.all([
        supabase.from('subjects').select('*, ai_prompts(name)').order('name'),
        supabase.from('grade_levels').select('*').order('display_order'),
        supabase.from('subject_grade_activation').select('*'),
        supabase.from('ai_prompts').select('id, name, description').eq('prompt_type', 'ai_assistant').order('name')
      ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (gradesRes.error) throw gradesRes.error;
      if (activationsRes.error) throw activationsRes.error;
      if (promptsRes.error) throw promptsRes.error;

      setSubjects(subjectsRes.data || []);
      setGrades(gradesRes.data || []);
      setActivations(activationsRes.data || []);
      setAiPrompts(promptsRes.data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingId) {
        const { error } = await supabase
          .from('subjects')
          .update({
            name: formData.name,
            description: formData.description || null,
            ai_prompt_id: formData.ai_prompt_id || null
          })
          .eq('id', editingId);

        if (error) throw error;

        // Update grade activations for editing
        const activationRecords = grades.map(grade => ({
          subject_id: editingId,
          grade_id: grade.id,
          is_active: selectedGrades.has(grade.id)
        }));

        // Upsert activation records (insert if not exists, update if exists)
        const { error: activationError } = await supabase
          .from('subject_grade_activation')
          .upsert(activationRecords, {
            onConflict: 'subject_id,grade_id'
          });

        if (activationError) throw activationError;
      } else {
        // Insert new subject
        const { data: newSubject, error } = await supabase
          .from('subjects')
          .insert([{
            name: formData.name,
            description: formData.description || null,
            ai_prompt_id: formData.ai_prompt_id || null
          }])
          .select()
          .single();

        if (error) throw error;

        // Create activation records for selected grades only
        if (newSubject) {
          const gradesToActivate = selectedGrades.size > 0 ? Array.from(selectedGrades) : grades.map(g => g.id);
          const activationRecords = gradesToActivate.map(gradeId => ({
            subject_id: newSubject.id,
            grade_id: gradeId,
            is_active: true
          }));

          const { error: activationError } = await supabase
            .from('subject_grade_activation')
            .insert(activationRecords);

          if (activationError) throw activationError;
        }
      }

      setFormData({ name: '', description: '', ai_prompt_id: '' });
      setIsAdding(false);
      setEditingId(null);
      setSelectedGrades(new Set());
      fetchData();
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingId(subject.id);
    setFormData({
      name: subject.name,
      description: subject.description || '',
      ai_prompt_id: subject.ai_prompt_id || ''
    });

    // Load current grade activations for this subject
    const currentGrades = activations
      .filter(a => a.subject_id === subject.id && a.is_active)
      .map(a => a.grade_id);
    setSelectedGrades(new Set(currentGrades));

    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    // Check if subject is being used by any exam papers
    try {
      const { data: examPapers, error: checkError } = await supabase
        .from('exam_papers')
        .select('id')
        .eq('subject_id', id)
        .limit(1);

      if (checkError) throw checkError;

      if (examPapers && examPapers.length > 0) {
        showAlert(
          'This subject cannot be deleted because it is being used by one or more exam papers. Please remove or reassign those exam papers first.',
          'Cannot Delete Subject',
          'warning'
        );
        return;
      }

      // If no exam papers use this subject, proceed with deletion
      showConfirm(
        'Are you sure you want to delete this subject? This action cannot be undone.',
        async () => {
          try {
            const { error } = await supabase.from('subjects').delete().eq('id', id);
            if (error) throw error;
            fetchSubjects();
          } catch (error: any) {
            showAlert(error.message, 'Error', 'error');
          }
        },
        'Delete Subject'
      );
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', description: '', ai_prompt_id: '' });
    setSelectedGrades(new Set());
  };

  const handleGradeToggle = (gradeId: string) => {
    const newSelected = new Set(selectedGrades);
    if (newSelected.has(gradeId)) {
      newSelected.delete(gradeId);
    } else {
      newSelected.add(gradeId);
    }
    setSelectedGrades(newSelected);
  };

  const handleSelectAllGrades = () => {
    setSelectedGrades(new Set(grades.map(g => g.id)));
  };

  const handleDeselectAllGrades = () => {
    setSelectedGrades(new Set());
  };

  const handleToggleActive = async (subjectId: string, gradeId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const action = newStatus ? 'activate' : 'deactivate';
    const subject = subjects.find(s => s.id === subjectId);
    const grade = grades.find(g => g.id === gradeId);

    if (!subject || !grade) return;

    showConfirm(
      `Are you sure you want to ${action} "${subject.name}" for ${grade.name}? ${
        !newStatus
          ? 'This will hide the subject and all its resources (exam papers, study plans) from students in this grade.'
          : 'This will make the subject and its resources visible to students in this grade again.'
      }`,
      async () => {
        try {
          const { error } = await supabase
            .from('subject_grade_activation')
            .update({ is_active: newStatus })
            .eq('subject_id', subjectId)
            .eq('grade_id', gradeId);

          if (error) throw error;
          fetchData();
        } catch (error: any) {
          showAlert(error.message, 'Error', 'error');
        }
      },
      `${newStatus ? 'Activate' : 'Deactivate'} Subject`
    );
  };

  const getActivationStatus = (subjectId: string, gradeId: string): boolean => {
    const activation = activations.find(
      a => a.subject_id === subjectId && a.grade_id === gradeId
    );
    return activation?.is_active ?? true;
  };

  const isSubjectActiveForAnyGrade = (subjectId: string): boolean => {
    return activations.some(
      a => a.subject_id === subjectId && a.is_active
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading subjects...</div>;
  }

  return (
    <>
      <Modal
        isOpen={modalState.show}
        onClose={closeModal}
        onConfirm={modalState.onConfirm}
        title={modalState.title}
        message={modalState.message}
        type={modalState.type}
      />

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center space-x-3">
          <BookOpen className="w-6 h-6 text-black" />
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Subjects</h2>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Subject</span>
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-1">
                Subject Name
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black "
                placeholder="e.g., Mathematics"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-900 mb-1">
                Description (Optional)
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black "
                placeholder="Brief description of the subject"
              />
            </div>

            <div>
              <label htmlFor="ai_prompt_id" className="block text-sm font-medium text-gray-900 mb-1">
                AI Assistant Prompt (Optional)
              </label>
              <select
                id="ai_prompt_id"
                value={formData.ai_prompt_id}
                onChange={(e) => setFormData({ ...formData, ai_prompt_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black bg-white"
              >
                <option value="">Default AI Prompt</option>
                {aiPrompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.name}
                    {prompt.description ? ` - ${prompt.description}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                This AI prompt will be used for all exam papers in this subject
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-900">
                  Assign to Grades
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAllGrades}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Select All
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllGrades}
                    className="text-xs text-gray-600 hover:text-gray-700 font-medium"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-white border border-gray-200 rounded-lg">
                {grades.map((grade) => (
                  <label
                    key={grade.id}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGrades.has(grade.id)}
                      onChange={() => handleGradeToggle(grade.id)}
                      className="w-4 h-4 text-black border-gray-300 rounded focus:ring-black"
                    />
                    <span className="text-sm text-gray-900">{grade.name}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {editingId ? (
                  selectedGrades.size === 0
                    ? 'No grades selected. Subject will be deactivated for all grades.'
                    : `Subject will be active for ${selectedGrades.size} grade${selectedGrades.size !== 1 ? 's' : ''}.`
                ) : (
                  selectedGrades.size === 0
                    ? 'No grades selected. Subject will be assigned to all grades by default.'
                    : `Subject will be assigned to ${selectedGrades.size} grade${selectedGrades.size !== 1 ? 's' : ''}.`
                )}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                {editingId ? 'Update' : 'Add'} Subject
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {subjects.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            No subjects added yet. Click "Add Subject" to get started.
          </div>
        ) : (
          subjects.map((subject) => {
            const isActiveForAnyGrade = isSubjectActiveForAnyGrade(subject.id);
            return (
              <div
                key={subject.id}
                className={`p-4 bg-white border rounded-lg hover:border-gray-300 transition-colors ${
                  isActiveForAnyGrade ? 'border-gray-200' : 'border-orange-200 bg-orange-50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className={`font-semibold ${isActiveForAnyGrade ? 'text-gray-900' : 'text-gray-500'}`}>
                        {subject.name}
                      </h3>
                      {!isActiveForAnyGrade && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-orange-100 text-orange-700 rounded">
                          Inactive (All Grades)
                        </span>
                      )}
                    </div>
                    {subject.description && (
                      <p className={`text-sm mb-3 break-words ${isActiveForAnyGrade ? 'text-gray-600' : 'text-gray-400'}`}>
                        {subject.description}
                      </p>
                    )}

                    {/* AI Prompt indicator */}
                    {subject.ai_prompts && (
                      <p className="text-xs text-gray-500 mb-2">
                        <span className="font-medium">AI Prompt:</span> {subject.ai_prompts.name}
                      </p>
                    )}

                    {/* Grade-specific activation toggles */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {grades.map((grade) => {
                        const isActive = getActivationStatus(subject.id, grade.id);
                        return (
                          <button
                            key={grade.id}
                            onClick={() => handleToggleActive(subject.id, grade.id, isActive)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isActive
                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                            title={`${isActive ? 'Active' : 'Inactive'} for ${grade.name} - Click to ${isActive ? 'deactivate' : 'activate'}`}
                          >
                            {isActive ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                            <span>{grade.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex space-x-2 self-end sm:self-start">
                    <button
                      onClick={() => handleEdit(subject)}
                      className="p-2 text-black hover:bg-gray-50 rounded-lg transition-colors"
                      aria-label="Edit subject"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(subject.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      aria-label="Delete subject"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
    </>
  );
}
