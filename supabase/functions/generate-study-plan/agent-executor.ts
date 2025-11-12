/**
 * AI Agent Executor for Calendar-Aware Study Plan Generation
 *
 * Uses multi-step reasoning with function calling to intelligently
 * schedule study sessions while checking calendar conflicts incrementally.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  getAgentFunctionDefinitions,
  executeAgentFunction,
} from './agent-tools.ts';

export interface AgentConfig {
  provider: 'anthropic' | 'google' | 'openai';
  model: string;
  apiKey: string;
}

export interface StudyPlanContext {
  supabaseClient: SupabaseClient;
  userId: string;
  subjectId: string;
  gradeId: string;
  subjectName: string;
  gradeName: string;
  startDate: string;
  endDate: string;
  preferredDays: number[];
  preferredStartTime: string;
  preferredEndTime: string;
  sessionDuration: number;
  chapters: Array<{
    chapter_number: number;
    chapter_title: string;
    session_count: number;
    topics: string[];
  }>;
}

export interface ScheduledSession {
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  chapter_number: number;
  session_number: number;
  topics: string[];
}

interface AgentMessage {
  role: 'user' | 'assistant' | 'function';
  content: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  name?: string; // For function results
  tool_call_id?: string; // For function results in OpenAI
  functionResponse?: {  // For Gemini function results
    name: string;
    response: any;
  };
}

/**
 * Main agent executor - runs the AI agent loop with function calling
 */
export async function executeAgent(
  config: AgentConfig,
  context: StudyPlanContext,
  maxIterations: number = 20
): Promise<{
  sessions: ScheduledSession[];
  reasoning: string[];
  token_usage: { input: number; output: number };
  cost_usd: number;
}> {
  const sessions: ScheduledSession[] = [];
  const reasoning: string[] = [];
  const messages: AgentMessage[] = [];

  // Initial system prompt
  const systemPrompt = buildSystemPrompt(context);
  messages.push({
    role: 'user',
    content: systemPrompt,
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;

  // Calculate total sessions for tracking
  const totalSessions = context.chapters.reduce((sum, ch) => sum + ch.session_count, 0);

  // Agent loop
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`\n=== Agent Iteration ${iteration + 1}/${maxIterations} ===`);
    console.log(`📊 Progress: ${sessions.length}/${totalSessions} sessions scheduled`);

    // Call AI with function definitions
    const response = await callAIWithFunctions(config, messages);

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    totalCostUsd += response.cost_usd;

    // Log detailed response info
    console.log(`📝 Response content length: ${response.content?.length || 0}`);
    console.log(`🔧 Function calls count: ${response.function_calls?.length || 0}`);
    if (response.function_calls && response.function_calls.length > 0) {
      console.log(`🔧 Function names: ${response.function_calls.map(fc => fc.name).join(', ')}`);
    }

    // Add assistant response to message history
    // For Gemini, if we have parts (function calls), we need to store them properly
    if (config.provider === 'gemini' || config.provider === 'google') {
      if (response.function_data?.parts && response.function_data.parts.length > 0) {
        // Store Gemini's parts structure for proper conversation history
        messages.push({
          role: 'assistant',
          content: JSON.stringify({ parts: response.function_data.parts }),
        });
      } else {
        messages.push({
          role: 'assistant',
          content: response.content || '',
        });
      }
    } else {
      // For other providers, use standard format
      messages.push({
        role: 'assistant',
        content: response.content || '',
        ...response.function_data,
      });
    }

    // Log reasoning
    if (response.content) {
      reasoning.push(response.content);
      console.log('AI Reasoning:', response.content);
    }

    // Check if AI wants to call functions
    if (response.function_calls && response.function_calls.length > 0) {
      // Execute all function calls and collect results
      const functionResults: Array<{ name: string; result: any; id?: string }> = [];

      for (const funcCall of response.function_calls) {
        console.log(`Executing function: ${funcCall.name}`, funcCall.arguments);

        try {
          const result = await executeAgentFunction(
            funcCall.name,
            funcCall.arguments,
            {
              supabaseClient: context.supabaseClient,
              userId: context.userId,
              subjectId: context.subjectId,
              gradeId: context.gradeId,
              startDate: context.startDate,
              endDate: context.endDate,
              preferredDays: context.preferredDays,
              preferredStartTime: context.preferredStartTime,
              preferredEndTime: context.preferredEndTime,
              sessionDuration: context.sessionDuration,
            }
          );

          console.log('Function result:', result);

          // NEW BULK ARCHITECTURE: Handle submit_complete_plan
          if (funcCall.name === 'submit_complete_plan' && result.success) {
            // Extract final sessions from the bulk validation result
            const finalSessions = result.final_sessions || [];
            sessions.push(...finalSessions);
            console.log(`✅ Bulk submission complete: ${finalSessions.length} sessions validated and finalized`);
            console.log(`   - ${result.validation_result.valid_count} valid, ${result.validation_result.conflict_count} conflicts`);
            console.log(`   - ${result.validation_result.alternatives_found} alternatives found`);
          }

          // Collect function result
          functionResults.push({
            name: funcCall.name,
            result: result,
            id: funcCall.id, // For OpenAI
          });
        } catch (error) {
          console.error(`Error executing function ${funcCall.name}:`, error);
          functionResults.push({
            name: funcCall.name,
            result: { error: error.message },
            id: funcCall.id,
          });
        }
      }

      // Add all function results to messages in provider-specific format
      if (config.provider === 'openai') {
        // OpenAI expects separate messages for each function result
        for (const fr of functionResults) {
          messages.push({
            role: 'function' as any,
            name: fr.name,
            content: JSON.stringify(fr.result),
            tool_call_id: fr.id,
          });
        }
      } else if (config.provider === 'gemini' || config.provider === 'google') {
        // Gemini expects ALL function responses in ONE message with multiple parts
        const parts = functionResults.map(fr => ({
          functionResponse: {
            name: fr.name,
            response: {
              name: fr.name,
              content: fr.result,
            }
          }
        }));

        messages.push({
          role: 'user',
          content: JSON.stringify({ parts }),
        } as any);
      } else {
        // Claude/Anthropic - separate messages
        for (const fr of functionResults) {
          messages.push({
            role: 'function' as any,
            name: fr.name,
            content: JSON.stringify(fr.result),
          });
        }
      }
    } else {
      // No more function calls - agent is done
      console.log('Agent completed planning (no more function calls)');
      console.log(`Final progress: ${sessions.length}/${totalSessions} sessions scheduled`);
      break;
    }

    // Safety check - ensure we scheduled the expected number of sessions
    if (sessions.length >= totalSessions) {
      console.log(`✅ All ${totalSessions} sessions scheduled successfully!`);
      break;
    }
  }

  // Warn if we didn't schedule all sessions
  if (sessions.length < totalSessions) {
    console.warn(`⚠️ WARNING: Only scheduled ${sessions.length}/${totalSessions} sessions`);
    console.warn(`Agent may have stopped early (reached max iterations: ${maxIterations})`);
  }

  return {
    sessions,
    reasoning,
    token_usage: {
      input: totalInputTokens,
      output: totalOutputTokens,
    },
    cost_usd: totalCostUsd,
  };
}

