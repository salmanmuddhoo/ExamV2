import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Send, Loader2, FileText, MessageSquare, Lock, Maximize, Minimize, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useFirstTimeHints } from '../contexts/FirstTimeHintsContext';
import { convertPdfToBase64Images } from '../lib/pdfUtils';
import { ChatMessage } from './ChatMessage';
import { formatTokenCount } from '../lib/formatUtils';
import { ContextualHint } from './ContextualHint';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface ExamPaper {
  id: string;
  title: string;
  pdf_url: string;
  pdf_path: string;
  year: number;
  month: number | null;
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
  onOpenSubscriptions?: () => void;
}

export function ExamViewer({ paperId, conversationId, onBack, onLoginRequired, onOpenSubscriptions }: Props) {
  const { user } = useAuth();
  const { shouldShowHint, markHintAsSeen } = useFirstTimeHints();
  const [examPaper, setExamPaper] = useState<ExamPaper | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfLoadProgress, setPdfLoadProgress] = useState(0);
  const [examPaperImages, setExamPaperImages] = useState<string[]>([]);
  const [markingSchemeImages, setMarkingSchemeImages] = useState<string[]>([]);
  const [processingPdfs, setProcessingPdfs] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingMessageIndex, setStreamingMessageIndex] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<'pdf' | 'chat'>(() => {
    const saved = sessionStorage.getItem('examViewerMobileView');
    return (saved as 'pdf' | 'chat') || 'pdf';
  });
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(conversationId || null);
  const [isMobile, setIsMobile] = useState(false);
  const [pdfLoadError, setPdfLoadError] = useState(false);
  const [lastQuestionNumber, setLastQuestionNumber] = useState<string | null>(null); // 🔹 NEW: Track last question
  const [imageCache, setImageCache] = useState<Map<string, { exam: string[], markingSchemeText: string, questionText: string }>>(new Map()); // 🔹 NEW: Cache images
  const [paperAccessDenied, setPaperAccessDenied] = useState(false);
  const [papersRemaining, setPapersRemaining] = useState<number>(-1); // -1 = unlimited
  const [chatLocked, setChatLocked] = useState(false);
  const [tokensRemaining, setTokensRemaining] = useState<number>(-1); // -1 = unlimited
  const [tierName, setTierName] = useState<string>('');
  const [aiProcessingStatus, setAiProcessingStatus] = useState<string>('');
  const [tokensLimit, setTokensLimit] = useState<number | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Question change animation state
  const [questionChangeAnimation, setQuestionChangeAnimation] = useState(false);
  const prevQuestionNumberRef = useRef<string | null>(null);

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

  // Persist mobile view state
  useEffect(() => {
    sessionStorage.setItem('examViewerMobileView', mobileView);
  }, [mobileView]);

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
        setCurrentConversationId(data.id);
        loadConversation(data.id);
      } else {
      }
    } catch (error) {
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

  // Trigger animation when detected question number changes
  useEffect(() => {
    if (lastQuestionNumber) {
      // Only animate if the question actually changed (not on initial detection)
      if (prevQuestionNumberRef.current !== null && prevQuestionNumberRef.current !== lastQuestionNumber) {
        setQuestionChangeAnimation(true);

        // Remove animation class after animation completes
        const timer = setTimeout(() => {
          setQuestionChangeAnimation(false);
        }, 600); // Match animation duration

        return () => clearTimeout(timer);
      }

      prevQuestionNumberRef.current = lastQuestionNumber;
    }
  }, [lastQuestionNumber]);

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

  const downloadWithProgress = async (url: string): Promise<Blob> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Download failed');

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!response.body) throw new Error('No response body');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      chunks.push(value);
      loaded += value.length;

      if (total > 0) {
        const progress = Math.round((loaded / total) * 100);
        setPdfLoadProgress(progress);
      }
    }

    const allChunks = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      allChunks.set(chunk, position);
      position += chunk.length;
    }

    return new Blob([allChunks], { type: 'application/pdf' });
  };

  const loadPdfBlob = async () => {
    if (!examPaper) return;

    try {
      setPdfLoading(true);
      setProcessingPdfs(true);
      setPdfLoadError(false); // Reset error state
      setPdfLoadProgress(0);

      if (isMobile) {
        // For mobile, use signed URL directly (mobile browsers have issues with blob URLs in iframes)
        const { data: signedData, error: signedUrlError } = await supabase.storage
          .from('exam-papers')
          .createSignedUrl(examPaper.pdf_path, 3600); // Valid for 1 hour

        if (signedUrlError || !signedData?.signedUrl) {
          throw new Error('Failed to get signed URL');
        }

        // Simulate progress for better UX
        for (let i = 0; i <= 100; i += 10) {
          setPdfLoadProgress(i);
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Use signed URL directly for mobile
        setPdfBlobUrl(signedData.signedUrl);
      } else {
        // For desktop, download with progress tracking and use blob URL
        const { data: signedData, error: signedUrlError } = await supabase.storage
          .from('exam-papers')
          .createSignedUrl(examPaper.pdf_path, 3600);

        if (signedUrlError || !signedData?.signedUrl) {
          throw new Error('Failed to get signed URL');
        }

        const pdfBlob = await downloadWithProgress(signedData.signedUrl);
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
        }
      }
    } catch (error) {
      const { data: { publicUrl } } = supabase.storage
        .from('exam-papers')
        .getPublicUrl(examPaper.pdf_path);
      setPdfBlobUrl(publicUrl || examPaper.pdf_url);
    } finally {
      setPdfLoading(false);
      setProcessingPdfs(false);
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

  const fetchExamPaper = async () => {
    try {
      // Fetch exam paper first - all users can VIEW any paper
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

      // Check chat access limits for free tier users
      if (user) {
        const { data: accessCheck, error: accessError } = await supabase
          .rpc('check_user_subscription_access', {
            p_user_id: user.id,
            p_feature: 'paper_access'
          });

        if (accessError) {
        } else if (accessCheck && accessCheck.length > 0) {
          const access = accessCheck[0];
          setPapersRemaining(access.papers_remaining);

          // Check chat access for free tier (check both token and paper limits)
          if (access.tier_name === 'free') {
            const { data: subscription } = await supabase
              .from('user_subscriptions')
              .select('accessed_paper_ids, papers_accessed_current_period, tokens_used_current_period, token_limit_override, subscription_tiers!inner(papers_limit, token_limit)')
              .eq('user_id', user.id)
              .eq('status', 'active')
              .single();

            if (subscription) {
              const alreadyAccessed = subscription.accessed_paper_ids.includes(paperId);
              const papersLimit = subscription.subscription_tiers?.papers_limit || 2;
              const tierTokenLimit = subscription.subscription_tiers?.token_limit || 50000;
              const tokenLimit = (subscription as any).token_limit_override ?? tierTokenLimit;

              let shouldLockChat = false;
              let lockReason = '';

              // Check token limit first
              if (subscription.tokens_used_current_period >= tokenLimit) {
                shouldLockChat = true;
                lockReason = 'token_limit';
              }
              // Then check paper limit (only if this paper hasn't been accessed yet)
              else if (subscription.papers_accessed_current_period >= papersLimit && !alreadyAccessed) {
                shouldLockChat = true;
                lockReason = 'paper_limit';
              }
              else {
              }

              setChatLocked(shouldLockChat);

              // Set display values (ensure non-negative)
              setPapersRemaining(Math.max(0, papersLimit - subscription.papers_accessed_current_period));
              setTokensRemaining(Math.max(0, tokenLimit - subscription.tokens_used_current_period));
              setTierName('free');
            }
          } else {
            // For paid tiers, also get token info (ensure non-negative)
            setTierName(access.tier_name);
            setTokensRemaining(Math.max(0, access.tokens_remaining));

            // Lock chat if no tokens remaining for paid tiers with limits
            if (access.tokens_remaining !== null && access.tokens_remaining <= 0) {
              setChatLocked(true);
            }

            // For student/student_lite tiers, check grade/subject restrictions
            if (access.tier_name === 'student' || access.tier_name === 'student_lite') {
              const { data: canUseChat, error: chatAccessError } = await supabase
                .rpc('can_user_use_chat_for_paper', {
                  p_user_id: user.id,
                  p_paper_id: paperId
                });

              if (chatAccessError) {
              } else if (canUseChat === false) {
                setChatLocked(true);
              } else {
              }
            }
          }
        }
      }
    } catch (error) {
    } finally {
      setLoading(false);
      // Load token counts for display
      if (user) {
        refreshTokenCounts();
      }
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

      const loadedMessages = data.map((msg, index) => ({
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
      const lastMsg = [...loadedMessages].reverse().find(m => m.questionNumber);
      if (lastMsg?.questionNumber) {
        setLastQuestionNumber(lastMsg.questionNumber);
      }

      // Scroll to bottom after loading messages
      setTimeout(() => scrollToBottom(), 100);
    } catch (error) {
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

      // Insert user message first
      const { error: userMsgError } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: convId,
          role: 'user',
          content: userMessage,
          question_number: questionNumber,
          has_images: false
        });

      if (userMsgError) throw userMsgError;

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Then insert assistant message
      const { error: assistantMsgError } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: convId,
          role: 'assistant',
          content: assistantMessage,
          question_number: questionNumber,
          has_images: false
        });

      if (assistantMsgError) throw assistantMsgError;
    } catch (error) {
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  // 🔹 NEW: Refresh token and paper counts in real-time
  const refreshTokenCounts = async () => {
    if (!user) return;

    try {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('tokens_used_current_period, token_limit_override, papers_accessed_current_period, subscription_tiers!inner(name, token_limit, papers_limit)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subscription) {
        const tierName = subscription.subscription_tiers?.name;
        const tierTokenLimit = subscription.subscription_tiers?.token_limit;
        const tokenLimit = (subscription as any).token_limit_override ?? tierTokenLimit;
        const papersLimit = subscription.subscription_tiers?.papers_limit;
        const actualUsed = subscription.tokens_used_current_period;

        // For regular users, cap displayed usage at the limit
        const displayedUsed = tokenLimit !== null ? Math.min(actualUsed, tokenLimit) : actualUsed;

        // Set token limit and used for display
        setTokensLimit(tokenLimit);
        setTokensUsed(displayedUsed);

        // Update token count
        if (tokenLimit !== null) {
          const remaining = Math.max(0, tokenLimit - actualUsed);
          setTokensRemaining(remaining);

          // Lock chat if tokens depleted
          if (remaining === 0) {
            setChatLocked(true);
          }
        }

        // Update paper count (free tier only)
        if (tierName === 'free' && papersLimit !== null) {
          const remaining = Math.max(0, papersLimit - subscription.papers_accessed_current_period);
          setPapersRemaining(remaining);
        }

        setTierName(tierName);
      }
    } catch (error) {
    }
  };

  // 🔹 NEW: Fetch and cache question images
  const fetchQuestionData = async (questionNumber: string) => {
    // Check cache first
    if (imageCache.has(questionNumber)) {
      return imageCache.get(questionNumber)!;
    }


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
      }
    }

    const result = {
      exam: base64Images,
      markingSchemeText: questionData.marking_scheme_text || '',
      questionText: questionData.ocr_text || ''
    };

    // Cache the data
    setImageCache(prev => new Map(prev).set(questionNumber, result));

    return result;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || sending || !examPaper) return;

    // Check if user has chat access for this paper (token + paper limit + student package restrictions)
    if (user) {
      // First check if user can use chat with this paper (student package grade/subject restrictions)
      const { data: canUseChat, error: accessError } = await supabase
        .rpc('can_user_use_chat_for_paper', {
          p_user_id: user.id,
          p_paper_id: paperId
        });

      if (accessError) {
      } else if (canUseChat === false) {
        // User cannot use chat with this paper - show restriction message
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: `🔒 **Chat Access Restricted**

This exam paper is not included in your current subscription package.

**To use AI chat with this paper:**
- Upgrade to **Professional Package** ($25/month) - Chat with all papers
- Or modify your **Student Package** to include this grade and subject

You can still view and download this exam paper!`
        }]);
        if (onOpenSubscriptions) {
          setTimeout(() => onOpenSubscriptions(), 2000); // Show subscription modal after 2 seconds
        }
        return;
      }

      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('accessed_paper_ids, papers_accessed_current_period, tokens_used_current_period, token_limit_override, subscription_tiers!inner(name, papers_limit, token_limit)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (subscription) {
        const tierName = subscription.subscription_tiers?.name;
        const papersLimit = subscription.subscription_tiers?.papers_limit;
        const tierTokenLimit = subscription.subscription_tiers?.token_limit;
        const tokenLimit = (subscription as any).token_limit_override ?? tierTokenLimit;
        const alreadyAccessed = subscription.accessed_paper_ids.includes(paperId);

        // Check token limit first (for all tiers with limits)
        if (tokenLimit !== null && subscription.tokens_used_current_period >= tokenLimit) {
          setMessages((prev) => [...prev, {
            role: 'assistant',
            content: `🔒 **Token Limit Reached**

You've used all ${formatTokenCount(tokenLimit)} tokens for this month.

**To continue using AI chat:**
- Upgrade to **Student Package** ($15/month) - Get more tokens
- Upgrade to **Professional Package** ($25/month) - Unlimited tokens

Your tokens will reset at the start of next month.`
          }]);
          return;
        }

        // Check paper limit (for tiers with paper limits, like free tier)
        if (tierName === 'free' && papersLimit !== null && !alreadyAccessed) {
          if (subscription.papers_accessed_current_period >= papersLimit) {
            // Limit reached and this is a new paper - block chat
            setMessages((prev) => [...prev, {
              role: 'assistant',
              content: `🔒 **Paper Limit Reached**

You can view this exam paper, but you've used AI chat on ${papersLimit} papers already (your free tier limit).

You still have **${tokenLimit ? formatTokenCount(tokenLimit - subscription.tokens_used_current_period) : 0} tokens** remaining, but they can only be used on the ${papersLimit} papers you've already chatted with.

**To unlock AI chat for more papers:**
- Upgrade to **Student Package** ($15/month) - Chat with unlimited papers
- Upgrade to **Professional Package** ($25/month) - Unlimited everything

You can still view and download this exam paper!`
            }]);
            return;
          }
        }

        // Track this paper usage if it's the first message on this paper (free tier only)
        if (tierName === 'free' && !alreadyAccessed) {
          const newAccessedIds = [...subscription.accessed_paper_ids, paperId];
          const { error: updateError } = await supabase
            .from('user_subscriptions')
            .update({
              papers_accessed_current_period: subscription.papers_accessed_current_period + 1,
              accessed_paper_ids: newAccessedIds
            })
            .eq('user_id', user.id)
            .eq('status', 'active');

          if (updateError) {
          } else {
            const newCount = subscription.papers_accessed_current_period + 1;
            // Update local state immediately
            setPapersRemaining((papersLimit || 2) - newCount);
          }
        }
      }
    }

    const userMessage = input.trim();
    setSending(true);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setAiProcessingStatus('Reading your question...');

    try {
      const questionNumber = extractQuestionNumber(userMessage);


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
        // 🔹 FOLLOW-UP: Still send images in case backend cache is empty
        // Backend will decide whether to use images or cached history
        setAiProcessingStatus('Analyzing your follow-up question...');

        const questionData = await fetchQuestionData(questionNumber);

        if (questionData && questionData.exam.length > 0) {
          requestBody.optimizedMode = true;
          requestBody.questionNumber = questionNumber;
          requestBody.examPaperImages = questionData.exam; // Send images - backend uses only if no cache
          requestBody.markingSchemeText = questionData.markingSchemeText;
          requestBody.questionText = questionData.questionText;
        } else {
          requestBody.optimizedMode = false;
          requestBody.questionNumber = questionNumber;
          requestBody.examPaperImages = examPaperImages;
          requestBody.markingSchemeImages = markingSchemeImages;
        }
      } else if (questionNumber) {
        // 🔹 NEW QUESTION: Fetch data (from cache if available)
        setAiProcessingStatus(`Reading Question ${questionNumber} from exam paper...`);
        const questionData = await fetchQuestionData(questionNumber);

        if (questionData && questionData.exam.length > 0) {

          setAiProcessingStatus(`Analyzing Question ${questionNumber}...`);
          requestBody.optimizedMode = true;
          requestBody.questionNumber = questionNumber;
          requestBody.examPaperImages = questionData.exam;
          requestBody.markingSchemeText = questionData.markingSchemeText;
          requestBody.questionText = questionData.questionText;

          // Update last question number
          setLastQuestionNumber(questionNumber);
        } else {
          setAiProcessingStatus(`Analyzing Question ${questionNumber}...`);
          requestBody.optimizedMode = false;
          requestBody.examPaperImages = examPaperImages;
          requestBody.markingSchemeImages = markingSchemeImages;
        }
      } else {
        // 🔹 NO QUESTION NUMBER: Use last question if available, otherwise ask for clarification

        if (lastQuestionNumber) {
          // User is continuing with the same question

          const questionData = await fetchQuestionData(lastQuestionNumber);

          if (questionData && questionData.exam.length > 0) {
            requestBody.optimizedMode = true;
            requestBody.questionNumber = lastQuestionNumber;
            requestBody.examPaperImages = questionData.exam;
            requestBody.markingSchemeText = questionData.markingSchemeText;
            requestBody.questionText = questionData.questionText;
          } else {
            requestBody.optimizedMode = false;
            requestBody.examPaperImages = examPaperImages;
            requestBody.markingSchemeImages = markingSchemeImages;
          }
        } else if (messages.length === 1) {
          // First message in a brand new conversation - ask if they mean Question 1

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

      setAiProcessingStatus('Sending to AI assistant...');
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

      setAiProcessingStatus('AI is analyzing and preparing response...');

      if (!response.ok) {
        throw new Error('Failed to get response from AI');
      }

      const data = await response.json();
      
      if (data.questionNotFound) {
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
      } else if (requestBody.optimizedMode) {
        const totalPossible = examPaperImages.length + markingSchemeImages.length;
        const examImagesSent = requestBody.examPaperImages?.length || 0;
        const markingSchemeImagesSaved = markingSchemeImages.length;
        const usedText = requestBody.markingSchemeText ? true : false;


        const savings = Math.round(((totalPossible - examImagesSent) / totalPossible) * 100);
      } else {
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

      // 🔹 NEW: Refresh token/paper counts immediately after AI response
      await refreshTokenCounts();
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
      setAiProcessingStatus('');
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
    <div ref={containerRef} className="h-screen flex flex-col bg-gray-50 overflow-hidden fixed inset-0">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="font-semibold text-gray-900">
              Grade {examPaper.grade_levels.name} - {examPaper.subjects.name}
            </h1>
            <p className="text-xs text-gray-500">
              {examPaper.title} - Yr {examPaper.year}{examPaper.month ? ` ${MONTHS[examPaper.month - 1]}` : ''}
            </p>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center">
          {/* Mobile View Toggle */}
          <div className="flex md:hidden relative">
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
            <ContextualHint
              show={shouldShowHint('mobileToggle') && isMobile && !pdfLoading}
              onDismiss={() => markHintAsSeen('mobileToggle')}
              title="Switch Views"
              message="Toggle between exam paper and chat assistant. View the paper on the left, chat on the right!"
              position="bottom"
              arrowAlign="right"
              delay={1500}
            />
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
        <div className={`${mobileView === 'pdf' ? 'flex' : 'hidden md:flex'} flex-1 bg-gray-100 relative`}>
          {pdfLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-8 max-w-md w-full">
                <Loader2 className="w-12 h-12 animate-spin text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600 mb-4">{isMobile ? 'Loading exam paper' : 'Loading PDF...'}...</p>

                {/* Progress bar */}
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-purple-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${pdfLoadProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-500">{pdfLoadProgress}%</p>
              </div>
            </div>
         ) : pdfBlobUrl ? (
            <>
              {isMobile ? (
                <>
                  <iframe
                    key={`${pdfBlobUrl}-${mobileView}`}
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdfBlobUrl)}&embedded=true`}
                    className="w-full h-full border-0"
                    title="Exam Paper"
                    allow="fullscreen"
                    onLoad={() => {
                      // Set a timeout to check if PDF loaded successfully
                      setTimeout(() => setPdfLoadError(false), 2000);
                    }}
                    onError={() => setPdfLoadError(true)}
                  />
                  {pdfLoadError && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                      <div className="text-center">
                        <button
                          onClick={() => {
                            setPdfBlobUrl('');
                            setPdfLoadError(false);
                            setTimeout(() => loadPdfBlob(), 100);
                          }}
                          className="group flex flex-col items-center justify-center p-6 hover:scale-105 transition-transform duration-200"
                          aria-label="Reload exam paper"
                        >
                          <div className="relative mb-4">
                            <div className="absolute inset-0 bg-black rounded-full opacity-10 group-hover:opacity-20 transition-opacity"></div>
                            <RefreshCw className="w-16 h-16 text-black relative z-10 group-hover:rotate-180 transition-transform duration-500" />
                          </div>
                          <p className="text-gray-900 font-semibold text-lg mb-1">Tap to reload</p>
                          <p className="text-gray-600 text-sm">Exam paper failed to load</p>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <iframe
                  src={pdfBlobUrl}
                  className="w-full h-full border-0"
                  title="Exam Paper"
                  allow="fullscreen"
                />
              )}
            </>
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
            {processingPdfs ? (
              <p className="text-xs text-gray-500 mt-1 flex items-center">
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Processing PDFs for AI analysis...
              </p>
            ) : lastQuestionNumber ? (
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
                  <span className="text-base">{lastQuestionNumber}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                Ask your question in this format: Question 1
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
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
                <div className="bg-gray-100 text-gray-900 rounded-lg px-4 py-3">
                  <div className="flex items-center space-x-3">
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                    <span className="text-sm text-gray-600">
                      {aiProcessingStatus || 'Processing...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {user && (
            <div className="px-4 pt-4 pb-20 md:pb-4 border-t border-gray-200 bg-white flex-shrink-0">
              {/* Token Display with Upgrade button for free and student tiers */}
              {tokensLimit !== null && (
                <div className="mb-2 flex items-center justify-between px-1 relative">
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
                  <ContextualHint
                    show={shouldShowHint('tokenCounter') && !sending && messages.length >= 1}
                    onDismiss={() => markHintAsSeen('tokenCounter')}
                    title="Track Your Tokens"
                    message="This shows your remaining AI tokens. Each question you ask uses tokens. Upgrade for more tokens!"
                    position="top"
                    delay={2000}
                  />
                </div>
              )}

              {chatLocked ? (
                <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <Lock className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                    <h4 className="font-semibold text-gray-900">
                      {(tierName === 'student' || tierName === 'student_lite') ? 'Chat Locked - Not in Your Package' : 'Chat Locked - Limit Reached'}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    {(tierName === 'student' || tierName === 'student_lite')
                      ? 'You can view this paper, but it\'s not included in your selected grade and subjects. Upgrade to Pro for access to all papers.'
                      : 'You can view this paper, but you\'ve reached your chat limit for this billing period.'}
                  </p>
                  <button
                    onClick={onOpenSubscriptions || onBack}
                    className="w-full px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
                  >
                    {(tierName === 'student' || tierName === 'student_lite') ? 'View Upgrade Options' : 'Upgrade to Unlock Chat'}
                  </button>
                </div>
              ) : (
                <div className="relative">
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
                  <ContextualHint
                    show={shouldShowHint('chatInput') && !sending && messages.length === 0}
                    onDismiss={() => markHintAsSeen('chatInput')}
                    title="Ask Your Questions Here"
                    message="Type your question about the exam paper here. For example: 'Explain question 2' or 'Help me with Q3b'."
                    position="top"
                    delay={2000}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
