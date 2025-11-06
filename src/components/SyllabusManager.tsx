import { useState, useEffect } from 'react';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, Edit2, Save, X, Plus, Trash2, Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

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
  subject_id: string;
  grade_id: string;
  file_name: string;
  file_url: string;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  title?: string;
  description?: string;
  academic_year?: string;
  region?: string;
  error_message?: string;
  created_at: string;
  subject?: Subject;
  grade?: GradeLevel;
}

interface Chapter {
  id: string;
  syllabus_id: string;
  chapter_number: number;
  chapter_title: string;
  chapter_description?: string;
  subtopics: string[];
  display_order: number;
  confidence_score?: number;
  is_manually_edited: boolean;
}

export function SyllabusManager() {
  const { user } = useAuth();
  const [syllabusList, setSyllabusList] = useState<Syllabus[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [grades, setGrades] = useState<GradeLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Upload form state
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [region, setRegion] = useState('');

  // Chapter viewing/editing state
  const [viewingSyllabusId, setViewingSyllabusId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editedChapterData, setEditedChapterData] = useState<Partial<Chapter>>({});

  // Subject folder expansion state
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch subjects
      const { data: subjectsData } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name');

      // Fetch grades
      const { data: gradesData } = await supabase
        .from('grade_levels')
        .select('id, name')
        .order('name');

      // Fetch syllabus with related data
      const { data: syllabusData } = await supabase
        .from('syllabus')
        .select(`
          *,
          subject:subjects(id, name),
          grade:grade_levels(id, name)
        `)
        .order('created_at', { ascending: false });

      setSubjects(subjectsData || []);
      setGrades(gradesData || []);
      setSyllabusList(syllabusData || []);
    } catch (error) {
      alert('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf') {
        alert('Please select a PDF file');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile || !selectedSubject || !selectedGrade || !user) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setUploading(true);

      // Upload file to storage
      const fileExt = 'pdf';
      const fileName = `${selectedSubject}_${selectedGrade}_${Date.now()}.${fileExt}`;
      const filePath = `${selectedSubject}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('syllabus-files')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('syllabus-files')
        .getPublicUrl(filePath);

      // Create syllabus record
      const { data: syllabusData, error: dbError } = await supabase
        .from('syllabus')
        .insert({
          subject_id: selectedSubject,
          grade_id: selectedGrade,
          file_name: selectedFile.name,
          file_url: publicUrl,
          file_size: selectedFile.size,
          title: title || selectedFile.name,
          description,
          academic_year: academicYear,
          region: region || null,
          uploaded_by: user.id,
          processing_status: 'pending'
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Process with AI
      await processWithAI(syllabusData.id, publicUrl);

      // Reset form
      setSelectedFile(null);
      setSelectedSubject('');
      setSelectedGrade('');
      setTitle('');
      setDescription('');
      setAcademicYear('');
      setRegion('');

      // Refresh list
      fetchData();

      alert('Syllabus uploaded successfully! AI is processing the document...');
    } catch (error: any) {
      alert(`Failed to upload syllabus: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const processWithAI = async (syllabusId: string, fileUrl: string) => {
    try {

      // Call Supabase Edge Function to extract chapters using Gemini
      const { data, error } = await supabase.functions.invoke('extract-syllabus-chapters', {
        body: { syllabusId, fileUrl }
      });


      if (error) {
        throw new Error(error.message || 'Edge function failed');
      }

      if (!data?.success) {
        const errorMsg = data?.error || data?.details || 'Failed to extract chapters';
        throw new Error(errorMsg);
      }

      alert('Syllabus processed successfully! You can now view the extracted chapters.');

      // Refresh the syllabus list to show updated status
      fetchData();

    } catch (error: any) {

      // Update the syllabus status to failed in the UI
      await supabase
        .from('syllabus')
        .update({
          processing_status: 'failed',
          error_message: error.message
        })
        .eq('id', syllabusId);

      alert(`Failed to process syllabus: ${error.message}\n\nCheck the browser console for details.`);

      // Refresh to show failed status
      fetchData();
    }
  };

  const viewChapters = async (syllabusId: string) => {
    try {
      const { data, error } = await supabase
        .from('syllabus_chapters')
        .select('*')
        .eq('syllabus_id', syllabusId)
        .order('display_order');

      if (error) throw error;

      setChapters(data || []);
      setViewingSyllabusId(syllabusId);
    } catch (error) {
      alert('Failed to load chapters');
    }
  };

  const startEditingChapter = (chapter: Chapter) => {
    setEditingChapter(chapter.id);
    setEditedChapterData({ ...chapter });
  };

  const saveChapter = async (chapterId: string) => {
    try {
      const { error } = await supabase
        .from('syllabus_chapters')
        .update({
          ...editedChapterData,
          is_manually_edited: true
        })
        .eq('id', chapterId);

      if (error) throw error;

      // Refresh chapters
      if (viewingSyllabusId) {
        await viewChapters(viewingSyllabusId);
      }

      setEditingChapter(null);
      setEditedChapterData({});
    } catch (error) {
      alert('Failed to save chapter');
    }
  };

  const deleteChapter = async (chapterId: string) => {
    if (!confirm('Are you sure you want to delete this chapter?')) return;

    try {
      const { error } = await supabase
        .from('syllabus_chapters')
        .delete()
        .eq('id', chapterId);

      if (error) throw error;

      // Refresh chapters
      if (viewingSyllabusId) {
        await viewChapters(viewingSyllabusId);
      }
    } catch (error) {
      alert('Failed to delete chapter');
    }
  };

  const deleteSyllabus = async (syllabusId: string, fileUrl: string) => {
    if (!confirm('Are you sure you want to delete this syllabus and all its chapters?')) return;

    try {
      // Delete from database (will cascade delete chapters)
      const { error: dbError } = await supabase
        .from('syllabus')
        .delete()
        .eq('id', syllabusId);

      if (dbError) throw dbError;

      // Delete file from storage
      const filePath = fileUrl.split('/syllabus-files/')[1];
      if (filePath) {
        await supabase.storage
          .from('syllabus-files')
          .remove([filePath]);
      }

      // Refresh list
      fetchData();
    } catch (error) {
      alert('Failed to delete syllabus');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // If viewing chapters, show chapter view
  if (viewingSyllabusId) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Syllabus Chapters</h2>
            <p className="text-sm text-gray-600 mt-1">
              Review and edit the chapters extracted by AI
            </p>
          </div>
          <button
            onClick={() => {
              setViewingSyllabusId(null);
              setChapters([]);
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <X className="w-4 h-4 inline mr-2" />
            Back to Syllabus List
          </button>
        </div>

        <div className="space-y-4">
          {chapters.map((chapter) => (
            <div key={chapter.id} className="border border-gray-200 rounded-lg p-4">
              {editingChapter === chapter.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Chapter Number
                    </label>
                    <input
                      type="number"
                      value={editedChapterData.chapter_number || ''}
                      onChange={(e) => setEditedChapterData({ ...editedChapterData, chapter_number: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Chapter Title
                    </label>
                    <input
                      type="text"
                      value={editedChapterData.chapter_title || ''}
                      onChange={(e) => setEditedChapterData({ ...editedChapterData, chapter_title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={editedChapterData.chapter_description || ''}
                      onChange={(e) => setEditedChapterData({ ...editedChapterData, chapter_description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Subtopics (comma separated)
                    </label>
                    <input
                      type="text"
                      value={(editedChapterData.subtopics || []).join(', ')}
                      onChange={(e) => setEditedChapterData({ ...editedChapterData, subtopics: e.target.value.split(',').map(s => s.trim()) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => saveChapter(chapter.id)}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                    >
                      <Save className="w-4 h-4 inline mr-1" />
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingChapter(null);
                        setEditedChapterData({});
                      }}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                // View mode
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Chapter {chapter.chapter_number}: {chapter.chapter_title}
                      </h3>
                      {chapter.chapter_description && (
                        <p className="text-sm text-gray-600 mt-1">{chapter.chapter_description}</p>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 ml-4">
                      {chapter.is_manually_edited && (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Edited
                        </span>
                      )}
                      <button
                        onClick={() => startEditingChapter(chapter)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteChapter(chapter.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {chapter.subtopics && chapter.subtopics.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Subtopics:</h4>
                      <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                        {chapter.subtopics.map((subtopic, idx) => (
                          <li key={idx}>{subtopic}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">Syllabus Management</h2>
        <p className="text-sm text-gray-600">
          Upload syllabus PDFs and let AI extract chapters automatically
        </p>
      </div>

      {/* Upload Form */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Upload New Syllabus</h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subject *
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                required
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Grade Level *
              </label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                required
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select grade</option>
                {grades.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Syllabus File (PDF) *
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                required
                className="hidden"
                id="syllabus-upload"
              />
              <label
                htmlFor="syllabus-upload"
                className="cursor-pointer flex flex-col items-center"
              >
                <Upload className="w-12 h-12 text-gray-400 mb-2" />
                {selectedFile ? (
                  <p className="text-sm text-gray-900 font-medium">{selectedFile.name}</p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600 mb-1">Click to upload syllabus PDF</p>
                    <p className="text-xs text-gray-500">PDF up to 10MB</p>
                  </>
                )}
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Region / Exam Board
              </label>
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="e.g., Cambridge, Edexcel, National"
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-xs text-gray-500 mt-1">
                Specify the region or exam board for this syllabus
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Academic Year
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g., 2024-2025"
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Mathematics Syllabus"
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="w-full bg-black text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Uploading and processing...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5 mr-2" />
                Upload Syllabus
              </>
            )}
          </button>
        </form>
      </div>

      {/* Syllabus List - Grouped by Subject */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Uploaded Syllabus</h3>

        {syllabusList.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No syllabus uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {(() => {
              // Group syllabuses by subject
              const groupedBySubject = syllabusList.reduce((acc, syllabus) => {
                const subjectName = syllabus.subject?.name || 'Unknown Subject';
                if (!acc[subjectName]) {
                  acc[subjectName] = [];
                }
                acc[subjectName].push(syllabus);
                return acc;
              }, {} as Record<string, Syllabus[]>);

              const toggleSubject = (subjectName: string) => {
                setExpandedSubjects(prev => {
                  const newSet = new Set(prev);
                  if (newSet.has(subjectName)) {
                    newSet.delete(subjectName);
                  } else {
                    newSet.add(subjectName);
                  }
                  return newSet;
                });
              };

              return Object.entries(groupedBySubject)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([subjectName, syllabuses]) => {
                  const isExpanded = expandedSubjects.has(subjectName);

                  return (
                    <div key={subjectName} className="border border-gray-200 rounded-lg overflow-hidden">
                      {/* Subject Folder Header */}
                      <button
                        onClick={() => toggleSubject(subjectName)}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-150 transition-all"
                      >
                        <div className="flex items-center space-x-3">
                          <Folder className="w-5 h-5 text-blue-600" />
                          <span className="font-semibold text-gray-900">{subjectName}</span>
                          <span className="text-sm text-gray-500 bg-white px-2 py-0.5 rounded-full">
                            {syllabuses.length} {syllabuses.length === 1 ? 'syllabus' : 'syllabuses'}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-500" />
                        )}
                      </button>

                      {/* Syllabus Items */}
                      {isExpanded && (
                        <div className="divide-y divide-gray-200">
                          {syllabuses.map((syllabus) => (
                            <div
                              key={syllabus.id}
                              className="p-4 bg-white hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-start space-x-3 flex-1">
                                  <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-1">
                                      <h4 className="font-semibold text-gray-900">
                                        {syllabus.title || syllabus.file_name}
                                      </h4>
                                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full font-medium">
                                        {syllabus.grade?.name}
                                      </span>
                                    </div>
                                    <div className="text-sm text-gray-600 space-y-1">
                                      {(syllabus.region || syllabus.academic_year) && (
                                        <p>
                                          {syllabus.region && `${syllabus.region}`}
                                          {syllabus.region && syllabus.academic_year && ' • '}
                                          {syllabus.academic_year && `${syllabus.academic_year}`}
                                        </p>
                                      )}
                                      {syllabus.description && (
                                        <p className="text-gray-500">{syllabus.description}</p>
                                      )}
                                      <p className="text-xs text-gray-500">
                                        Uploaded {new Date(syllabus.created_at).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-3 ml-4">
                                  {/* Status Badge */}
                                  {syllabus.processing_status === 'completed' && (
                                    <div className="flex items-center text-green-600 text-sm">
                                      <CheckCircle className="w-4 h-4 mr-1" />
                                      <span className="hidden sm:inline">Processed</span>
                                    </div>
                                  )}
                                  {syllabus.processing_status === 'processing' && (
                                    <div className="flex items-center text-blue-600 text-sm">
                                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                      <span className="hidden sm:inline">Processing...</span>
                                    </div>
                                  )}
                                  {syllabus.processing_status === 'failed' && (
                                    <div className="flex items-center text-red-600 text-sm">
                                      <AlertCircle className="w-4 h-4 mr-1" />
                                      <span className="hidden sm:inline">Failed</span>
                                    </div>
                                  )}

                                  {/* Action Buttons */}
                                  {syllabus.processing_status === 'completed' && (
                                    <button
                                      onClick={() => viewChapters(syllabus.id)}
                                      className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                    >
                                      View Chapters
                                    </button>
                                  )}
                                  <a
                                    href={syllabus.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
                                  >
                                    View PDF
                                  </a>
                                  <button
                                    onClick={() => deleteSyllabus(syllabus.id, syllabus.file_url)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