/**
 * Build the initial system prompt for the agent
 */
function buildSystemPrompt(context: StudyPlanContext): string {
  const totalSessions = context.chapters.reduce((sum, ch) => sum + ch.session_count, 0);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const preferredDayNames = context.preferredDays.map(d => dayNames[d]).join(', ');

  const chaptersInfo = context.chapters
    .map(
      ch =>
        `- Chapter ${ch.chapter_number}: "${ch.chapter_title}" (${ch.session_count} sessions)\n  Topics: ${ch.topics.join(', ')}`
    )
    .join('\n');

  return `You are a study plan scheduling AI. Your task: Create a complete schedule for ${totalSessions} sessions in ONE bulk submission.

**NEW EFFICIENT PROCESS - Only 2 steps:**

**Context:**
- Subject: ${context.subjectName}, Grade: ${context.gradeName}
- Date Range: ${context.startDate} to ${context.endDate}
- Preferred Days: ${preferredDayNames}
- Preferred Time: ${context.preferredStartTime} - ${context.preferredEndTime}
- Session Duration: ${context.sessionDuration} minutes

**Chapters:**
${chaptersInfo}

**STEP 1 (Optional):** Call get_calendar_overview() to see calendar density.

**STEP 2:** Generate complete schedule for ALL ${totalSessions} sessions, then call submit_complete_plan() with the full array.

**Planning Guidelines:**
- Distribute sessions evenly across the date range
- Use preferred days (${preferredDayNames}) and time (${context.preferredStartTime}-${context.preferredEndTime})
- Title format: "${context.subjectName} - Chapter X: Session Y"
- Follow chapter order (Chapter 1 all sessions, then Chapter 2, etc.)
- Include relevant topics for each session

**Example session object:**
{
  "date": "2026-02-03",
  "start_time": "${context.preferredStartTime}",
  "end_time": "${addMinutes(context.preferredStartTime, context.sessionDuration)}",
  "title": "${context.subjectName} - Chapter 1: Session 1",
  "chapter_number": 1,
  "session_number": 1,
  "topics": ["Topic 1", "Topic 2"]
}

**IMPORTANT:** After you submit, the system will:
1. Validate all ${totalSessions} sessions against the calendar in bulk
2. Automatically find alternative times for ANY conflicts
3. Return the final validated schedule

**Generate the complete plan NOW and call submit_complete_plan() with all ${totalSessions} sessions.**`;
}

