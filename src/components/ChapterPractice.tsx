import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ChevronLeft, ChevronRight, MessageSquare, X, Send, Loader2, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ChatMessage } from './ChatMessage';

interface Subject {
  id: string;
  name: string;
}

interface GradeLevel {
  id: string;
  name: string;
}

interface Chapter {
  id: string;
  chapter_number: number;
  chapter_title: string;
  question_count: number;
}

interface Question {
  id: string;
  question_number: string;
  image_url: string;
  image_urls: string[];
  ocr_text: string;
  exam_title: string;
  exam_year: number;
  exam_month: number | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function ChapterPractice() {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const questionContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (selectedSubject && selectedGrade) {
      fetchChapters();
    } else {
      setChapters([]);
    }
  }, [selectedSubject, selectedGrade]);

  useEffect(() => {
    if (selectedChapter) {
      fetchQuestions();
    } else {
      setQuestions([]);
      setCurrentQuestionIndex(0);
    }
  }, [selectedChapter]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const fetchInitialData = async () => {
    try {
      const [subjectsRes, gradesRes] = await Promise.all([
        supabase.from('subjects').select('*').order('name'),
        supabase.from('grade_levels').select('*').order('display_order'),
      ]);

      if (subjectsRes.data) setSubjects(subjectsRes.data);
      if (gradesRes.data) setGradeLevels(gradesRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchChapters = async () => {
    try {
      const { data: syllabus } = await supabase
        .from('syllabus')
        .select('id')
        .eq('subject_id', selectedSubject)
        .eq('grade_id', selectedGrade)
        .eq('processing_status', 'completed')
        .single();

      if (!syllabus) {
        setChapters([]);
        return;
      }

      const { data: chaptersData } = await supabase
        .from('syllabus_chapters')
        .select('id, chapter_number, chapter_title')
        .eq('syllabus_id', syllabus.id)
        .order('display_order');

      if (chaptersData) {
        // Get question counts for each chapter
        const chaptersWithCounts = await Promise.all(
          chaptersData.map(async (chapter) => {
            const { count } = await supabase
              .from('question_chapter_tags')
              .select('*', { count: 'exact', head: true })
              .eq('chapter_id', chapter.id);

            return {
              ...chapter,
              question_count: count || 0,
            };
          })
        );

        setChapters(chaptersWithCounts.filter(ch => ch.question_count > 0));
      }
    } catch (error) {
      console.error('Error fetching chapters:', error);
    }
  };

  const loadExistingConversation = async () => {
    if (!user || !selectedChapter) return;

    try {
      // Check for existing conversation for this chapter
      const { data: existingConv } = await supabase
        .from('chapter_conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('chapter_id', selectedChapter)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (existingConv) {
        setConversationId(existingConv.id);

        // Load existing messages
        const { data: messagesData } = await supabase
          .from('chapter_messages')
          .select('role, content')
          .eq('conversation_id', existingConv.id)
          .order('created_at', { ascending: true });

        if (messagesData) {
          setMessages(messagesData as Message[]);
        }
      }
    } catch (error) {
      // No existing conversation found, will create new one when user sends first message
    }
  };

  const fetchQuestions = async () => {
    try {
      const { data } = await supabase
        .from('question_chapter_tags')
        .select(`
          exam_questions (
            id,
            question_number,
            image_url,
            image_urls,
            ocr_text,
            exam_papers (
              title,
              year,
              month
            )
          )
        `)
        .eq('chapter_id', selectedChapter);

      if (data) {
        const formattedQuestions = data
          .map((item: any) => ({
            id: item.exam_questions.id,
            question_number: item.exam_questions.question_number,
            image_url: item.exam_questions.image_url,
            image_urls: item.exam_questions.image_urls,
            ocr_text: item.exam_questions.ocr_text,
            exam_title: item.exam_questions.exam_papers.title,
            exam_year: item.exam_questions.exam_papers.year,
            exam_month: item.exam_questions.exam_papers.month,
          }))
          .sort((a, b) => {
            if (a.exam_year !== b.exam_year) return b.exam_year - a.exam_year;
            if (a.exam_month !== b.exam_month) return (b.exam_month || 0) - (a.exam_month || 0);
            return parseInt(a.question_number) - parseInt(b.question_number);
          });

        setQuestions(formattedQuestions);
        setCurrentQuestionIndex(0);

        // Clear current conversation state before loading new chapter's conversation
        setMessages([]);
        setConversationId(null);

        // Load existing conversation for this chapter
        loadExistingConversation();
      }
    } catch (error) {
      console.error('Error fetching questions:', error);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      // Keep conversation and messages intact when switching questions
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      // Keep conversation and messages intact when switching questions
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const swipeDistance = touchStartX.current - touchEndX.current;
    const minSwipeDistance = 50;

    if (Math.abs(swipeDistance) > minSwipeDistance) {
      if (swipeDistance > 0) {
        // Swiped left - next question
        handleNextQuestion();
      } else {
        // Swiped right - previous question
        handlePrevQuestion();
      }
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !user || loading) return;

    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      // Create or get conversation
      let convId = conversationId;
      if (!convId) {
        // Double-check for existing conversation before creating
        const { data: existingConv } = await supabase
          .from('chapter_conversations')
          .select('id')
          .eq('user_id', user.id)
          .eq('chapter_id', selectedChapter)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingConv) {
          convId = existingConv.id;
          setConversationId(convId);
        } else {
          // Create new conversation only if none exists
          const chapterInfo = chapters.find(ch => ch.id === selectedChapter);
          const subjectInfo = subjects.find(s => s.id === selectedSubject);

          const { data: conv, error: convError } = await supabase
            .from('chapter_conversations')
            .insert({
              user_id: user.id,
              chapter_id: selectedChapter,
              title: `${subjectInfo?.name} - Chapter ${chapterInfo?.chapter_number}`,
            })
            .select()
            .single();

          if (convError) throw convError;
          convId = conv.id;
          setConversationId(convId);
        }
      }

      // Get question images
      const questionImages = currentQuestion.image_urls && currentQuestion.image_urls.length > 0
        ? currentQuestion.image_urls
        : [currentQuestion.image_url];

      // Call AI assistant
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-with-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            conversationId: convId,
            message: userMessage.content,
            questionImages: questionImages,
            questionText: currentQuestion.ocr_text,
            context: {
              type: 'chapter',
              chapterId: selectedChapter,
              questionNumber: currentQuestion.question_number,
              examTitle: currentQuestion.exam_title,
            }
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to get AI response');

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.response
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const selectedChapterInfo = chapters.find(ch => ch.id === selectedChapter);

  if (!selectedSubject || !selectedGrade || !selectedChapter) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center space-x-3 mb-6">
            <BookOpen className="w-6 h-6 text-black" />
            <h1 className="text-2xl font-semibold text-gray-900">Practice by Chapter</h1>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-black focus:ring-1 focus:ring-black"
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
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Grade Level
              </label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-black focus:ring-1 focus:ring-black"
              >
                <option value="">Select a grade</option>
                {gradeLevels.map((grade) => (
                  <option key={grade.id} value={grade.id}>
                    {grade.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedSubject && selectedGrade && (
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Chapter
                </label>
                {chapters.length === 0 ? (
                  <p className="text-sm text-gray-600">No chapters with questions available for this subject and grade.</p>
                ) : (
                  <select
                    value={selectedChapter}
                    onChange={(e) => setSelectedChapter(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-black focus:ring-1 focus:ring-black"
                  >
                    <option value="">Select a chapter</option>
                    {chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        Chapter {chapter.chapter_number}: {chapter.chapter_title} ({chapter.question_count} questions)
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <button
              onClick={() => {
                setSelectedChapter('');
                setQuestions([]);
              }}
              className="text-sm text-gray-600 hover:text-black mb-1"
            >
              ← Back to chapter selection
            </button>
            <h1 className="text-xl font-semibold text-gray-900">
              Chapter {selectedChapterInfo?.chapter_number}: {selectedChapterInfo?.chapter_title}
            </h1>
            <p className="text-sm text-gray-600">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
          <button
            onClick={() => setShowChat(!showChat)}
            className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            <span className="hidden sm:inline">AI Assistant</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question Viewer */}
        <div
          ref={questionContainerRef}
          className={`flex-1 overflow-auto p-4 ${showChat ? 'lg:w-2/3' : 'w-full'}`}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="max-w-4xl mx-auto">
            {currentQuestion && (
              <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-lg font-semibold text-gray-900">
                      Question {currentQuestion.question_number}
                    </h2>
                    <span className="text-sm text-gray-600">
                      {currentQuestion.exam_title} - {currentQuestion.exam_year}
                    </span>
                  </div>
                </div>

                {/* Question Images */}
                <div className="space-y-4">
                  {(currentQuestion.image_urls && currentQuestion.image_urls.length > 0
                    ? currentQuestion.image_urls
                    : [currentQuestion.image_url]
                  ).map((imageUrl, idx) => (
                    <img
                      key={idx}
                      src={imageUrl}
                      alt={`Question ${currentQuestion.question_number} - Page ${idx + 1}`}
                      className="w-full border border-gray-300 rounded-lg"
                    />
                  ))}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
                  <button
                    onClick={handlePrevQuestion}
                    disabled={currentQuestionIndex === 0}
                    className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>

                  <span className="text-sm text-gray-600">
                    Swipe to navigate (mobile)
                  </span>

                  <button
                    onClick={handleNextQuestion}
                    disabled={currentQuestionIndex === questions.length - 1}
                    className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Chat Assistant */}
        {showChat && (
          <div className="w-full lg:w-1/3 border-l border-gray-200 bg-white flex flex-col fixed lg:relative inset-0 lg:inset-auto z-50">
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">AI Assistant</h3>
              <button
                onClick={() => setShowChat(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 ? (
                <div className="text-center text-gray-600 mt-8">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-sm">Ask me anything about this question!</p>
                  <p className="text-xs text-gray-500 mt-2">
                    I can help explain concepts, provide hints, or check your answers.
                  </p>
                </div>
              ) : (
                messages.map((message, idx) => (
                  <ChatMessage
                    key={idx}
                    role={message.role}
                    content={message.content}
                    isStreaming={false}
                  />
                ))
              )}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-4 py-2 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Ask about this question..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:border-black focus:ring-1 focus:ring-black"
                  disabled={loading}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={loading || !input.trim()}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
