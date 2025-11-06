import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, CreditCard as Edit2, Trash2, GraduationCap } from 'lucide-react';
import { Modal } from './Modal';
import { useModal } from '../hooks/useModal';

interface GradeLevel {
  id: string;
  name: string;
  display_order: number;
}

export function GradeLevelManager() {
  const { modalState, showAlert, showConfirm, closeModal } = useModal();
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', display_order: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGradeLevels();
  }, []);

  const fetchGradeLevels = async () => {
    try {
      const { data, error } = await supabase
        .from('grade_levels')
        .select('*')
        .order('display_order');

      if (error) throw error;
      setGradeLevels(data || []);
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
          .from('grade_levels')
          .update({ name: formData.name, display_order: formData.display_order })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('grade_levels')
          .insert([{ name: formData.name, display_order: formData.display_order }]);

        if (error) throw error;
      }

      setFormData({ name: '', display_order: 0 });
      setIsAdding(false);
      setEditingId(null);
      fetchGradeLevels();
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    }
  };

  const handleEdit = (gradeLevel: GradeLevel) => {
    setEditingId(gradeLevel.id);
    setFormData({ name: gradeLevel.name, display_order: gradeLevel.display_order });
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    // Check if grade level is being used by any exam papers
    try {
      const { data: examPapers, error: checkError } = await supabase
        .from('exam_papers')
        .select('id')
        .eq('grade_level_id', id)
        .limit(1);

      if (checkError) throw checkError;

      if (examPapers && examPapers.length > 0) {
        showAlert(
          'This grade level cannot be deleted because it is being used by one or more exam papers. Please remove or reassign those exam papers first.',
          'Cannot Delete Grade Level',
          'warning'
        );
        return;
      }

      // If no exam papers use this grade level, proceed with deletion
      showConfirm(
        'Are you sure you want to delete this grade level? This action cannot be undone.',
        async () => {
          try {
            const { error } = await supabase.from('grade_levels').delete().eq('id', id);
            if (error) throw error;
            fetchGradeLevels();
          } catch (error: any) {
            showAlert(error.message, 'Error', 'error');
          }
        },
        'Delete Grade Level'
      );
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', display_order: 0 });
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading grade levels...</div>;
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
          <GraduationCap className="w-6 h-6 text-black" />
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Grade Levels</h2>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Add Grade Level</span>
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-1">
                Grade Level Name
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black "
                placeholder="e.g., Grade 9"
              />
            </div>

            <div>
              <label htmlFor="display_order" className="block text-sm font-medium text-gray-900 mb-1">
                Display Order
              </label>
              <input
                id="display_order"
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black "
                placeholder="e.g., 9"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
              >
                {editingId ? 'Update' : 'Add'} Grade Level
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
        {gradeLevels.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            No grade levels added yet. Click "Add Grade Level" to get started.
          </div>
        ) : (
          gradeLevels.map((gradeLevel) => (
            <div
              key={gradeLevel.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{gradeLevel.name}</h3>
                <p className="text-sm text-gray-600 mt-1">Order: {gradeLevel.display_order}</p>
              </div>
              <div className="flex space-x-2 self-end sm:self-auto">
                <button
                  onClick={() => handleEdit(gradeLevel)}
                  className="p-2 text-black hover:bg-gray-50 rounded-lg transition-colors"
                  aria-label="Edit grade level"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(gradeLevel.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  aria-label="Delete grade level"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    </>
  );
}
