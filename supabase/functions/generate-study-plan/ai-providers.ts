// AI Provider Abstraction Layer
// Supports Gemini, Claude, and OpenAI with unified interface

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: string; text?: string; image_url?: any; source?: any }>;
}

export interface AIModelConfig {
  provider: 'gemini' | 'claude' | 'openai';
  model_name: string;
  display_name: string;
  api_endpoint: string;
  temperature: number;
  max_output_tokens: number;
  supports_vision: boolean;
  supports_caching: boolean;
}

export interface AIGenerateOptions {
  model: AIModelConfig;
  messages: AIMessage[];
  systemPrompt?: string;
  images?: string[]; // Base64 encoded images
  temperature?: number;
  maxTokens?: number;
  cachedContent?: string; // For Gemini cache
}

export interface AIGenerateResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

// ==================== GEMINI PROVIDER ====================

async function generateWithGemini(
  apiKey: string,
  options: AIGenerateOptions
): Promise<AIGenerateResponse> {
  const { model, messages, systemPrompt, images, temperature, maxTokens, cachedContent } = options;

  // Build content parts
  const parts: any[] = [];

  // Add system prompt if provided
  if (systemPrompt) {
    parts.push({ text: systemPrompt });
  }

  // Add messages
  for (const msg of messages) {
    if (typeof msg.content === 'string') {
      parts.push({ text: `${msg.role === 'assistant' ? 'Assistant: ' : 'User: '}${msg.content}` });
    } else if (Array.isArray(msg.content)) {
      // Handle multimodal content
      for (const item of msg.content) {
        if (item.type === 'text') {
          parts.push({ text: item.text });
        } else if (item.type === 'image_url' && item.image_url?.url) {
          // Extract base64 from data URL
          const base64 = item.image_url.url.replace(/^data:image\/\w+;base64,/, '');
          parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64 } });
        }
      }
    }
  }

  // Add images if provided separately
  if (images && images.length > 0) {
    for (const img of images) {
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: img } });
    }
  }

  // Use cached content if available
  if (cachedContent) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.model_name}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cachedContent: cachedContent,
          contents: [{ role: 'user', parts: parts }],
          generationConfig: {
            temperature: temperature ?? model.temperature,
            maxOutputTokens: maxTokens ?? model.max_output_tokens
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata || {};

    return {
      content,
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
      cacheReadTokens: usage.cachedContentTokenCount || 0
    };
  } else {
    // Regular generation without cache
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model.model_name}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: parts }],
          generationConfig: {
            temperature: temperature ?? model.temperature,
            maxOutputTokens: maxTokens ?? model.max_output_tokens
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const usage = data.usageMetadata || {};

    return {
      content,
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0
    };
  }
}

// ==================== CLAUDE PROVIDER ====================

