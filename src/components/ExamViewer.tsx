import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Send, Loader2, FileText, MessageSquare, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { convertPdfToBase64Images } from '../lib/pdfUtils';
import { ChatMessage } from './ChatMessage';

interface ExamPaper {
  id: string;
  title: string;
  pdf_url: string;
  pdf_path: string;
  subjects: { name: string };
  grade_levels: { name: string };
  marking_schemes: { pdf_url: string; pdf_path: string } | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  questionNumber?: string | null;
}

interface Props {
  paperId: string;
  conversationId?: string | null;
  onBack: () => void;
  onLoginRequired: () => void;
}

export function ExamViewer({ paperId, conversationId, onBack, onLoginRequired }: Props) {
  const { user } = useAuth();
  const [examPaper, setExamPaper] = useState<ExamPaper | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(true);
  const [examPaperImages, setExamPaperImages] = useState<string[]>([]);
  const [markingSchemeImages, setMarkingSchemeImages] = useState<string[]>([]);
  const [processingPdfs, setProcessingPdfs] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingMessageIndex, setStreamingMessageIndex] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<'pdf' | 'chat'>('pdf');
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId || null);
  const [isMobile, setIsMobile] = useState(false);
  const [lastQuestionNumber, setLastQuestionNumber] = useState<string | null>(null); // 🔹 NEW: Track last question
  const [imageCache, setImageCache] = useState<Map<string, { exam: string[], markingSchemeText: string, questionText: string }>>(new Map()); // 🔹 NEW: Cache images
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchExamPaper();

    const checkMobile = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [paperId]);

  useEffect(() => {
    if (user && paperId) {
      if (conversationId) {
        loadConversation(conversationId);
      } else {
        checkForExistingConversation();
      }
    }
  }, [conversationId, user, paperId]);

  const checkForExistingConversation = async () => {
    if (!user || !paperId) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_id', user.id)
        .eq('exam_paper_id', paperId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        console.log('Existing conversation found, loading...');
        setCurrentConversationId(data.id);
        loadConversation(data.id);
      } else {
        console.log('No existing conversation for this paper');
      }
    } catch (error) {
      console.error('Error checking for existing conversation:', error);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (examPaper?.pdf_path && isMobile !== null) {
      loadPdfBlob();
    }
  }, [examPaper, isMobile]);

  // 🔹 NEW: Generate contextual clarification message
  const generateClarificationMessage = (userInput: string) => {
    const lowerInput = userInput.toLowerCase();
    
    // Check if student is asking vague questions
    if (lowerInput.includes('help') || lowerInput.includes('stuck') || lowerInput.includes('don\'t understand')) {
      return `Hey! I can see you need help. To give you the best explanation, could you tell me which specific question you're working on?

Just say something like:
- "Question 2"
- "Help with Q5b"
- "I'm stuck on question 3"

Once I know which question, I can walk you through it step by step! 😊`;
    }
    
    if (lowerInput.includes('explain') || lowerInput.includes('how') || lowerInput.includes('what')) {
      return `I'd be happy to explain! But first, which question are you asking about?

You can say:
- "Question 4"
- "Q2a"
- "Explain question 7"

This helps me focus on exactly what you need! 📚`;
    }
    
    if (lowerInput.includes('solve') || lowerInput.includes('answer') || lowerInput.includes('solution')) {
      return `Sure, I can help you solve that! Which question number are you working on?

Just tell me like:
- "Question 3"
- "Solve Q6"
- "What's the answer to question 1?"

Let me know and I'll guide you through it! ✨`;
    }
    
    // Default clarification
    return `Hey! I'd love to help you with that. Could you please specify which question you're asking about? 

For example, you can say:
- "Question 2"
- "Q3b"
- "Can you help with question 5?"

This helps me give you the most accurate and focused help! 😊`;
  };

  const extractQuestionNumber = (text: string): string | null => {
    if (!text) return null;
    
    const normalized = text.toLowerCase().trim();
    
    const pattern1 = normalized.match(/(?:question|q)\s*(\d+)[a-z]*/i);
    if (pattern1) return pattern1[1];
    
    const pattern2 = normalized.match(/^(\d+)[a-z]*/);
    if (pattern2) return pattern2[1];
    
    return null;
  };

  const loadPdfBlob = async () => {
    if (!examPaper) return;

    try {
      setPdfLoading(true);
      setProcessingPdfs(true);

      if (isMobile) {
        // For mobile, use public URL directly without downloading
        const { data: { publicUrl } } = supabase.storage
          .from('exam-papers')
          .getPublicUrl(examPaper.pdf_path);
        
        if (publicUrl) {
          setPdfBlobUrl(publicUrl);
        } else {
          throw new Error('Failed to get public URL');
        }
      } else {
        // For desktop, download and create blob URL
        const { data, error } = await supabase.storage
          .from('exam-papers')
          .download(examPaper.pdf_path);

        if (error) throw error;

        const pdfBlob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(pdfBlob);
        setPdfBlobUrl(url);
      }

      // Process PDFs for AI after setting the blob URL
      const { data, error } = await supabase.storage
        .from('exam-papers')
        .download(examPaper.pdf_path);

      if (error) throw error;

      const pdfBlob = new Blob([data], { type: 'application/pdf' });

      const examFile = new File([pdfBlob], 'exam.pdf', { type: 'application/pdf' });
      const examImages = await convertPdfToBase64Images(examFile);
      setExamPaperImages(examImages.map(img => img.inlineData.data));

      if (examPaper.marking_schemes?.pdf_path) {
        try {
          const { data: schemeData } = await supabase.storage
            .from('marking-schemes')
            .download(examPaper.marking_schemes.pdf_path);

          if (schemeData) {
            const schemeBlob = new Blob([schemeData], { type: 'application/pdf' });
            const schemeFile = new File([schemeBlob], 'scheme.pdf', { type: 'application/pdf' });
            const schemeImages = await convertPdfToBase64Images(schemeFile);
            setMarkingSchemeImages(schemeImages.map(img => img.inlineData.data));
          }
        } catch (schemeError) {
          console.error('Error loading marking scheme:', schemeError);
        }
      }
    } catch (error) {
      console.error('Error loading PDF:', error);
      const { data: { publicUrl } } = supabase.storage
        .from('exam-papers')
        .getPublicUrl(examPaper.pdf_path);
      setPdfBlobUrl(publicUrl || examPaper.pdf_url);
    } finally {
      setPdfLoading(false);
      setProcessingPdfs(false);
    }
  };

  const fetchExamPaper = async () => {
    try {
      const { data, error } = await supabase
        .from('exam_papers')
        .select(`
          *,
          subjects (name),
          grade_levels (name),
          marking_schemes (pdf_url, pdf_path)
        `)
        .eq('id', paperId)
        .single();

      if (error) throw error;
      setExamPaper(data);
    } catch (error) {
      console.error('Error fetching exam paper:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadConversation = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from('conversation_messages')
        .select('role, content, question_number, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const loadedMessages = data.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        questionNumber: msg.question_number
      }));

      // Check if conversation is from a previous day
      if (loadedMessages.length > 0) {
        const lastMessageTime = new Date(data[data.length - 1].created_at);
        const today = new Date();
        const isNewDay = lastMessageTime.toDateString() !== today.toDateString();

        if (isNewDay) {
          const welcomeBackMessage = {
            role: 'assistant' as const,
            content: `Welcome back! 👋\n\nI see you're continuing your work on this exam paper. Feel free to ask about any question you'd like to work on today!\n\nJust say something like:\n- "Question 3"\n- "Help with Q7"\n- "Let's do question 5"\n\nReady when you are!`,
            questionNumber: null
          };
          setMessages([...loadedMessages, welcomeBackMessage]);
        } else {
          setMessages(loadedMessages);
        }
      } else {
        setMessages(loadedMessages);
      }

      setCurrentConversationId(convId);

      // Set last question from loaded conversation
      const lastMsg = loadedMessages.reverse().find(m => m.questionNumber);
      if (lastMsg?.questionNumber) {
        setLastQuestionNumber(lastMsg.questionNumber);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const saveMessageToConversation = async (
    userMessage: string,
    assistantMessage: string,
    questionNumber: string | null
  ) => {
    if (!user) return;

    try {
      let convId = currentConversationId;

      if (!convId) {
        // Check for existing conversation first
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('user_id', user.id)
          .eq('exam_paper_id', paperId)
          .maybeSingle();

        if (existingConv) {
          convId = existingConv.id;
          setCurrentConversationId(convId);
        } else {
          // Create new conversation only if none exists
          const title = examPaper?.title || userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '');

          const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert({
              user_id: user.id,
              exam_paper_id: paperId,
              title: title
            })
            .select()
            .single();

          if (convError) throw convError;
          convId = newConv.id;
          setCurrentConversationId(convId);
        }
      }

      // 🔹 NEW: Save with question_number and has_images metadata
      const { error: msgError } = await supabase
        .from('conversation_messages')
        .insert([
          {
            conversation_id: convId,
            role: 'user',
            content: userMessage,
            question_number: questionNumber,
            has_images: false
          },
          {
            conversation_id: convId,
            role: 'assistant',
            content: assistantMessage,
            question_number: questionNumber,
            has_images: false
          }
        ]);

      if (msgError) throw msgError;
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  };

  // 🔹 NEW: Fetch and cache question images
  const fetchQuestionData = async (questionNumber: string) => {
    // Check cache first
    if (imageCache.has(questionNumber)) {
      console.log(`📦 Using cached data for Question ${questionNumber}`);
      return imageCache.get(questionNumber)!;
    }

    console.log(`🔍 Fetching data for Question ${questionNumber}`);

    const { data: questionData, error: questionError } = await supabase
      .from('exam_questions')
      .select('id, question_number, ocr_text, image_url, image_urls, page_numbers, marking_scheme_text')
      .eq('exam_paper_id', examPaper!.id)
      .eq('question_number', questionNumber)
      .maybeSingle();

    if (!questionData || questionError) {
      return null;
    }

    const imageUrls = questionData.image_urls && questionData.image_urls.length > 0
      ? questionData.image_urls
      : [questionData.image_url];

    const base64Images: string[] = [];

    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
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
        console.error(`Failed to load image ${i + 1}:`, error);
      }
    }

    const result = {
      exam: base64Images,
      markingSchemeText: questionData.marking_scheme_text || '',
      questionText: questionData.ocr_text || ''
    };

    // Cache the data
    setImageCache(prev => new Map(prev).set(questionNumber, result));
    console.log(`💾 Cached data for Question ${questionNumber}`);
    console.log(`📝 Marking scheme text available: ${!!result.markingSchemeText}`);

    return result;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || sending || !examPaper) return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setSending(true);

    try {
      const questionNumber = extractQuestionNumber(userMessage);
      
      console.log('Original input:', userMessage);
      console.log('Extracted question number:', questionNumber);
      console.log('Last question number:', lastQuestionNumber);
      
      // 🔹 NEW: Check if this is a follow-up on the same question
      const isFollowUp = questionNumber && lastQuestionNumber && questionNumber === lastQuestionNumber;
      
      let requestBody: any = {
        question: userMessage,
        provider: 'gemini',
        examPaperId: examPaper.id,
        conversationId: currentConversationId,
        userId: user?.id,
        lastQuestionNumber: lastQuestionNumber, // Send last question for context
      };

      if (isFollowUp) {
        // 🔹 FOLLOW-UP: Don't send images, use conversation history
        console.log(`💬 Follow-up question detected - using conversation context (no images sent)`);
        requestBody.optimizedMode = true;
        requestBody.questionNumber = questionNumber;
        requestBody.examPaperImages = []; // Empty - backend will use history
        requestBody.markingSchemeImages = [];
      } else if (questionNumber) {
        // 🔹 NEW QUESTION: Fetch data (from cache if available)
        const questionData = await fetchQuestionData(questionNumber);

        if (questionData && questionData.exam.length > 0) {
          console.log(`✅ Question ${questionNumber} found`);
          console.log(`   - Exam images: ${questionData.exam.length}`);
          console.log(`   - Marking scheme: TEXT (not images)`);
          console.log(`💰 Cost optimization: Using text instead of marking scheme images`);

          requestBody.optimizedMode = true;
          requestBody.questionNumber = questionNumber;
          requestBody.examPaperImages = questionData.exam;
          requestBody.markingSchemeText = questionData.markingSchemeText;
          requestBody.questionText = questionData.questionText;

          // Update last question number
          setLastQuestionNumber(questionNumber);
        } else {
          console.log(`❌ Question ${questionNumber} not found in database, using fallback mode`);
          requestBody.optimizedMode = false;
          requestBody.examPaperImages = examPaperImages;
          requestBody.markingSchemeImages = markingSchemeImages;
        }
      } else {
        // 🔹 NO QUESTION NUMBER: Use last question if available, otherwise ask for clarification
        console.log('⚠️ No question number detected');

        if (lastQuestionNumber) {
          // User is continuing with the same question
          console.log(`✅ Assuming continuation of Question ${lastQuestionNumber}`);

          const questionData = await fetchQuestionData(lastQuestionNumber);

          if (questionData && questionData.exam.length > 0) {
            requestBody.optimizedMode = true;
            requestBody.questionNumber = lastQuestionNumber;
            requestBody.examPaperImages = questionData.exam;
            requestBody.markingSchemeText = questionData.markingSchemeText;
            requestBody.questionText = questionData.questionText;
            console.log(`💬 Continuing conversation for Question ${lastQuestionNumber}`);
          } else {
            console.log(`❌ Question ${lastQuestionNumber} data not found`);
            requestBody.optimizedMode = false;
            requestBody.examPaperImages = examPaperImages;
            requestBody.markingSchemeImages = markingSchemeImages;
          }
        } else if (messages.length === 1) {
          // First message in a brand new conversation - ask if they mean Question 1
          console.log('🆕 First message in new conversation - asking if they mean Question 1');

          const firstQuestionConfirm = `Hey there! 👋\n\nI'd love to help you with that! Since this is your first question, are you asking about **Question 1**?\n\nIf yes, just type "yes" or "Question 1".\nIf you meant a different question, just tell me the question number like:\n- "Question 2"\n- "Q5"\n- "No, question 3"\n\nLet me know! 😊`;

          setMessages((prev) => {
            const newMessages = [...prev, {
              role: 'assistant',
              content: firstQuestionConfirm,
              questionNumber: null
            }];
            return newMessages;
          });

          setSending(false);
          return;
        } else {
          // Not the first message but no lastQuestionNumber - ask for clarification
          console.log('❓ Asking student for clarification');

          const clarificationMessage = generateClarificationMessage(userMessage);

          setMessages((prev) => {
            const newMessages = [...prev, {
              role: 'assistant',
              content: clarificationMessage,
              questionNumber: null
            }];
            return newMessages;
          });

          setSending(false);
          return;
        }
      }

      /* 🔹 COMMENTED OUT: Full PDF validation check
      if (!requestBody.optimizedMode && examPaperImages.length === 0) {
        alert('Please wait for the exam paper to finish processing.');
        setSending(false);
        return;
      }
      */

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
      
      if (data.questionNotFound) {
        console.log('⚠️ Question does not exist in exam paper');
        setMessages((prev) => {
          const newMessages = [...prev, { 
            role: 'assistant', 
            content: data.answer,
            questionNumber: questionNumber 
          }];
          return newMessages;
        });
        setSending(false);
        return;
      }

      const assistantMessage = data.answer;

      // 🔹 Log savings
      if (data.isFollowUp) {
        console.log(`💰 FOLLOW-UP: Saved 100% of image costs (0 images sent, used conversation history)`);
      } else if (requestBody.optimizedMode) {
        const totalPossible = examPaperImages.length + markingSchemeImages.length;
        const examImagesSent = requestBody.examPaperImages?.length || 0;
        const markingSchemeImagesSaved = markingSchemeImages.length;
        const usedText = requestBody.markingSchemeText ? true : false;

        console.log(`✅ OPTIMIZED MODE:`);
        console.log(`   - Exam images sent: ${examImagesSent} (only for this question)`);
        console.log(`   - Marking scheme: ${usedText ? 'TEXT (0 images)' : 'No marking scheme'}`);
        console.log(`   - Total images saved: ${totalPossible - examImagesSent} out of ${totalPossible}`);

        const savings = Math.round(((totalPossible - examImagesSent) / totalPossible) * 100);
        console.log(`💰 Cost savings: approximately ${savings}%`);
      } else {
        console.log(`⚠️ Used full PDF fallback mode (${examPaperImages.length + markingSchemeImages.length} images)`);
      }

      setMessages((prev) => {
        const newMessages = [...prev, { 
          role: 'assistant', 
          content: assistantMessage,
          questionNumber: questionNumber 
        }];
        setStreamingMessageIndex(newMessages.length - 1);
        return newMessages;
      });

      setTimeout(() => {
        setStreamingMessageIndex(null);
      }, (assistantMessage.length / 3) * 15 + 200);

      await saveMessageToConversation(userMessage, assistantMessage, questionNumber);
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
        <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
      </div>
    );
  }

  if (!examPaper) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Exam paper not found</p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">{examPaper.title}</h1>
            <p className="text-xs text-gray-500">
              {examPaper.grade_levels.name} - {examPaper.subjects.name}
            </p>
          </div>
        </div>

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
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className={`${mobileView === 'pdf' ? 'flex' : 'hidden md:flex'} flex-1 bg-gray-100 relative`}>
          {pdfLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Loading PDF...</p>
              </div>
            </div>
          ) : pdfBlobUrl ? (
            isMobile ? (
              <iframe
                src={pdfBlobUrl}
                className="w-full h-full border-0"
                title="Exam Paper"
                allow="fullscreen"
              />
            ) : (
              <iframe
                src={pdfBlobUrl}
                className="w-full h-full border-0"
                title="Exam Paper"
                allow="fullscreen"
              />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md p-6">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">Unable to load PDF viewer.</p>
                <a
                  href={examPaper.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors"
                >
                  Open PDF in New Tab
                </a>
              </div>
            </div>
          )}
        </div>

        <div className={`${mobileView === 'chat' ? 'flex' : 'hidden md:flex'} w-full md:w-[500px] lg:w-[600px] flex-col bg-white border-l border-gray-200 h-full pb-safe`}>
          <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
            <h2 className="font-semibold text-gray-900">AI Study Assistant</h2>
            <p className="text-xs text-gray-500 mt-1">
              {processingPdfs ? (
                <span className="flex items-center">
                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                  Processing PDFs for AI analysis...
                </span>
              ) : lastQuestionNumber ? (
                `Currently discussing Question ${lastQuestionNumber}`
              ) : (
                "Ask your question in this format: Question 1"
              )}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
            {!user ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-sm">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
                    <Lock className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Sign In Required</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Sign in to chat with the AI tutor and get help with your exam questions.
                  </p>
                  <button
                    onClick={onLoginRequired}
                    className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    Sign In or Sign Up
                  </button>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center max-w-sm px-6">
                  <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Welcome to Your AI Study Assistant!</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    I'm here to help you understand and solve questions from this exam paper.
                  </p>
                  <div className="bg-gray-50 rounded-lg p-4 text-left">
                    <p className="text-xs font-medium text-gray-700 mb-2">To get started, tell me which question you'd like help with:</p>
                    <ul className="text-xs text-gray-600 space-y-1">
                      <li>• "Question 2"</li>
                      <li>• "Help with Q5"</li>
                      <li>• "Explain question 3b"</li>
                    </ul>
                  </div>
                  <p className="text-xs text-gray-500 mt-4">
                    I'll guide you through step-by-step solutions and exam tips!
                  </p>
                </div>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <ChatMessage
                key={index}
                role={message.role}
                content={message.content}
                isStreaming={index === streamingMessageIndex}
                onStreamUpdate={scrollToBottom}
              />
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 rounded-lg px-4 py-2.5">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {user && (
            <div className="px-4 pt-4 pb-20 md:pb-4 border-t border-gray-200 bg-white flex-shrink-0">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question..."
                  disabled={sending}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded text-gray-900 placeholder-gray-400 focus:outline-none focus:border-black transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
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
  );
}