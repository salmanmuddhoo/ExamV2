import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, BookOpen, FileText, Loader2, ChevronLeft, ChevronRight, Send, MessageSquare, Lock, Maximize, Minimize } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ChatMessage } from './ChatMessage';
import { formatTokenCount } from '../lib/formatUtils';

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
  const { user, profile } = useAuth();
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
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [chapterInfo, setChapterInfo] = useState<Chapter | null>(null);

  // Chat state (shared by both modes)
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Subscription state (like ExamViewer)
  const [chatLocked, setChatLocked] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState<number>(-1);
  const [tierName, setTierName] = useState<string>('');
  const [tokensLimit, setTokensLimit] = useState<number | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number>(0);

  // Mobile state
  const [mobileView, setMobileView] = useState<'pdf' | 'chat'>('pdf');
  const [isMobile, setIsMobile] = useState(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Question/Paper change animation state
  const [questionChangeAnimation, setQuestionChangeAnimation] = useState(false);
  const [paperChangeAnimation, setPaperChangeAnimation] = useState(false);
  const prevQuestionRef = useRef<string | null>(null);
  const prevPaperRef = useRef<string | null>(null);

  useEffect(() => {
    fetchGradeAndSubject();
    checkSubscription();

    if (mode === 'year') {
      fetchPapers();
    } else if (mode === 'chapter' && chapterId) {
      fetchChapterInfo();
      fetchQuestionsForChapter(chapterId);
      loadExistingConversation();
    }

    // Mobile detection
    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [mode, gradeId, subjectId, chapterId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Trigger animation when question changes
  useEffect(() => {
    if (mode === 'chapter' && selectedQuestion) {
      const currentQuestionNumber = selectedQuestion.question_number;

      // Only animate if the question actually changed (not on initial load)
      if (prevQuestionRef.current !== null && prevQuestionRef.current !== currentQuestionNumber) {
        setQuestionChangeAnimation(true);

        // Remove animation class after animation completes
        const timer = setTimeout(() => {
          setQuestionChangeAnimation(false);
        }, 600); // Match animation duration

        return () => clearTimeout(timer);
      }

      prevQuestionRef.current = currentQuestionNumber;
    }
  }, [selectedQuestion, mode]);

  // Trigger animation when exam paper changes
  useEffect(() => {
    if (mode === 'year' && selectedPaper) {
      const currentPaperId = selectedPaper.id;

      // Only animate if the paper actually changed (not on initial load)
      if (prevPaperRef.current !== null && prevPaperRef.current !== currentPaperId) {
        setPaperChangeAnimation(true);

        // Remove animation class after animation completes
        const timer = setTimeout(() => {
          setPaperChangeAnimation(false);
        }, 600); // Match animation duration

        return () => clearTimeout(timer);
      }

      prevPaperRef.current = currentPaperId;
    }
  }, [selectedPaper, mode]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  const loadExistingConversation = async () => {
    if (!user || !chapterId) return;

    try {
      // Check if there's an existing conversation for this chapter
      const { data: existingConv, error: convError } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('chapter_id', chapterId)
        .eq('practice_mode', 'chapter')
        .maybeSingle();

      if (convError) {
        return;
      }

      if (existingConv) {
        setCurrentConversationId(existingConv.id);

        // Load messages for this conversation
        const { data: msgs, error: msgsError } = await supabase
          .from('conversation_messages')
          .select('role, content')
          .eq('conversation_id', existingConv.id)
          .order('created_at', { ascending: true });

        if (msgsError) {
          return;
        }

        if (msgs && msgs.length > 0) {
          setMessages(msgs.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })));
        }
      }
    } catch (error) {
    }
  };

  const checkSubscription = async () => {
    if (!user) return;

    try {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('tokens_used_current_period, token_limit_override, subscription_tiers!inner(name, token_limit)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subscription) {
        const tierName = subscription.subscription_tiers?.name;
        const tierTokenLimit = subscription.subscription_tiers?.token_limit;
        const tokenLimit = (subscription as any).token_limit_override ?? tierTokenLimit;
        const actualUsed = subscription.tokens_used_current_period;

        // For non-admin users, cap displayed usage at the limit
        const isAdmin = profile?.role === 'admin';
        const displayedUsed = isAdmin ? actualUsed : (tokenLimit !== null ? Math.min(actualUsed, tokenLimit) : actualUsed);

        setTokensLimit(tokenLimit);
        setTokensUsed(displayedUsed);
        setTierName(tierName);

        if (tokenLimit !== null) {
          const remaining = Math.max(0, tokenLimit - actualUsed);
          setTokensRemaining(remaining);

          if (remaining === 0) {
            setChatLocked(true);
          }
        }

        // Chapter mode is for paid tiers only (not free)
        if (mode === 'chapter' && tierName === 'free') {
          setChatLocked(true);
        }
      }
    } catch (error) {
    }
  };

  const refreshTokenCounts = async () => {
    if (!user) return;

    try {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('tokens_used_current_period, token_limit_override, subscription_tiers!inner(name, token_limit)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subscription) {
        const tierName = subscription.subscription_tiers?.name;
        const tierTokenLimit = subscription.subscription_tiers?.token_limit;
        const tokenLimit = (subscription as any).token_limit_override ?? tierTokenLimit;
        const actualUsed = subscription.tokens_used_current_period;

        // For non-admin users, cap displayed usage at the limit
        const isAdmin = profile?.role === 'admin';
        const displayedUsed = isAdmin ? actualUsed : (tokenLimit !== null ? Math.min(actualUsed, tokenLimit) : actualUsed);

        setTokensLimit(tokenLimit);
        setTokensUsed(displayedUsed);
        setTierName(tierName);

        if (tokenLimit !== null) {
          const remaining = Math.max(0, tokenLimit - actualUsed);
          setTokensRemaining(remaining);

          if (remaining === 0) {
            setChatLocked(true);
          }
        }
      }
    } catch (error) {
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
    }
  };

  // Fullscreen functions
  const toggleFullscreen = async () => {
    if (!containerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
    }
  };

  // Listen for fullscreen changes (e.g., user presses Esc)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handlePaperSelect = async (paper: ExamPaper) => {
    setSelectedPaper(paper);
    setPdfLoading(true);

    try {
      // Get signed URL for PDF
      const { data: signedData, error: signedUrlError } = await supabase.storage
        .from('exam-papers')
        .createSignedUrl(paper.pdf_path, 3600);

      if (signedUrlError || !signedData?.signedUrl) {
        throw new Error('Failed to get signed URL');
      }

      setPdfBlobUrl(signedData.signedUrl);
    } catch (error) {
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
        setCurrentQuestionIndex(0);
        setSelectedQuestion(formattedQuestions[0]);
      }
    } catch (error) {
      setQuestions([]);
    } finally {
      setQuestionsLoading(false);
      setLoading(false);
    }
  };

  const handleQuestionSelect = (question: Question) => {
    setSelectedQuestion(question);
    // Keep conversation and messages intact when switching questions
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      const newIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(newIndex);
      setSelectedQuestion(questions[newIndex]);
      // Keep conversation and messages intact when switching questions
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      const newIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(newIndex);
      setSelectedQuestion(questions[newIndex]);
      // Keep conversation and messages intact when switching questions
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || sending) return;

    // For chapter mode, ensure a question is selected
    if (mode === 'chapter' && !selectedQuestion) return;

    const userMessage = input.trim();
    setSending(true);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

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

        // Refresh token counts after AI response
        await refreshTokenCounts();

        // Save to conversation (chapter mode)
        if (!currentConversationId && user && chapterId) {
          // Double-check for existing conversation before creating
          const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('user_id', user.id)
            .eq('chapter_id', chapterId)
            .eq('practice_mode', 'chapter')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let convId = existingConv?.id;

          if (!convId) {
            // Create new conversation for this chapter only if none exists
            const conversationTitle = chapterInfo
              ? `Ch ${chapterInfo.chapter_number}: ${chapterInfo.chapter_title}`
              : 'Chapter Practice';

            const { data: newConv, error: convError } = await supabase
              .from('conversations')
              .insert({
                user_id: user.id,
                exam_paper_id: questionData.exam_paper_id,
                practice_mode: 'chapter',
                chapter_id: chapterId,
                title: conversationTitle
              })
              .select()
              .single();

            if (convError) {
            } else if (newConv) {
              convId = newConv.id;
            }
          }

          if (convId) {
            setCurrentConversationId(convId);

            // Save user message
            await supabase.from('conversation_messages').insert({
              conversation_id: convId,
              role: 'user',
              content: userMessage
            });

            // Save assistant message
            await supabase.from('conversation_messages').insert({
              conversation_id: convId,
              role: 'assistant',
              content: assistantMessage
            });
          }
        } else if (currentConversationId) {
          // Save messages to existing conversation
          await supabase.from('conversation_messages').insert([
            {
              conversation_id: currentConversationId,
              role: 'user',
              content: userMessage
            },
            {
              conversation_id: currentConversationId,
              role: 'assistant',
              content: assistantMessage
            }
          ]);
        }
      }
    } catch (error) {
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
    <div ref={containerRef} className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
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
              {grade?.name && subject?.name
                ? `Grade ${grade.name} - ${subject.name}`
                : mode === 'year'
                  ? 'Year Practice'
                  : 'Chapter Practice'}
            </h1>
            <p className="text-xs text-gray-500">
              {mode === 'year'
                ? selectedPaper
                  ? `${selectedPaper.title}${selectedPaper.month ? ` - ${selectedPaper.month}` : ''}${selectedPaper.year ? ` ${selectedPaper.year}` : ''}`
                  : 'Select an exam paper'
                : chapterInfo
                  ? `Chapter ${chapterInfo.chapter_number}: ${chapterInfo.chapter_title}`
                  : 'Select a chapter'}
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center">
          {/* Mobile View Toggle */}
          <div className="flex md:hidden">
            <div className="relative bg-gray-200 rounded-full p-1 flex items-center">
              <div
                className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-black rounded-full transition-transform duration-300 ease-in-out ${
                  mobileView === 'chat' ? 'translate-x-[calc(100%+8px)]' : 'translate-x-0'
                }`}
              />
              <button
                onClick={() => setMobileView('pdf')}
                className={`relative z-10 px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
                  mobileView === 'pdf' ? 'text-white' : 'text-gray-600'
                }`}
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMobileView('chat')}
                className={`relative z-10 px-4 py-1.5 text-sm font-medium transition-colors duration-300 ${
                  mobileView === 'chat' ? 'text-white' : 'text-gray-600'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fullscreen Toggle - Desktop Only */}
          <button
            onClick={toggleFullscreen}
            className="hidden md:flex p-2 hover:bg-gray-100 rounded transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5 text-gray-700" />
            ) : (
              <Maximize className="w-5 h-5 text-gray-700" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Only for Year Mode */}
        {mode === 'year' && (
          <div className="w-64 border-r border-gray-200 bg-white overflow-y-auto flex-shrink-0 hidden md:block">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Exam Papers</h3>
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
              {papers.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">
                  No exam papers available
                </p>
              )}
            </div>
          </div>
        )}

        {/* Main Content Area with Mobile Support */}
        <div className={`${mobileView === 'pdf' ? 'flex' : 'hidden md:flex'} flex-1 bg-gray-100 relative`}>
          {mode === 'year' ? (
            // Year Mode: PDF Viewer
            <>
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
            </>
          ) : (
            // Chapter Mode: Question Image Viewer with Navigation
            <>
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
                    <p className="text-gray-600">No questions available</p>
                  </div>
                </div>
              ) : (
                <div className="h-full overflow-y-auto p-6 relative">
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

                  {/* Navigation Arrows */}
                  {questions.length > 1 && (
                    <>
                      {/* Previous Button */}
                      {currentQuestionIndex > 0 && (
                        <button
                          onClick={handlePrevQuestion}
                          className="fixed left-4 top-1/2 transform -translate-y-1/2 bg-black text-white p-3 rounded-full shadow-lg hover:bg-gray-800 transition-colors z-10"
                          title="Previous Question"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                      )}

                      {/* Next Button */}
                      {currentQuestionIndex < questions.length - 1 && (
                        <button
                          onClick={handleNextQuestion}
                          className="fixed right-4 md:right-[calc(500px+1rem)] lg:right-[calc(600px+1rem)] top-1/2 transform -translate-y-1/2 bg-black text-white p-3 rounded-full shadow-lg hover:bg-gray-800 transition-colors z-10"
                          title="Next Question"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Chat Assistant */}
        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} w-full md:w-[500px] lg:w-[600px] flex-col bg-white border-l border-gray-200 h-full pb-safe`}>
            <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
              <h2 className="font-semibold text-gray-900">AI Study Assistant</h2>
              {mode === 'year' ? (
                selectedPaper ? (
                  <div className="mt-2 flex items-center space-x-2">
                    <span className="text-xs text-gray-500">Currently discussing:</span>
                    <div
                      className={`inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-full text-sm font-semibold shadow-md transition-all duration-300 ${
                        paperChangeAnimation
                          ? 'animate-[zoomInOut_0.6s_ease-in-out]'
                          : ''
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 mr-1.5" />
                      <span className="text-sm truncate max-w-[200px]">{selectedPaper.title}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">
                    Select an exam paper to start chatting
                  </p>
                )
              ) : selectedQuestion ? (
                <div className="mt-2 flex items-center space-x-2">
                  <span className="text-xs text-gray-500">Currently discussing:</span>
                  <div
                    className={`inline-flex items-center px-3 py-1.5 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-full text-sm font-semibold shadow-md transition-all duration-300 ${
                      questionChangeAnimation
                        ? 'animate-[zoomInOut_0.6s_ease-in-out]'
                        : ''
                    }`}
                  >
                    <span className="mr-1.5">Question</span>
                    <span className="text-base">{selectedQuestion.question_number}</span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 mt-1">
                  Select a question to start chatting
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
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
              <div className="px-4 pt-4 pb-20 md:pb-4 border-t border-gray-200 bg-white flex-shrink-0">
                {/* Token Display with Upgrade button */}
                {tokensLimit !== null && (
                  <div className="mb-2 flex items-center justify-between px-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-600">AI Tokens:</span>
                      <span className="text-xs font-semibold text-gray-900">
                        {formatTokenCount(tokensUsed)} / {formatTokenCount(tokensLimit)}
                      </span>
                    </div>
                    {(tierName === 'free' || tierName === 'student' || tierName === 'student_lite') && (
                      <button
                        onClick={onOpenSubscriptions || onBack}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                      >
                        Upgrade
                      </button>
                    )}
                  </div>
                )}

                {chatLocked ? (
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                    <div className="flex items-center space-x-3 mb-2">
                      <Lock className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                      <h4 className="font-semibold text-gray-900">
                        {mode === 'chapter' && tierName === 'free'
                          ? 'Practice by Chapter - Premium Feature'
                          : 'Chat Locked - Limit Reached'}
                      </h4>
                    </div>
                    <p className="text-sm text-gray-700 mb-3">
                      {mode === 'chapter' && tierName === 'free'
                        ? 'Practice by Chapter with AI assistance is available for Student and Professional tiers. Upgrade to unlock this feature!'
                        : 'You\'ve reached your chat limit for this billing period. Upgrade to continue using AI chat assistance.'}
                    </p>
                    <button
                      onClick={onOpenSubscriptions || onBack}
                      className="w-full px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                    >
                      Upgrade to Unlock Chat
                    </button>
                  </div>
                ) : (
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
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
}