/**
 * Helper to add minutes to time string for prompt
 */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

/**
 * Call AI with function calling support
 */
async function callAIWithFunctions(
  config: AgentConfig,
  messages: AgentMessage[]
): Promise<{
  content: string | null;
  function_calls: Array<{ id?: string; name: string; arguments: any }>;
  function_data: any;
  usage: { input_tokens: number; output_tokens: number };
  cost_usd: number;
}> {
  const functions = getAgentFunctionDefinitions();

  switch (config.provider) {
    case 'anthropic':
      return await callClaudeWithFunctions(config, messages, functions);
    case 'google':
    case 'gemini':
      return await callGeminiWithFunctions(config, messages, functions);
    case 'openai':
      return await callOpenAIWithFunctions(config, messages, functions);
    default:
      throw new Error(`Unsupported provider: ${config.provider}`);
  }
}

/**
 * Call Claude (Anthropic) with function calling
 */
async function callClaudeWithFunctions(
  config: AgentConfig,
  messages: AgentMessage[],
  functions: any[]
): Promise<any> {
  // Convert function definitions to Claude's tool format
  const tools = functions.map(f => ({
    name: f.name,
    description: f.description,
    input_schema: f.parameters,
  }));

  // Convert messages to Claude format
  const claudeMessages = messages.map(msg => {
    if (msg.role === 'function') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: `tool_${Date.now()}_${Math.random()}`,
            content: msg.content,
          },
        ],
      };
    }
    return {
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    };
  });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 4096,
      messages: claudeMessages,
      tools,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();

  // Extract content and tool calls
  let content = '';
  const function_calls: Array<{ id: string; name: string; arguments: any }> = [];

  for (const block of data.content) {
    if (block.type === 'text') {
      content += block.text;
    } else if (block.type === 'tool_use') {
      function_calls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      });
    }
  }

  // Calculate cost (Claude pricing)
  const inputCost = (data.usage.input_tokens / 1_000_000) * 3; // $3 per 1M input tokens
  const outputCost = (data.usage.output_tokens / 1_000_000) * 15; // $15 per 1M output tokens

  return {
    content: content || null,
    function_calls,
    function_data: {},
    usage: {
      input_tokens: data.usage.input_tokens,
      output_tokens: data.usage.output_tokens,
    },
    cost_usd: inputCost + outputCost,
  };
}

/**
 * Call Gemini with function calling
 */
