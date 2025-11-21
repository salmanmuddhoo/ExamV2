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

export function SubjectManager() {
  const { modalState, showAlert, showConfirm, closeModal } = useModal();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [activations, setActivations] = useState<SubjectGradeActivation[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [subjectsRes, gradesRes, activationsRes] = await Promise.all([
        supabase.from('subjects').select('*').order('name'),
        supabase.from('grade_levels').select('*').order('display_order'),
        supabase.from('subject_grade_activation').select('*')
      ]);

      if (subjectsRes.error) throw subjectsRes.error;
      if (gradesRes.error) throw gradesRes.error;
      if (activationsRes.error) throw activationsRes.error;

      setSubjects(subjectsRes.data || []);
      setGrades(gradesRes.data || []);
      setActivations(activationsRes.data || []);
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
          .update({ name: formData.name, description: formData.description || null })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Insert new subject
        const { data: newSubject, error } = await supabase
          .from('subjects')
          .insert([{ name: formData.name, description: formData.description || null }])
          .select()
          .single();

        if (error) throw error;

        // Create activation records for all grades
        if (newSubject) {
          const activationRecords = grades.map(grade => ({
            subject_id: newSubject.id,
            grade_id: grade.id,
            is_active: true
          }));

          const { error: activationError } = await supabase
            .from('subject_grade_activation')
            .insert(activationRecords);

          if (activationError) throw activationError;
        }
      }

      setFormData({ name: '', description: '' });
      setIsAdding(false);
      setEditingId(null);
      fetchData();
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    }
  };

  const handleEdit = (subject: Subject) => {
    setEditingId(subject.id);
    setFormData({ name: subject.name, description: subject.description || '' });
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
    setFormData({ name: '', description: '' });
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
