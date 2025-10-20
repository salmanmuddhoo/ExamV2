import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, BookOpen, FileText, Loader2, ChevronLeft, ChevronRight, Send, MessageSquare } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ChatMessage } from './ChatMessage';

interface Props {
  mode: 'year' | 'chapter';
  gradeId: string;
  subjectId: string;
  chapterId?: string | null;
  onBack: () => void;
  onLoginRequired: () => void;
  onOpenSubscriptions?: () => void;
}

interface ExamPaper {
  id: string;
  title: string;
  pdf_url: string;
  pdf_path: string;
  year: number;
  month: string;
}

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  question_count?: number;
}

interface Question {
  id: string;
  question_number: string;
  image_url: string;
  image_urls: string[];
  exam_papers: {
    title: string;
    year: number;
    month: string;
  };
}

interface Grade {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  questionNumber?: string | null;
}

export function UnifiedPracticeViewer({
  mode,
  gradeId,
  subjectId,
  chapterId,
  onBack,
  onLoginRequired,
  onOpenSubscriptions
}: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);

  // Year mode state
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ExamPaper | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(false);

  // Chapter mode state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [chapterInfo, setChapterInfo] = useState<Chapter | null>(null);

  // Chat state (shared by both modes)
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchGradeAndSubject();
    if (mode === 'year') {
      fetchPapers();
    } else if (mode === 'chapter' && chapterId) {
      fetchChapterInfo();
      fetchQuestionsForChapter(chapterId);
    }
  }, [mode, gradeId, subjectId, chapterId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  const fetchGradeAndSubject = async () => {
    try {
      const [gradeRes, subjectRes] = await Promise.all([
        supabase.from('grade_levels').select('*').eq('id', gradeId).single(),
        supabase.from('subjects').select('*').eq('id', subjectId).single(),
      ]);

      if (gradeRes.data) setGrade(gradeRes.data);
      if (subjectRes.data) setSubject(subjectRes.data);
    } catch (error) {
      console.error('Error fetching grade/subject:', error);
    }
  };

  const fetchPapers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('exam_papers')
        .select('id, title, pdf_url, pdf_path, year, month')
        .eq('grade_level_id', gradeId)
        .eq('subject_id', subjectId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (error) throw error;
      setPapers(data || []);

      // Auto-select first paper
      if (data && data.length > 0) {
        handlePaperSelect(data[0]);
      }
    } catch (error) {
      console.error('Error fetching papers:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChapterInfo = async () => {
    if (!chapterId) return;

    try {
      const { data, error } = await supabase
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title')
        .eq('id', chapterId)
        .single();

      if (error) throw error;

      if (data) {
        setChapterInfo({
          id: data.id,
          chapter_number: data.chapter_number,
          chapter_title: data.chapter_title
        });
      }
    } catch (error) {
      console.error('Error fetching chapter info:', error);
    }
  };

  const handlePaperSelect = async (paper: ExamPaper) => {
    setSelectedPaper(paper);
    setPdfLoading(true);

    try {
      // Get signed URL for PDF
      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from('exam-papers')
        .createSignedUrl(paper.pdf_path, 3600);

      if (signedUrlError || !signedData?.signedUrl) {
        console.error('Failed to get signed URL:', signedUrlError);
        throw new Error('Failed to get signed URL');
      }

      setPdfBlobUrl(signedData.signedUrl);
    } catch (error) {
      console.error('Error loading PDF:', error);
      const { data: { publicUrl } } = supabase.storage
        .from('exam-papers')
        .getPublicUrl(paper.pdf_path);
      setPdfBlobUrl(publicUrl || paper.pdf_url);
    } finally {
      setPdfLoading(false);
    }
  };

  const fetchQuestionsForChapter = async (chapterId: string) => {
    try {
      setQuestionsLoading(true);

      const { data, error } = await supabase
        .from('question_chapter_tags')
        .select(`
          question_id,
          exam_questions!inner(
            id,
            question_number,
            image_url,
            image_urls,
            exam_papers!inner(
              title,
              year,
              month
            )
          )
        `)
        .eq('chapter_id', chapterId);

      if (error) throw error;

      // Format questions and sort by year (in JavaScript)
      const formattedQuestions = (data || [])
        .map((tag: any) => ({
          id: tag.exam_questions.id,
          question_number: tag.exam_questions.question_number,
          image_url: tag.exam_questions.image_url,
          image_urls: tag.exam_questions.image_urls || [],
          exam_papers: tag.exam_questions.exam_papers
        }))
        .sort((a, b) => {
          // Sort by year (most recent first), then by question number
          if (a.exam_papers.year !== b.exam_papers.year) {
            return b.exam_papers.year - a.exam_papers.year;
          }
          return parseInt(a.question_number) - parseInt(b.question_number);
        });

      setQuestions(formattedQuestions);

      // Auto-select first question
      if (formattedQuestions.length > 0) {
        setSelectedQuestion(formattedQuestions[0]);
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
      setLoading(false);
    }
  };

  const handleQuestionSelect = (question: Question) => {
    setSelectedQuestion(question);
    // Clear messages when switching questions
    setMessages([]);
    setCurrentConversationId(null);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || sending) return;

    // For chapter mode, ensure a question is selected
    if (mode === 'chapter' && !selectedQuestion) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setSending(true);

    try {
      if (mode === 'year') {
        // Year mode: Use existing exam paper logic (similar to ExamViewer)
        // TODO: Implement year mode AI integration
        // This would fetch the exam paper images and marking scheme
        // For now, show a placeholder response
        setTimeout(() => {
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: 'Year mode AI integration coming soon. Please use the existing ExamViewer for now.'
          }]);
          setSending(false);
        }, 1000);
      } else {
        // Chapter mode: Fetch question data and send to AI
        const { data: questionData, error } = await supabase
          .from('exam_questions')
          .select('id, question_number, ocr_text, image_url, image_urls, marking_scheme_text, exam_paper_id')
          .eq('id', selectedQuestion!.id)
          .single();

        if (error) throw error;

        if (!questionData) {
          throw new Error('Question data not found');
        }

        // Fetch question images as base64
        const imageUrls = questionData.image_urls && questionData.image_urls.length > 0
          ? questionData.image_urls
          : [questionData.image_url];

        const base64Images: string[] = [];

        for (const imageUrl of imageUrls) {
          if (!imageUrl) continue;

          try {
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) continue;

            const imageBlob = await imageResponse.blob();
            const reader = new FileReader();

            const base64Image = await new Promise<string>((resolve, reject) => {
              reader.onloadend = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
              };
              reader.onerror = reject;
              reader.readAsDataURL(imageBlob);
            });

            base64Images.push(base64Image);
          } catch (error) {
            console.error('Failed to load image:', error);
          }
        }

        // Prepare request body for AI
        const requestBody = {
          question: userMessage,
          provider: 'gemini',
          examPaperId: questionData.exam_paper_id,
          conversationId: currentConversationId,
          userId: user?.id,
          optimizedMode: true,
          questionNumber: questionData.question_number,
          examPaperImages: base64Images,
          markingSchemeText: questionData.marking_scheme_text || '',
          questionText: questionData.ocr_text || ''
        };

        console.log(`📤 Sending to AI: Question ${questionData.question_number}`);
        console.log(`   - Images: ${base64Images.length}`);
        console.log(`   - Marking scheme: ${questionData.marking_scheme_text ? 'Yes (text)' : 'No'}`);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/exam-assistant`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!response.ok) {
          throw new Error('Failed to get response from AI');
        }

        const data = await response.json();
        const assistantMessage = data.answer;

        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: assistantMessage,
          questionNumber: questionData.question_number
        }]);

        // Save to conversation (chapter mode)
        // TODO: Create chapter_conversations and chapter_messages tables if needed
        // For now, we'll skip saving to database
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">
              {subject?.name} - Grade {grade?.name}
            </h1>
            <p className="text-xs text-gray-500">
              {mode === 'year' ? 'Practice by Year' : 'Practice by Chapter'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {mode === 'year' ? 'Exam Papers' : chapterInfo ? `Chapter ${chapterInfo.chapter_number}` : 'Questions'}
            </h3>
            {mode === 'chapter' && chapterInfo && (
              <p className="text-xs text-gray-600 mb-3">{chapterInfo.chapter_title}</p>
            )}

            {mode === 'year' ? (
              <div className="space-y-2">
                {papers.map(paper => (
                  <button
                    key={paper.id}
                    onClick={() => handlePaperSelect(paper)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selectedPaper?.id === paper.id
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-900 border-gray-200 hover:border-black'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{paper.title}</p>
                        <p className={`text-xs mt-0.5 ${
                          selectedPaper?.id === paper.id ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          {paper.year} {paper.month}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {questions.map((question, idx) => (
                  <button
                    key={question.id}
                    onClick={() => handleQuestionSelect(question)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
                      selectedQuestion?.id === question.id
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-gray-900 border-gray-200 hover:border-black'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          Q{question.question_number}
                        </p>
                        <p className={`text-xs mt-0.5 truncate ${
                          selectedQuestion?.id === question.id ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          {question.exam_papers.title}
                        </p>
                        <p className={`text-xs mt-0.5 ${
                          selectedQuestion?.id === question.id ? 'text-gray-300' : 'text-gray-500'
                        }`}>
                          {question.exam_papers.year} {question.exam_papers.month}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {mode === 'year' && papers.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-8">
                No exam papers available
              </p>
            )}

            {mode === 'chapter' && questions.length === 0 && !questionsLoading && (
              <p className="text-sm text-gray-500 text-center py-8">
                No questions available
              </p>
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {mode === 'year' ? (
            // Year Mode: PDF Viewer
            <div className="flex-1 bg-gray-100 relative">
              {pdfLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">Loading PDF...</p>
                  </div>
                </div>
              ) : pdfBlobUrl && selectedPaper ? (
                <iframe
                  src={pdfBlobUrl}
                  className="w-full h-full border-0"
                  title={selectedPaper.title}
                  allow="fullscreen"
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center max-w-md p-6">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Select an exam paper to view</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Chapter Mode: Question Image Viewer
            <div className="flex-1 bg-gray-100">
              {questionsLoading ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">Loading questions...</p>
                  </div>
                </div>
              ) : !selectedQuestion ? (
                <div className="flex-1 flex items-center justify-center h-full">
                  <div className="text-center max-w-md p-6">
                    <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">Select a question to view</p>
                  </div>
                </div>
              ) : (
                <div className="h-full overflow-y-auto p-6">
                  <div className="max-w-4xl mx-auto">
                    {/* Question Images */}
                    <div className="space-y-4">
                      {(selectedQuestion.image_urls && selectedQuestion.image_urls.length > 0
                        ? selectedQuestion.image_urls
                        : [selectedQuestion.image_url]
                      ).map((imageUrl, idx) => (
                        <img
                          key={idx}
                          src={imageUrl}
                          alt={`Question ${selectedQuestion.question_number} - Image ${idx + 1}`}
                          className="w-full rounded-lg shadow-sm bg-white"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chat Assistant */}
          <div className="w-full md:w-[500px] lg:w-[600px] flex flex-col bg-white border-l border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
              <h2 className="font-semibold text-gray-900">AI Study Assistant</h2>
              <p className="text-xs text-gray-500 mt-1">
                {mode === 'year'
                  ? 'Ask questions about this exam paper'
                  : selectedQuestion
                    ? `Discussing Question ${selectedQuestion.question_number}`
                    : 'Select a question to start chatting'}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {!user ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-sm">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-sm text-gray-600">Sign in to use the AI assistant</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center max-w-sm px-6">
                    <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Study Assistant</h3>
                    <p className="text-sm text-gray-600">
                      {mode === 'year'
                        ? 'Ask me questions about this exam paper. For best results, mention the question number (e.g., "Question 3").'
                        : 'Ask me questions about this problem and I\'ll help guide you through it!'}
                    </p>
                  </div>
                </div>
              ) : null}

              {messages.map((message, index) => (
                <ChatMessage
                  key={index}
                  role={message.role}
                  content={message.content}
                  isStreaming={false}
                  onStreamUpdate={scrollToBottom}
                />
              ))}

              {sending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-900 rounded-lg px-4 py-3">
                    <div className="flex items-center space-x-3">
                      <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                      <span className="text-sm text-gray-600">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {user && (
              <div className="px-4 pt-4 pb-4 border-t border-gray-200 bg-white flex-shrink-0">
                <form onSubmit={handleSendMessage} className="flex space-x-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask a question..."
                    disabled={sending || (mode === 'chapter' && !selectedQuestion)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={sending || !input.trim() || (mode === 'chapter' && !selectedQuestion)}
                    className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
