import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, FileText, Trash2, Upload, X, Edit, ChevronDown, BookOpen, GraduationCap, List, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { createPdfPreviewUrl, revokePdfPreviewUrl, convertPdfToBase64Images, PdfImagePart } from '../lib/pdfUtils';
import { Modal } from './Modal';
import { useModal } from '../hooks/useModal';
import { QuestionChapterSummary } from './QuestionChapterSummary';

interface ExamPaper {
  id: string;
  title: string;
  subject_id: string;
  grade_level_id: string;
  syllabus_id: string | null;
  year: number;
  month: number | null;
  pdf_url: string;
  ai_prompt_id: string | null;
  subjects: { name: string };
  grade_levels: { name: string };
  syllabus: { id: string; title: string | null; region: string | null } | null;
  marking_schemes: { id: string; pdf_url: string } | null;
  ai_prompts: { name: string } | null;
}

interface Subject {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  name: string;
}

interface AIPrompt {
  id: string;
  name: string;
  description: string | null;
}

interface Syllabus {
  id: string;
  subject_id: string;
  grade_id: string;
  title: string | null;
  region: string | null;
  processing_status: string;
}

export function ExamPaperManager() {
  const { user } = useAuth();
  const { modalState, showAlert, showConfirm, closeModal } = useModal();
  const [examPapers, setExamPapers] = useState<ExamPaper[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [aiPrompts, setAiPrompts] = useState<AIPrompt[]>([]);
  const [syllabuses, setSyllabuses] = useState<Syllabus[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    subject_id: '',
    grade_level_id: '',
    syllabus_id: '',
    year: new Date().getFullYear(),
    month: '' as string,
    ai_prompt_id: '',
  });

  const MONTHS = [
    { value: '1', label: 'January' },
    { value: '2', label: 'February' },
    { value: '3', label: 'March' },
    { value: '4', label: 'April' },
    { value: '5', label: 'May' },
    { value: '6', label: 'June' },
    { value: '7', label: 'July' },
    { value: '8', label: 'August' },
    { value: '9', label: 'September' },
    { value: '10', label: 'October' },
    { value: '11', label: 'November' },
    { value: '12', label: 'December' },
  ];

  const getMonthName = (monthNumber: number | null): string | null => {
    if (!monthNumber) return null;
    const month = MONTHS.find(m => parseInt(m.value) === monthNumber);
    return month ? month.label : null;
  };
  const [examPaperFile, setExamPaperFile] = useState<File | null>(null);
  const [markingSchemeFile, setMarkingSchemeFile] = useState<File | null>(null);
  const [examPaperPreviewUrl, setExamPaperPreviewUrl] = useState<string>('');
  const [markingSchemePreviewUrl, setMarkingSchemePreviewUrl] = useState<string>('');
  const [examPaperImages, setExamPaperImages] = useState<PdfImagePart[]>([]);
  const [processingPdf, setProcessingPdf] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [collapsedGrades, setCollapsedGrades] = useState<Set<string>>(new Set());
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [viewingSummaryPaper, setViewingSummaryPaper] = useState<{ id: string; title: string } | null>(null);
  const [retaggingPaperId, setRetaggingPaperId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch syllabuses when subject and grade change
  useEffect(() => {
    if (formData.subject_id && formData.grade_level_id) {
      fetchSyllabuses();
    } else {
      setSyllabuses([]);
      setFormData(prev => ({ ...prev, syllabus_id: '' }));
    }
  }, [formData.subject_id, formData.grade_level_id]);

  const fetchData = async () => {
    try {
      const [papersRes, subjectsRes, gradesRes, promptsRes] = await Promise.all([
        supabase
          .from('exam_papers')
          .select(`
            *,
            subjects (name),
            grade_levels (name),
            syllabus (id, title, region),
            marking_schemes (id, pdf_url),
            ai_prompts (name)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('subjects').select('*').order('name'),
        supabase.from('grade_levels').select('*').order('display_order'),
        supabase.from('ai_prompts').select('id, name, description').order('name'),
      ]);

      if (papersRes.error) throw papersRes.error;
      if (subjectsRes.error) throw subjectsRes.error;
      if (gradesRes.error) throw gradesRes.error;
      if (promptsRes.error) throw promptsRes.error;

      setExamPapers(papersRes.data || []);
      setSubjects(subjectsRes.data || []);
      setGradeLevels(gradesRes.data || []);
      setAiPrompts(promptsRes.data || []);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const fetchSyllabuses = async () => {
    try {
      const { data, error } = await supabase
        .from('syllabus')
        .select('id, subject_id, grade_id, title, region, processing_status')
        .eq('subject_id', formData.subject_id)
        .eq('grade_id', formData.grade_level_id)
        .eq('processing_status', 'completed')
        .order('region');

      if (error) throw error;
      setSyllabuses(data || []);
    } catch (error) {
      setSyllabuses([]);
    }
  };

  const uploadFile = async (file: File, bucket: string, folder: string) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    const { data, error } = await supabase.storage.from(bucket).upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);

    return { path: data.path, url: publicUrl };
  };

  const retagQuestionsWithNewSyllabus = async (examPaperId: string, newSyllabusId: string) => {

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/retag-questions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          examPaperId,
          syllabusId: newSyllabusId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to re-tag questions: ${errorText}`);
    }

    const result = await response.json();
    return result;
  };

  const handleRetag = async (paper: ExamPaper) => {
    if (!paper.syllabus_id) {
      showAlert('This exam paper has no syllabus assigned. Please edit and assign a syllabus first.', 'No Syllabus', 'warning');
      return;
    }

    setRetaggingPaperId(paper.id);
    try {
      await retagQuestionsWithNewSyllabus(paper.id, paper.syllabus_id);
      showAlert('Questions have been re-tagged with chapter information successfully!', 'Retag Complete', 'success');
    } catch (error: any) {
      showAlert(`Failed to retag questions: ${error.message}`, 'Retag Failed', 'error');
    } finally {
      setRetaggingPaperId(null);
    }
  };

  const handleEdit = (paper: ExamPaper) => {
    setEditingId(paper.id);
    setFormData({
      title: paper.title,
      subject_id: paper.subject_id,
      grade_level_id: paper.grade_level_id,
      syllabus_id: paper.syllabus_id || '',
      year: paper.year,
      month: paper.month ? paper.month.toString() : '',
      ai_prompt_id: paper.ai_prompt_id || '',
    });
    setIsAdding(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingId) return;

    setUploading(true);

    try {
      // Get the current exam paper to check if syllabus changed
      const { data: currentPaper } = await supabase
        .from('exam_papers')
        .select('syllabus_id')
        .eq('id', editingId)
        .single();

      const oldSyllabusId = currentPaper?.syllabus_id;
      const newSyllabusId = formData.syllabus_id || null;
      const syllabusChanged = oldSyllabusId !== newSyllabusId;

      const { error } = await supabase
        .from('exam_papers')
        .update({
          title: formData.title,
          subject_id: formData.subject_id,
          grade_level_id: formData.grade_level_id,
          syllabus_id: newSyllabusId,
          year: formData.year,
          month: formData.month ? parseInt(formData.month) : null,
          ai_prompt_id: formData.ai_prompt_id || null,
        })
        .eq('id', editingId);

      if (error) throw error;

      // If syllabus changed and new syllabus is not null, trigger re-tagging
      if (syllabusChanged && newSyllabusId) {
        setProcessingStatus('Syllabus changed. Re-tagging questions with new chapters...');
        try {
          await retagQuestionsWithNewSyllabus(editingId, newSyllabusId);
          showAlert('Exam paper and questions updated successfully!', 'Success', 'success');
        } catch (retagError: any) {
          showAlert(`Exam paper updated, but re-tagging failed: ${retagError.message}`, 'Partial Success', 'warning');
        }
        setProcessingStatus('');
      } else {
        showAlert('Exam paper updated successfully!', 'Success', 'success');
      }

      setFormData({
        title: '',
        subject_id: '',
        grade_level_id: '',
        syllabus_id: '',
        year: new Date().getFullYear(),
        month: '',
        ai_prompt_id: '',
      });
      setIsAdding(false);
      setEditingId(null);
      fetchData();
    } catch (error: any) {
      showAlert(error.message || 'Failed to update exam paper', 'Update Failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      return handleUpdate(e);
    }

    if (!examPaperFile) {
      showAlert('Please select an exam paper PDF', 'Missing File', 'warning');
      return;
    }

    if (!user) {
      showAlert('You must be logged in to upload exam papers', 'Authentication Required', 'warning');
      return;
    }

    setUploading(true);

    try {
      const examPaperUpload = await uploadFile(examPaperFile, 'exam-papers', 'papers');

      const { data: examPaper, error: examError } = await supabase
        .from('exam_papers')
        .insert([
          {
            title: formData.title,
            subject_id: formData.subject_id,
            grade_level_id: formData.grade_level_id,
            syllabus_id: formData.syllabus_id || null,
            year: formData.year,
            month: formData.month ? parseInt(formData.month) : null,
            ai_prompt_id: formData.ai_prompt_id || null,
            pdf_url: examPaperUpload.url,
            pdf_path: examPaperUpload.path,
            uploaded_by: user.id,
          },
        ])
        .select()
        .single();

      if (examError) throw examError;

      if (markingSchemeFile && examPaper) {
        const markingSchemeUpload = await uploadFile(markingSchemeFile, 'marking-schemes', 'schemes');

        const { error: schemeError } = await supabase.from('marking_schemes').insert([
          {
            exam_paper_id: examPaper.id,
            pdf_url: markingSchemeUpload.url,
            pdf_path: markingSchemeUpload.path,
            uploaded_by: user.id,
          },
        ]);

        if (schemeError) throw schemeError;
      }

      try {
        setProcessingStatus('Converting PDF to images...');

        if (examPaperImages.length === 0) {
          throw new Error('No images extracted from PDF. Please try again.');
        }

        const pageImages = examPaperImages.map((part, index) => ({
          pageNumber: index + 1,
          base64Image: part.inlineData.data,
        }));


        let markingSchemeImageData: Array<{ pageNumber: number; base64Image: string }> = [];
        
        if (markingSchemeFile) {
          setProcessingStatus('Converting marking scheme to images...');
          const schemeImages = await convertPdfToBase64Images(markingSchemeFile);
          markingSchemeImageData = schemeImages.map((part, index) => ({
            pageNumber: index + 1,
            base64Image: part.inlineData.data,
          }));
        }

        setProcessingStatus('Running AI to extract and split questions...');

        const processingResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-exam-paper`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              examPaperId: examPaper.id,
              pageImages: pageImages,
              markingSchemeImages: markingSchemeImageData.length > 0 ? markingSchemeImageData : undefined,
            }),
          }
        );


        if (!processingResponse.ok) {
          const errorText = await processingResponse.text();
          throw new Error(`AI processing failed: ${errorText}`);
        }

        const processingResult = await processingResponse.json();

        setProcessingStatus('');
        setFormData({ title: '', subject_id: '', grade_level_id: '', syllabus_id: '', year: new Date().getFullYear(), month: '', ai_prompt_id: '' });
        setExamPaperFile(null);
        setMarkingSchemeFile(null);
        setExamPaperImages([]);
        setIsAdding(false);
        fetchData();

        if (processingResult.questionsCount > 0) {
          showAlert(`Success! Detected ${processingResult.questionsCount} questions`, 'Upload Successful', 'success');
        } else {
          showAlert('Upload successful but no questions detected.', 'Upload Complete', 'warning');
        }
      } catch (processingError: any) {
        setProcessingStatus('');
        setFormData({ title: '', subject_id: '', grade_level_id: '', syllabus_id: '', year: new Date().getFullYear(), month: '', ai_prompt_id: '' });
        setExamPaperFile(null);
        setMarkingSchemeFile(null);
        setExamPaperImages([]);
        setIsAdding(false);
        fetchData();
        showAlert('Exam paper uploaded! Processing error: ' + processingError.message, 'Processing Error', 'warning');
      }
    } catch (error: any) {
      showAlert(error.message, 'Error', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (paper: ExamPaper) => {
    showConfirm(
      'Are you sure you want to delete this exam paper? This action cannot be undone.',
      async () => {
        try {

          // Get all question images for this exam paper
          const { data: examQuestions, error: fetchError } = await supabase
            .from('exam_questions')
            .select('image_urls')
            .eq('exam_paper_id', paper.id);

          if (fetchError) {
          }


          // Delete all question images from storage by deleting the entire folder
          // Images are stored in format: {examPaperId}/q{number}_page{page}.jpg
          const { data: files, error: listError } = await supabase.storage
            .from('exam-questions')
            .list(paper.id);

          if (listError) {
          } else if (files && files.length > 0) {

            // Build full paths for deletion
            const filePaths = files.map(file => `${paper.id}/${file.name}`);

            const { error: deleteError } = await supabase.storage
              .from('exam-questions')
              .remove(filePaths);

            if (deleteError) {
            } else {
            }
          }

          // Delete exam paper PDF from storage
          const { error: pdfDeleteError } = await supabase.storage
            .from('exam-papers')
            .remove([paper.pdf_path]);

          if (pdfDeleteError) {
          }

          // Delete marking scheme and its PDF if it exists
          if (paper.marking_schemes) {
            const { data: scheme } = await supabase
              .from('marking_schemes')
              .select('id, pdf_path')
              .eq('id', paper.marking_schemes.id)
              .single();

            if (scheme) {
              // Delete marking scheme PDF
              const { error: schemeDeleteError } = await supabase.storage
                .from('marking-schemes')
                .remove([scheme.pdf_path]);

              if (schemeDeleteError) {
              }
            }
          }

          // Delete the exam paper from database (CASCADE will delete related questions and marking schemes)
          const { error } = await supabase.from('exam_papers').delete().eq('id', paper.id);
          if (error) throw error;

          fetchData();
          showAlert('Exam paper and all related files deleted successfully', 'Deleted', 'success');
        } catch (error: any) {
          showAlert(error.message, 'Error', 'error');
        }
      },
      'Delete Exam Paper'
    );
  };

  const handleExamPaperChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (examPaperPreviewUrl) {
      revokePdfPreviewUrl(examPaperPreviewUrl);
    }

    setExamPaperFile(file);
    const previewUrl = createPdfPreviewUrl(file);
    setExamPaperPreviewUrl(previewUrl);

    setProcessingPdf(true);
    try {
      const images = await convertPdfToBase64Images(file);
      setExamPaperImages(images);
    } catch (error) {
      showAlert('Error processing PDF. The file will still be uploaded.', 'Processing Warning', 'warning');
    } finally {
      setProcessingPdf(false);
    }
  };

  const handleMarkingSchemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (markingSchemePreviewUrl) {
      revokePdfPreviewUrl(markingSchemePreviewUrl);
    }

    setMarkingSchemeFile(file);
    const previewUrl = createPdfPreviewUrl(file);
    setMarkingSchemePreviewUrl(previewUrl);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ title: '', subject_id: '', grade_level_id: '', syllabus_id: '', year: new Date().getFullYear(), month: '', ai_prompt_id: '' });
    setExamPaperFile(null);
    setMarkingSchemeFile(null);
    if (examPaperPreviewUrl) {
      revokePdfPreviewUrl(examPaperPreviewUrl);
      setExamPaperPreviewUrl('');
    }
    if (markingSchemePreviewUrl) {
      revokePdfPreviewUrl(markingSchemePreviewUrl);
      setMarkingSchemePreviewUrl('');
    }
    setExamPaperImages([]);
    setSyllabuses([]);
  };

  const toggleGrade = (gradeId: string) => {
    const newCollapsed = new Set(collapsedGrades);
    if (newCollapsed.has(gradeId)) {
      newCollapsed.delete(gradeId);
    } else {
      newCollapsed.add(gradeId);
    }
    setCollapsedGrades(newCollapsed);
  };

  const toggleSubject = (subjectKey: string) => {
    const newExpanded = new Set(expandedSubjects);
    if (newExpanded.has(subjectKey)) {
      newExpanded.delete(subjectKey);
    } else {
      newExpanded.add(subjectKey);
    }
    setExpandedSubjects(newExpanded);
  };

  // Group exam papers by grade and subject
  const groupedPapers = examPapers.reduce((acc, paper) => {
    const gradeName = paper.grade_levels.name;
    const subjectName = paper.subjects.name;

    if (!acc[gradeName]) {
      acc[gradeName] = {};
    }
    if (!acc[gradeName][subjectName]) {
      acc[gradeName][subjectName] = [];
    }
    acc[gradeName][subjectName].push(paper);

    return acc;
  }, {} as Record<string, Record<string, ExamPaper[]>>);

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading exam papers...</div>;
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center space-x-3">
          <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-black" />
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">Exam Papers</h2>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center justify-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors w-full sm:w-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Exam Paper</span>
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Exam Paper' : 'Add New Exam Paper'}
          </h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-900 mb-1">
                Exam Paper Title
              </label>
              <input
                id="title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="e.g., Mid-term Examination 2024"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-gray-900 mb-1">
                  Subject
                </label>
                <select
                  id="subject"
                  value={formData.subject_id}
                  onChange={(e) => setFormData({ ...formData, subject_id: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select a subject</option>
                  {subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="grade" className="block text-sm font-medium text-gray-900 mb-1">
                  Grade Level
                </label>
                <select
                  id="grade"
                  value={formData.grade_level_id}
                  onChange={(e) => setFormData({ ...formData, grade_level_id: e.target.value })}
                  required
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select a grade</option>
                  {gradeLevels.map((grade) => (
                    <option key={grade.id} value={grade.id}>
                      {grade.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="syllabus" className="block text-sm font-medium text-gray-900 mb-1">
                  Syllabus / Region (Optional)
                </label>
                <select
                  id="syllabus"
                  value={formData.syllabus_id}
                  onChange={(e) => setFormData({ ...formData, syllabus_id: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!formData.subject_id || !formData.grade_level_id}
                >
                  <option value="">No syllabus (skip chapter tagging)</option>
                  {syllabuses.map((syllabus) => (
                    <option key={syllabus.id} value={syllabus.id}>
                      {syllabus.title || 'Syllabus'}
                      {syllabus.region && ` - ${syllabus.region}`}
                    </option>
                  ))}
                </select>
                {formData.subject_id && formData.grade_level_id && syllabuses.length === 0 && (
                  <p className="mt-1 text-xs text-gray-600">
                    No completed syllabus found for this subject and grade. Questions won't be tagged to chapters.
                  </p>
                )}
                {(!formData.subject_id || !formData.grade_level_id) && (
                  <p className="mt-1 text-xs text-gray-600">
                    Select subject and grade to choose a syllabus
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="month" className="block text-sm font-medium text-gray-900 mb-1">
                  Month (Optional)
                </label>
                <select
                  id="month"
                  value={formData.month}
                  onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Select a month</option>
                  {MONTHS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="year" className="block text-sm font-medium text-gray-900 mb-1">
                  Year
                </label>
                <input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                  min="2000"
                  max="2099"
                  required
                  className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="e.g., 2024"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ai_prompt" className="block text-sm font-medium text-gray-900 mb-1">
                AI Assistant Prompt (Optional)
              </label>
              <select
                id="ai_prompt"
                value={formData.ai_prompt_id}
                onChange={(e) => setFormData({ ...formData, ai_prompt_id: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black hover:border-gray-400 transition-all cursor-pointer disabled:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Use default prompt</option>
                {aiPrompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.name}
                    {prompt.description ? ` - ${prompt.description}` : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-600">
                Select a custom AI prompt for this exam paper. Subject and grade will be automatically included.
              </p>
            </div>

            {!editingId && (
              <>
            <div>
              <label htmlFor="exam-paper" className="block text-sm font-medium text-gray-900 mb-1">
                Exam Paper PDF (Required)
              </label>
              <div className="flex items-center space-x-3">
                <label className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-black transition-colors">
                  <Upload className="w-5 h-5 text-gray-600 mr-2" />
                  <span className="text-sm text-gray-600">
                    {examPaperFile ? examPaperFile.name : 'Choose exam paper PDF'}
                  </span>
                  <input
                    id="exam-paper"
                    type="file"
                    accept=".pdf"
                    onChange={handleExamPaperChange}
                    className="hidden"
                  />
                </label>
              </div>
              {processingPdf && (
                <p className="text-xs text-gray-600 mt-2 flex items-center">
                  <span className="animate-spin mr-2">⚙️</span>
                  Processing PDF for AI (converting to images)...
                </p>
              )}
              {examPaperImages.length > 0 && (
                <p className="text-xs text-gray-600 mt-2">
                  PDF processed: {examPaperImages.length} pages ready for AI
                </p>
              )}
              {examPaperPreviewUrl && (
                <div className="mt-3 border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">Preview</span>
                    <button
                      type="button"
                      onClick={() => {
                        revokePdfPreviewUrl(examPaperPreviewUrl);
                        setExamPaperPreviewUrl('');
                        setExamPaperFile(null);
                        setExamPaperImages([]);
                      }}
                      className="text-gray-600 hover:text-black"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <embed
                    src={examPaperPreviewUrl}
                    type="application/pdf"
                    className="w-full h-96"
                  />
                </div>
              )}
            </div>

            <div>
              <label htmlFor="marking-scheme" className="block text-sm font-medium text-gray-900 mb-1">
                Marking Scheme PDF (Optional)
              </label>
              <div className="flex items-center space-x-3">
                <label className="flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-black transition-colors">
                  <Upload className="w-5 h-5 text-gray-600 mr-2" />
                  <span className="text-sm text-gray-600">
                    {markingSchemeFile ? markingSchemeFile.name : 'Choose marking scheme PDF'}
                  </span>
                  <input
                    id="marking-scheme"
                    type="file"
                    accept=".pdf"
                    onChange={handleMarkingSchemeChange}
                    className="hidden"
                  />
                </label>
              </div>
              {markingSchemePreviewUrl && (
                <div className="mt-3 border border-gray-300 rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">Preview</span>
                    <button
                      type="button"
                      onClick={() => {
                        revokePdfPreviewUrl(markingSchemePreviewUrl);
                        setMarkingSchemePreviewUrl('');
                        setMarkingSchemeFile(null);
                      }}
                      className="text-gray-600 hover:text-black"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <embed
                    src={markingSchemePreviewUrl}
                    type="application/pdf"
                    className="w-full h-96"
                  />
                </div>
              )}
            </div>
              </>
            )}

            {processingStatus && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 flex items-center">
                  <span className="animate-spin mr-2">⚙️</span>
                  {processingStatus}
                </p>
              </div>
            )}

            <div className="flex space-x-3">
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingId
                  ? (uploading ? 'Updating...' : 'Update Exam Paper')
                  : (uploading ? 'Uploading & Processing...' : 'Upload Exam Paper')
                }
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={uploading}
                className="px-4 py-2 bg-gray-100 text-gray-900 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {examPapers.length === 0 ? (
          <div className="text-center py-8 text-gray-600">
            No exam papers uploaded yet. Click "Upload Exam Paper" to get started.
          </div>
        ) : (
          Object.entries(groupedPapers).map(([gradeName, subjects]) => {
            const gradeId = gradeName;
            const isGradeCollapsed = collapsedGrades.has(gradeId);
            const totalPapers = Object.values(subjects).reduce((sum, papers) => sum + papers.length, 0);

            return (
              <div key={gradeId} className="mb-3">
                {/* Grade Level Folder */}
                <button
                  onClick={() => toggleGrade(gradeId)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gradient-to-r from-gray-100 to-gray-50 hover:from-gray-200 hover:to-gray-100 rounded-lg transition-all border border-gray-200"
                >
                  <div className="flex items-center space-x-3">
                    <GraduationCap className="w-5 h-5 text-gray-700" />
                    <div className="text-left">
                      <h3 className="text-base font-bold text-gray-900">{gradeName}</h3>
                      <p className="text-xs text-gray-500">{totalPapers} paper{totalPapers !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${isGradeCollapsed ? '' : 'rotate-180'}`} />
                </button>

                {/* Subjects under this grade */}
                {!isGradeCollapsed && (
                  <div className="mt-2 ml-2 sm:ml-6 pl-2 sm:pl-4 border-l-2 border-gray-300 space-y-2">
                    {Object.entries(subjects).map(([subjectName, papers]) => {
                      const subjectKey = `${gradeId}:${subjectName}`;
                      const isSubjectExpanded = expandedSubjects.has(subjectKey);

                      return (
                        <div key={subjectKey}>
                          {/* Subject Folder */}
                          <button
                            onClick={() => toggleSubject(subjectKey)}
                            className="w-full flex items-center justify-between px-3 py-2.5 bg-white hover:bg-gray-50 rounded-lg transition-all border border-gray-200"
                          >
                            <div className="flex items-center space-x-2.5">
                              <BookOpen className="w-4 h-4 text-gray-600" />
                              <div className="text-left">
                                <h4 className="text-sm font-semibold text-gray-900">{subjectName}</h4>
                                <p className="text-xs text-gray-500">{papers.length} paper{papers.length !== 1 ? 's' : ''}</p>
                              </div>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isSubjectExpanded ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Papers under this subject */}
                          {isSubjectExpanded && (
                            <div className="mt-1 ml-2 sm:ml-4 pl-2 sm:pl-3 border-l-2 border-gray-200 space-y-2">
                              {papers.map((paper) => (
                                <div
                                  key={paper.id}
                                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors gap-2"
                                >
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-gray-900 text-sm truncate">{paper.title}</h3>
                                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-3 mt-1">
                                      <span className="text-xs text-gray-600">
                                        {paper.month ? `${getMonthName(paper.month)} ` : ''}{paper.year}
                                      </span>
                                      {paper.marking_schemes && (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                                          MS
                                        </span>
                                      )}
                                      {paper.ai_prompts && (
                                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded truncate max-w-[100px] sm:max-w-none">
                                          {paper.ai_prompts.name}
                                        </span>
                                      )}
                                      {paper.syllabus && (
                                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded truncate max-w-[100px] sm:max-w-none" title={paper.syllabus.region ? `Region: ${paper.syllabus.region}` : undefined}>
                                          {paper.syllabus.title || 'Syllabus'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1 sm:ml-3">
                                    <button
                                      onClick={() => setViewingSummaryPaper({ id: paper.id, title: paper.title })}
                                      className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                      title="View Question-Chapter Summary"
                                    >
                                      <List className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleRetag(paper)}
                                      disabled={retaggingPaperId === paper.id || !paper.syllabus_id}
                                      className={`p-1.5 rounded transition-colors ${
                                        paper.syllabus_id
                                          ? 'text-orange-600 hover:bg-orange-50'
                                          : 'text-gray-300 cursor-not-allowed'
                                      } ${retaggingPaperId === paper.id ? 'animate-spin' : ''}`}
                                      title={paper.syllabus_id ? 'Retag Questions with Chapters' : 'No syllabus assigned'}
                                    >
                                      <RefreshCw className="w-3.5 h-3.5" />
                                    </button>
                                    <a
                                      href={paper.pdf_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2 py-1.5 text-xs text-black hover:bg-gray-50 rounded transition-colors"
                                    >
                                      View PDF
                                    </a>
                                    <button
                                      onClick={() => handleEdit(paper)}
                                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                      title="Edit"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(paper)}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>

      {/* Question-Chapter Summary Modal */}
      {viewingSummaryPaper && (
        <QuestionChapterSummary
          examPaperId={viewingSummaryPaper.id}
          examTitle={viewingSummaryPaper.title}
          onClose={() => setViewingSummaryPaper(null)}
        />
      )}
    </>
  );
}