async function generateWithClaude(
  apiKey: string,
  options: AIGenerateOptions
): Promise<AIGenerateResponse> {
  const { model, messages, systemPrompt, images, temperature, maxTokens } = options;

  // Build Claude messages format
  const claudeMessages: any[] = [];

  // Claude requires alternating user/assistant messages
  // Combine consecutive messages of the same role
  let currentRole: string | null = null;
  let currentContent: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue; // System messages handled separately

    if (msg.role !== currentRole && currentRole !== null) {
      // Flush current message
      claudeMessages.push({
        role: currentRole,
        content: currentContent
      });
      currentContent = [];
    }

    currentRole = msg.role;

    if (typeof msg.content === 'string') {
      currentContent.push({ type: 'text', text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === 'text') {
          currentContent.push({ type: 'text', text: item.text });
        } else if (item.type === 'image_url' && item.image_url?.url) {
          // Extract base64 from data URL
          const base64 = item.image_url.url.replace(/^data:image\/(\w+);base64,/, '');
          const mediaType = item.image_url.url.match(/^data:image\/(\w+);base64,/)?.[1] || 'jpeg';
          currentContent.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: `image/${mediaType}`,
              data: base64
            }
          });
        }
      }
    }
  }

  // Flush last message
  if (currentRole !== null) {
    claudeMessages.push({
      role: currentRole,
      content: currentContent
    });
  }

  // Add images if provided separately
  if (images && images.length > 0) {
    if (claudeMessages.length > 0 && claudeMessages[claudeMessages.length - 1].role === 'user') {
      // Add to last user message
      for (const img of images) {
        claudeMessages[claudeMessages.length - 1].content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: img
          }
        });
      }
    } else {
      // Create new user message with images
      claudeMessages.push({
        role: 'user',
        content: images.map(img => ({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: img
          }
        }))
      });
    }
  }

  // Ensure messages start with user and alternate
  if (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
    claudeMessages.unshift({
      role: 'user',
      content: [{ type: 'text', text: 'Please assist me with the following.' }]
    });
  }

  const requestBody: any = {
    model: model.model_name,
    max_tokens: maxTokens ?? model.max_output_tokens,
    temperature: temperature ?? model.temperature,
    messages: claudeMessages
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  const response = await fetch(model.api_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';
  const usage = data.usage || {};

  return {
    content,
    promptTokens: usage.input_tokens || 0,
    completionTokens: usage.output_tokens || 0,
    totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    cacheCreationTokens: usage.cache_creation_input_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0
  };
}

// ==================== OPENAI PROVIDER ====================

async function generateWithOpenAI(
  apiKey: string,
  options: AIGenerateOptions
): Promise<AIGenerateResponse> {
  const { model, messages, systemPrompt, images, temperature, maxTokens } = options;

  // Build OpenAI messages format
  const openaiMessages: any[] = [];

  // Add system message if provided
  if (systemPrompt) {
    openaiMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  // Add messages
  for (const msg of messages) {
    if (msg.role === 'system' && systemPrompt) continue; // Already added

    const message: any = { role: msg.role === 'assistant' ? 'assistant' : 'user' };

    if (typeof msg.content === 'string') {
      message.content = msg.content;
    } else if (Array.isArray(msg.content)) {
      message.content = msg.content.map(item => {
        if (item.type === 'text') {
          return { type: 'text', text: item.text };
        } else if (item.type === 'image_url') {
          return { type: 'image_url', image_url: item.image_url };
        }
        return item;
      });
    }

    openaiMessages.push(message);
  }

  // Add images if provided separately
  if (images && images.length > 0) {
    if (openaiMessages.length > 0 && openaiMessages[openaiMessages.length - 1].role === 'user') {
      // Convert last message to multimodal if it's text
      const lastMsg = openaiMessages[openaiMessages.length - 1];
      if (typeof lastMsg.content === 'string') {
        lastMsg.content = [{ type: 'text', text: lastMsg.content }];
      }
      // Add images
      for (const img of images) {
        lastMsg.content.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${img}` }
        });
      }
    } else {
      // Create new user message with images
      openaiMessages.push({
        role: 'user',
        content: images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${img}` }
        }))
      });
    }
  }

  const response = await fetch(model.api_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model.model_name,
      messages: openaiMessages,
      temperature: temperature ?? model.temperature,
      max_tokens: maxTokens ?? model.max_output_tokens
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  const usage = data.usage || {};

  return {
    content,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0
  };
}

// ==================== UNIFIED INTERFACE ====================

export async function generateAIResponse(
  options: AIGenerateOptions
): Promise<AIGenerateResponse> {
  const { model } = options;

  // Get API key based on provider
  let apiKey: string;

  switch (model.provider) {
    case 'gemini':
      apiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GEMINI_ASSISTANT_API_KEY') || '';
      if (!apiKey) throw new Error('Gemini API key not configured');
      return await generateWithGemini(apiKey, options);

    case 'claude':
      apiKey = Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('CLAUDE_API_KEY') || '';
      if (!apiKey) throw new Error('Claude API key not configured');
      return await generateWithClaude(apiKey, options);

    case 'openai':
      apiKey = Deno.env.get('OPENAI_API_KEY') || '';
      if (!apiKey) throw new Error('OpenAI API key not configured');
      return await generateWithOpenAI(apiKey, options);

    default:
      throw new Error(`Unsupported AI provider: ${model.provider}`);
  }
}

// Helper to get user's AI model preference
export async function getUserAIModel(
  supabaseClient: any,
  userId: string
): Promise<AIModelConfig | null> {
  try {
    const { data, error } = await supabaseClient
      .rpc('get_user_ai_model', { p_user_id: userId });

    if (error) throw error;

    if (data && data.length > 0) {
      const modelData = data[0];
      return {
        provider: modelData.provider,
        model_name: modelData.model_name,
        display_name: modelData.display_name,
        api_endpoint: modelData.api_endpoint,
        temperature: modelData.temperature_default,
        max_output_tokens: modelData.max_output_tokens,
        supports_vision: modelData.supports_vision,
        supports_caching: modelData.supports_caching
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching user AI model:', error);
    return null;
  }
}

// Helper to get default AI model
export async function getDefaultAIModel(
  supabaseClient: any
): Promise<AIModelConfig> {
  try {
    const { data, error } = await supabaseClient
      .from('ai_models')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (error) throw error;

    return {
      provider: data.provider,
      model_name: data.model_name,
      display_name: data.display_name,
      api_endpoint: data.api_endpoint,
      temperature: data.temperature_default,
      max_output_tokens: data.max_output_tokens,
      supports_vision: data.supports_vision,
      supports_caching: data.supports_caching
    };
  } catch (error) {
    console.error('Error fetching default AI model:', error);
    throw new Error('No default AI model configured in the system. Please contact support.');
  }
}
