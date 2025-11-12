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

  // Agent loop
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`\n=== Agent Iteration ${iteration + 1} ===`);

    // Call AI with function definitions
    const response = await callAIWithFunctions(config, messages);

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    totalCostUsd += response.cost_usd;

    // Add assistant response to message history
    messages.push({
      role: 'assistant',
      content: response.content || '',
      ...response.function_data,
    });

    // Log reasoning
    if (response.content) {
      reasoning.push(response.content);
      console.log('AI Reasoning:', response.content);
    }

    // Check if AI wants to call functions
    if (response.function_calls && response.function_calls.length > 0) {
      // Execute all function calls
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
            }
          );

          console.log('Function result:', result);

          // Handle schedule_session specially - collect the session
          if (funcCall.name === 'schedule_session' && result.success) {
            sessions.push(result.session);
          }

          // Add function result to messages
          if (config.provider === 'openai') {
            messages.push({
              role: 'function' as any,
              name: funcCall.name,
              content: JSON.stringify(result),
              tool_call_id: funcCall.id,
            });
          } else {
            messages.push({
              role: 'function' as any,
              name: funcCall.name,
              content: JSON.stringify(result),
            });
          }
        } catch (error) {
          console.error(`Error executing function ${funcCall.name}:`, error);
          messages.push({
            role: 'function' as any,
            name: funcCall.name,
            content: JSON.stringify({ error: error.message }),
          });
        }
      }
    } else {
      // No more function calls - agent is done
      console.log('Agent completed planning');
      break;
    }

    // Safety check - ensure we scheduled the expected number of sessions
    const totalSessions = context.chapters.reduce((sum, ch) => sum + ch.session_count, 0);
    if (sessions.length >= totalSessions) {
      console.log('All sessions scheduled');
      break;
    }
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

  return `You are an intelligent study plan scheduling assistant. Your task is to schedule ${totalSessions} study sessions for a student while avoiding calendar conflicts.

**Student Information:**
- Subject: ${context.subjectName}
- Grade: ${context.gradeName}
- Date Range: ${context.startDate} to ${context.endDate}
- Preferred Days: ${preferredDayNames}
- Preferred Time: ${context.preferredStartTime} - ${context.preferredEndTime}
- Session Duration: ${context.sessionDuration} minutes

**Chapters to Cover:**
${chaptersInfo}

**CRITICAL: You MUST schedule exactly ${totalSessions} sessions total.**

**Your Tools:**
You have access to the following functions to help you schedule intelligently:

1. **get_busy_periods()** - Get days with existing events (sorted by least busy first)
2. **check_time_slot(date, start_time, end_time)** - Check if a specific time has conflicts
3. **get_conflicting_sessions()** - Get existing sessions for this same subject/grade
4. **schedule_session(...)** - Schedule a session (only after checking it's free)

**Instructions:**

1. **Start by understanding the calendar:**
   - Call get_busy_periods() to see which days have fewer events
   - Call get_conflicting_sessions() to see if there are existing sessions for this subject

2. **Then, schedule ALL ${totalSessions} sessions one by one:**
   - You MUST schedule sessions in a loop until you've scheduled all ${totalSessions} sessions
   - Keep track: After scheduling session N, immediately schedule session N+1
   - Continue until you've scheduled session ${totalSessions}

3. **For EACH of the ${totalSessions} sessions:**
   a. Determine the best date (prefer less busy days, prefer preferred days)
   b. Calculate start/end times based on preferred time and session duration
   c. **ALWAYS call check_time_slot() BEFORE scheduling**
   d. If conflict exists:
      - Try a different time on the same day
      - Or try the next preferred day
   e. Once you find a free slot, call schedule_session()
   f. **REPEAT for the next session** - don't stop until all ${totalSessions} are scheduled

4. **Chapter and session ordering:**
   - MUST follow chapter order (Chapter 1 sessions before Chapter 2)
   - MUST follow session order within each chapter (Session 1 before Session 2)
   - Session titles: "${context.subjectName} - Chapter X: Session Y"
   - Distribute sessions evenly across the date range
   - Include relevant topics for each session

5. **Completion:**
   - You are NOT done until you have scheduled ALL ${totalSessions} sessions
   - After scheduling each session, continue to the next one
   - When you've scheduled all ${totalSessions} sessions, explain your final scheduling strategy

**Important Rules:**
- NEVER schedule a session without checking the time slot first
- MUST maintain chapter and session order
- Try to space sessions evenly (avoid clustering)
- Respect preferred days and times as much as possible
- DO NOT STOP until you've called schedule_session() exactly ${totalSessions} times

Begin by calling get_busy_periods() to understand the calendar, then systematically schedule all ${totalSessions} sessions one after another.`;
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
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const tools = [
    {
      function_declarations: functions.map(f => ({
        name: f.name,
        description: f.description,
        parameters: f.parameters,
      })),
    },
  ];

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

  return {
    content: content || null,
    function_calls,
    function_data: {},
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