async function callGeminiWithFunctions(
  config: AgentConfig,
  messages: AgentMessage[],
  functions: any[]
): Promise<any> {
  // Convert to Gemini format
  const contents = messages.map(msg => {
    const role = msg.role === 'assistant' ? 'model' : 'user';

    // Check if message content is a JSON structure (function response or model parts)
    if (msg.content && typeof msg.content === 'string') {
      try {
        const parsed = JSON.parse(msg.content);

        // Check for multiple function responses (parts array with functionResponse objects)
        if (parsed.parts && Array.isArray(parsed.parts) && parsed.parts.length > 0) {
          // Check if these are function responses (not model function calls)
          if (parsed.parts[0].functionResponse) {
            // Gemini REST API expects function responses with role 'user', not 'function'
            return {
              role: 'user',
              parts: parsed.parts,
            };
          }
          // Otherwise, these are model parts (function calls from model)
          return {
            role: 'model',
            parts: parsed.parts,
          };
        }

        // Check for single function response (legacy format)
        if (parsed.functionResponse) {
          // Gemini REST API expects function responses with role 'user', not 'function'
          return {
            role: 'user',
            parts: [parsed],
          };
        }
      } catch (e) {
        // Not JSON, treat as regular text
      }
    }

    // Regular text message
    return {
      role,
      parts: [{ text: msg.content || '' }],
    };
  });

  const tools = [
    {
      function_declarations: functions.map(f => ({
        name: f.name,
        description: f.description,
        parameters: f.parameters,
      })),
    },
  ];

  // Debug logging for conversation structure
  console.log(`🔍 Sending ${contents.length} messages to Gemini`);
  console.log(`🔧 Tools: ${tools[0].function_declarations.length} functions available`);
  tools[0].function_declarations.forEach((func: any) => {
    console.log(`  - ${func.name}: ${func.description.substring(0, 60)}...`);
  });

  contents.forEach((msg, idx) => {
    console.log(`  Message ${idx + 1}: role=${msg.role}, parts=${msg.parts?.length || 0}`);
    if (msg.parts && msg.parts.length > 0) {
      msg.parts.forEach((part, pIdx) => {
        if (part.text) {
          console.log(`    Part ${pIdx + 1}: text (${part.text.substring(0, 50)}...)`);
        } else if (part.functionCall) {
          console.log(`    Part ${pIdx + 1}: functionCall(${part.functionCall.name})`);
        } else if (part.functionResponse) {
          console.log(`    Part ${pIdx + 1}: functionResponse(${part.functionResponse.name})`);
        }
      });
    }
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        tools,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();

  // Debug: Log the raw Gemini response
  console.log('📨 Gemini API Response:');
  console.log(`  Candidates: ${data.candidates?.length || 0}`);
  if (data.candidates && data.candidates[0]) {
    const candidate = data.candidates[0];
    console.log(`  Finish reason: ${candidate.finishReason || 'N/A'}`);
    console.log(`  Parts count: ${candidate.content?.parts?.length || 0}`);
    if (candidate.content?.parts) {
      candidate.content.parts.forEach((part: any, idx: number) => {
        if (part.text) {
          console.log(`    Part ${idx + 1}: text - "${part.text.substring(0, 100)}..."`);
        } else if (part.functionCall) {
          console.log(`    Part ${idx + 1}: functionCall - ${part.functionCall.name}`);
        }
      });
    }
  }

  // Extract content and function calls
  let content = '';
  const function_calls: Array<{ name: string; arguments: any }> = [];

  const candidate = data.candidates?.[0];
  if (candidate?.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.text) {
        content += part.text;
      } else if (part.functionCall) {
        function_calls.push({
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }
  }

  // Estimate tokens and cost
  const inputTokens = data.usageMetadata?.promptTokenCount || 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount || 0;
  const inputCost = (inputTokens / 1_000_000) * 0.075; // Gemini 1.5 Pro pricing
  const outputCost = (outputTokens / 1_000_000) * 0.30;

  // For Gemini, we need to preserve the original parts structure for conversation history
  const parts: any[] = [];
  if (content) {
    parts.push({ text: content });
  }
  if (function_calls.length > 0) {
    for (const fc of function_calls) {
      parts.push({
        functionCall: {
          name: fc.name,
          args: fc.arguments,
        },
      });
    }
  }

  return {
    content: content || null,
    function_calls,
    function_data: {
      parts, // Include Gemini-formatted parts for conversation history
    },
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
    },
    cost_usd: inputCost + outputCost,
  };
}

/**
 * Call OpenAI with function calling
 */
async function callOpenAIWithFunctions(
  config: AgentConfig,
  messages: AgentMessage[],
  functions: any[]
): Promise<any> {
  const tools = functions.map(f => ({
    type: 'function',
    function: f,
  }));

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        name: msg.name,
        tool_call_id: msg.tool_call_id,
      })),
      tools,
      tool_choice: 'auto',
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();

  const message = data.choices[0].message;
  const content = message.content || '';
  const function_calls: Array<{ id: string; name: string; arguments: any }> = [];

  if (message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      function_calls.push({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: JSON.parse(toolCall.function.arguments),
      });
    }
  }

  // Calculate cost (GPT-4 pricing)
  const inputCost = (data.usage.prompt_tokens / 1_000_000) * 5;
  const outputCost = (data.usage.completion_tokens / 1_000_000) * 15;

  return {
    content: content || null,
    function_calls,
    function_data: { tool_calls: message.tool_calls },
    usage: {
      input_tokens: data.usage.prompt_tokens,
      output_tokens: data.usage.completion_tokens,
    },
    cost_usd: inputCost + outputCost,
  };
}
