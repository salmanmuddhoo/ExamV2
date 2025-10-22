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
  onOpenSubscriptions?: () => void;
}

export function ExamViewer({ paperId, conversationId, onBack, onLoginRequired, onOpenSubscriptions }: Props) {
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

  const loadPdfBlob = async () => {
    if (!examPaper) return;

    try {
      setPdfLoading(true);
      setProcessingPdfs(true);
      setPdfLoadError(false); // Reset error state

      if (isMobile) {
        // For mobile, use signed URL (works with private buckets)
        const { data: signedData, error: signedUrlError } = await supabase.storage
          .from('exam-papers')
          .createSignedUrl(examPaper.pdf_path, 3600); // Valid for 1 hour
        
        if (signedUrlError || !signedData?.signedUrl) {
          console.error('Failed to get signed URL:', signedUrlError);
          throw new Error('Failed to get signed URL');
        }
        
        // Add a small delay to ensure URL is ready before setting it
        await new Promise(resolve => setTimeout(resolve, 800));
        setPdfBlobUrl(signedData.signedUrl);
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
          console.error('Error checking paper access:', accessError);
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
                console.log(`🔒 Free tier: Chat locked - Token limit reached (${subscription.tokens_used_current_period}/${tokenLimit})`);
              }
              // Then check paper limit (only if this paper hasn't been accessed yet)
              else if (subscription.papers_accessed_current_period >= papersLimit && !alreadyAccessed) {
                shouldLockChat = true;
                lockReason = 'paper_limit';
                console.log(`🔒 Free tier: Chat locked - Paper limit reached (${subscription.papers_accessed_current_period}/${papersLimit} papers)`);
              }
              else {
                console.log(`✅ Free tier: Chat available - ${subscription.papers_accessed_current_period}/${papersLimit} papers, ${subscription.tokens_used_current_period}/${tokenLimit} tokens used`);
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
              console.log('🔒 Paid tier: Chat locked - Token limit reached');
            }

            // For student/student_lite tiers, check grade/subject restrictions
            if (access.tier_name === 'student' || access.tier_name === 'student_lite') {
              const { data: canUseChat, error: chatAccessError } = await supabase
                .rpc('can_user_use_chat_for_paper', {
                  p_user_id: user.id,
                  p_paper_id: paperId
                });

              if (chatAccessError) {
                console.error('Error checking student package chat access:', chatAccessError);
              } else if (canUseChat === false) {
                setChatLocked(true);
                console.log('🔒 Student/Student Lite tier: Chat locked - Paper not in selected grade/subjects');
              } else {
                console.log('✅ Student/Student Lite tier: Chat available - Paper matches selected grade/subjects');
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching exam paper:', error);
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

      console.log('📨 Loaded messages order:', loadedMessages.map((m, i) => `${i}: ${m.role} - ${m.content.substring(0, 30)}...`));

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
      console.error('Error saving conversation:', error);
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
          console.log(`🔄 Token count updated: ${remaining} tokens remaining`);

          // Lock chat if tokens depleted
          if (remaining === 0) {
            setChatLocked(true);
            console.log('🔒 Chat locked - Token limit reached');
          }
        }

        // Update paper count (free tier only)
        if (tierName === 'free' && papersLimit !== null) {
          const remaining = Math.max(0, papersLimit - subscription.papers_accessed_current_period);
          setPapersRemaining(remaining);
          console.log(`🔄 Paper count updated: ${remaining} papers remaining`);
        }

        setTierName(tierName);
      }
    } catch (error) {
      console.error('Error refreshing token counts:', error);
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

    // Check if user has chat access for this paper (token + paper limit + student package restrictions)
    if (user) {
      // First check if user can use chat with this paper (student package grade/subject restrictions)
      const { data: canUseChat, error: accessError } = await supabase
        .rpc('can_user_use_chat_for_paper', {
          p_user_id: user.id,
          p_paper_id: paperId
        });

      if (accessError) {
        console.error('Error checking chat access:', accessError);
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

You've used all ${tokenLimit.toLocaleString()} tokens for this month.

**To continue using AI chat:**
- Upgrade to **Student Package** ($15/month) - Get 500K tokens/month
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

You still have **${tokenLimit ? tokenLimit - subscription.tokens_used_current_period : 0} tokens** remaining, but they can only be used on the ${papersLimit} papers you've already chatted with.

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
            console.error('Error tracking paper chat usage:', updateError);
          } else {
            const newCount = subscription.papers_accessed_current_period + 1;
            console.log(`✅ Free tier: Tracked chat usage for paper ${paperId} (${newCount}/${papersLimit} papers used)`);
            console.log(`📊 Remaining: ${papersLimit - newCount} papers, ${tokenLimit ? tokenLimit - subscription.tokens_used_current_period : 'unlimited'} tokens`);
            // Update local state immediately
            setPapersRemaining((papersLimit || 2) - newCount);
          }
        }
      }
    }

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);
    setSending(true);
    setAiProcessingStatus('Reading your question...');

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
        setAiProcessingStatus('Analyzing your follow-up question...');
        requestBody.optimizedMode = true;
        requestBody.questionNumber = questionNumber;
        requestBody.examPaperImages = []; // Empty - backend will use history
        requestBody.markingSchemeImages = [];
      } else if (questionNumber) {
        // 🔹 NEW QUESTION: Fetch data (from cache if available)
        setAiProcessingStatus(`Reading Question ${questionNumber} from exam paper...`);
        const questionData = await fetchQuestionData(questionNumber);

        if (questionData && questionData.exam.length > 0) {
          console.log(`✅ Question ${questionNumber} found`);
          console.log(`   - Exam images: ${questionData.exam.length}`);
          console.log(`   - Marking scheme: TEXT (not images)`);
          console.log(`💰 Cost optimization: Using text instead of marking scheme images`);

          setAiProcessingStatus(`Analyzing Question ${questionNumber}...`);
          requestBody.optimizedMode = true;
          requestBody.questionNumber = questionNumber;
          requestBody.examPaperImages = questionData.exam;
          requestBody.markingSchemeText = questionData.markingSchemeText;
          requestBody.questionText = questionData.questionText;

          // Update last question number
          setLastQuestionNumber(questionNumber);
        } else {
          console.log(`❌ Question ${questionNumber} not found in database, using fallback mode`);
          setAiProcessingStatus(`Analyzing Question ${questionNumber}...`);
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

      // 🔹 NEW: Refresh token/paper counts immediately after AI response
      await refreshTokenCounts();
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
            <>
              {isMobile ? (
                <>
                  <iframe
                    key={pdfBlobUrl}
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
                        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-600 mb-4">PDF failed to load</p>
                        <button
                          onClick={() => {
                            setPdfBlobUrl('');
                            setPdfLoadError(false);
                            setTimeout(() => loadPdfBlob(), 100);
                          }}
                          className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          Reload PDF
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
                <div className="mb-2 flex items-center justify-between px-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-gray-600">AI Tokens:</span>
                    <span className="text-xs font-semibold text-gray-900">
                      {tokensUsed.toLocaleString()} / {tokensLimit.toLocaleString()}
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
                      {(tierName === 'student' || tierName === 'student_lite') ? 'Chat Locked - Not in Your Package' : 'Chat Locked - Limit Reached'}
                    </h4>
                  </div>
                  <p className="text-sm text-gray-700 mb-3">
                    {(tierName === 'student' || tierName === 'student_lite')
                      ? 'You can view this paper, but it\'s not included in your selected grade and subjects. Upgrade to Pro for access to all papers, or modify your Student Package.'
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}