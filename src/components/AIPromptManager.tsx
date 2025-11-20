import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, MessageSquare } from 'lucide-react';
import { Modal } from './Modal';
import { useModal } from '../hooks/useModal';

interface AIPrompt {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  prompt_type: 'ai_assistant' | 'syllabus_extraction';
  created_at: string;
}

export function AIPromptManager() {
  const { modalState, showAlert, showConfirm, closeModal } = useModal();
  const [prompts, setPrompts] = useState<AIPrompt[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    system_prompt: string;
    prompt_type: 'ai_assistant' | 'syllabus_extraction';
  }>({
    name: '',
    description: '',
    system_prompt: '',
    prompt_type: 'ai_assistant',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPrompts();
  }, []);

  const fetchPrompts = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_prompts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPrompts(data || []);
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
          .from('ai_prompts')
          .update({
            name: formData.name,
            description: formData.description || null,
            system_prompt: formData.system_prompt,
            prompt_type: formData.prompt_type,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('ai_prompts')
          .insert([{
            name: formData.name,
            description: formData.description || null,
            system_prompt: formData.system_prompt,
            prompt_type: formData.prompt_type,
          }]);

        if (error) throw error;
      }

      setFormData({ name: '', description: '', system_prompt: '', prompt_type: 'ai_assistant' });
      setIsAdding(false);
      setEditingId(null);
      fetchPrompts();
      showAlert(
        editingId ? 'Prompt updated successfully' : 'Prompt created successfully',
        'Success',
        'success'
      );
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    }
  };

  const handleEdit = (prompt: AIPrompt) => {
    setEditingId(prompt.id);
    setFormData({
      name: prompt.name,
      description: prompt.description || '',
      system_prompt: prompt.system_prompt,
      prompt_type: prompt.prompt_type,
    });
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    // Check if prompt is being used by any exam papers
    try {
      const { data: examPapers, error: checkError } = await supabase
        .from('exam_papers')
        .select('id')
        .eq('ai_prompt_id', id)
        .limit(1);

      if (checkError) throw checkError;

      if (examPapers && examPapers.length > 0) {
        showAlert(
          'This AI prompt cannot be deleted because it is being used by one or more exam papers. Please reassign those exam papers first.',
          'Cannot Delete AI Prompt',
          'warning'
        );
        return;
      }

      showConfirm(
        'Are you sure you want to delete this AI prompt? This action cannot be undone.',
        async () => {
          try {
            const { error } = await supabase.from('ai_prompts').delete().eq('id', id);
            if (error) throw error;
            fetchPrompts();
            showAlert('AI prompt deleted successfully', 'Deleted', 'success');
          } catch (error: any) {
            showAlert(error.message, 'Error', 'error');
          }
        },
        'Delete AI Prompt'
      );
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', description: '', system_prompt: '', prompt_type: 'ai_assistant' });
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading AI prompts...</div>;
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
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <MessageSquare className="w-6 h-6 text-black" />
            <h2 className="text-2xl font-semibold text-gray-900">AI Prompts</h2>
          </div>
          {!isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add AI Prompt</span>
            </button>
          )}
        </div>

        {isAdding && (
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-1">
                  Prompt Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black"
                  placeholder="e.g., O Level Computer Science Assistant"
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-900 mb-1">
                  Description (Optional)
                </label>
                <input
                  id="description"
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black"
                  placeholder="Brief description of this prompt's purpose"
                />
              </div>

              <div>
                <label htmlFor="prompt_type" className="block text-sm font-medium text-gray-900 mb-1">
                  Prompt Type
                </label>
                <select
                  id="prompt_type"
                  value={formData.prompt_type}
                  onChange={(e) => setFormData({ ...formData, prompt_type: e.target.value as 'ai_assistant' | 'syllabus_extraction' })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black"
                >
                  <option value="ai_assistant">AI Assistant (for exam paper chat)</option>
                  <option value="syllabus_extraction">Syllabus Extraction (for chapter extraction)</option>
                </select>
                <p className="mt-1 text-xs text-gray-600">
                  Select the type of prompt. AI Assistant prompts are used for student exam paper assistance, while Syllabus Extraction prompts are used for extracting chapters from syllabus PDFs.
                </p>
              </div>

              <div>
                <label htmlFor="system_prompt" className="block text-sm font-medium text-gray-900 mb-1">
                  System Prompt
                </label>
                <textarea
                  id="system_prompt"
                  value={formData.system_prompt}
                  onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                  required
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:border-black font-mono text-sm"
                  placeholder="Enter the system prompt for the AI assistant. You can use {{SUBJECT}}, {{GRADE}}, and {{EXAM_TITLE}} as placeholders."
                />
                <p className="mt-1 text-xs text-gray-600">
                  Use placeholders: <code className="bg-gray-200 px-1 rounded">{'{{SUBJECT}}'}</code>,{' '}
                  <code className="bg-gray-200 px-1 rounded">{'{{GRADE}}'}</code>,{' '}
                  <code className="bg-gray-200 px-1 rounded">{'{{EXAM_TITLE}}'}</code>
                </p>
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {editingId ? 'Update' : 'Create'} Prompt
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
          {prompts.length === 0 ? (
            <div className="text-center py-8 text-gray-600">
              No AI prompts created yet. Click "Add AI Prompt" to get started.
            </div>
          ) : (
            prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold text-gray-900">{prompt.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        prompt.prompt_type === 'ai_assistant'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {prompt.prompt_type === 'ai_assistant' ? 'AI Assistant' : 'Syllabus Extraction'}
                      </span>
                    </div>
                    {prompt.description && (
                      <p className="text-sm text-gray-600 mt-1">{prompt.description}</p>
                    )}
                    <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                      <p className="text-xs font-medium text-gray-700 mb-1">System Prompt:</p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                        {prompt.system_prompt.length > 200
                          ? `${prompt.system_prompt.substring(0, 200)}...`
                          : prompt.system_prompt}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => handleEdit(prompt)}
                      className="p-2 text-black hover:bg-gray-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(prompt.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
