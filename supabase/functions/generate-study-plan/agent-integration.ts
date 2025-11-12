/**
 * Integration layer for AI Agent-based Study Plan Generation
 *
 * This module integrates the calendar-aware AI agent with the existing
 * study plan generation endpoint, providing both legacy and agent-based modes.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { executeAgent, type StudyPlanContext, type ScheduledSession } from './agent-executor.ts';
import { type AIModelConfig } from './ai-providers.ts';

export interface AgentGenerationResult {
  events: Array<{
    title: string;
    description: string;
    date: string;
    start_time: string;
    end_time: string;
    chapter_number: number | null;
    topics: string[];
  }>;
  reasoning: string[];
  token_usage: { input: number; output: number };
  cost_usd: number;
}

/**
 * Generate study plan using AI agent with function calling
 */
export async function generateStudyPlanWithAgent(
  supabaseClient: SupabaseClient,
  userId: string,
  subjectId: string,
  gradeId: string,
  subjectName: string,
  gradeName: string,
  startDate: string,
  endDate: string,
  selectedDays: string[],
  preferredTimes: string[],
  sessionDuration: number,
  chapters: Array<{
    id: string;
    chapter_number: number;
    chapter_title: string;
    chapter_description?: string;
    subtopics?: string[];
  }>,
  aiModel: AIModelConfig
): Promise<AgentGenerationResult> {
  console.log('🤖 === AGENT-BASED STUDY PLAN GENERATION ===');
  console.log('📊 Using multi-step reasoning with calendar awareness');

  // Convert day names to numbers
  const dayNameToNumber: { [key: string]: number } = {
    'sunday': 0,
    'monday': 1,
    'tuesday': 2,
    'wednesday': 3,
    'thursday': 4,
    'friday': 5,
    'saturday': 6,
  };

  const preferredDayNumbers = selectedDays.map(day => dayNameToNumber[day.toLowerCase()]);

  // Extract preferred start/end times
  let preferredStartTime = '09:00';
  let preferredEndTime = '17:00';

  if (preferredTimes.length > 0) {
    const firstTime = preferredTimes[0].toLowerCase();
    if (firstTime.includes('morning')) {
      preferredStartTime = '08:00';
      preferredEndTime = '12:00';
    } else if (firstTime.includes('afternoon')) {
      preferredStartTime = '13:00';
      preferredEndTime = '17:00';
    } else if (firstTime.includes('evening')) {
      preferredStartTime = '18:00';
      preferredEndTime = '22:00';
    }
  }

  // Calculate session count for each chapter
  // Generate list of valid dates based on selected days
  const validDates: string[] = [];
  const startParts = startDate.split('-');
  const endParts = endDate.split('-');
  const currentDate = new Date(parseInt(startParts[0]), parseInt(startParts[1]) - 1, parseInt(startParts[2]));
  const endDateObj = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1, parseInt(endParts[2]));

  while (currentDate <= endDateObj) {
    const dayOfWeek = currentDate.getDay();
    if (preferredDayNumbers.includes(dayOfWeek)) {
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      validDates.push(`${year}-${month}-${day}`);
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log(`✅ Generated ${validDates.length} valid dates`);

  // Validate that we have dates to work with
  if (validDates.length === 0) {
    throw new Error(`No valid dates found between ${startDate} and ${endDate} for the selected days: ${selectedDays.join(', ')}. Please adjust your date range or selected days.`);
  }

  if (chapters.length === 0) {
    throw new Error('No chapters available to create a study plan. Please select a subject with available syllabus chapters.');
  }

  // Distribute sessions evenly across chapters
  const totalSessions = validDates.length;
  const sessionsPerChapter = Math.floor(totalSessions / chapters.length);
  const remainingSessions = totalSessions % chapters.length;

  const chaptersWithSessions = chapters.map((ch, idx) => ({
    chapter_number: ch.chapter_number,
    chapter_title: ch.chapter_title,
    session_count: sessionsPerChapter + (idx < remainingSessions ? 1 : 0),
    topics: ch.subtopics || [],
  }));

  console.log('📚 Chapter distribution:');
  chaptersWithSessions.forEach(ch => {
    console.log(`   - Chapter ${ch.chapter_number}: ${ch.session_count} sessions`);
  });

  // Build context for agent
  const context: StudyPlanContext = {
    supabaseClient,
    userId,
    subjectId,
    gradeId,
    subjectName,
    gradeName,
    startDate,
    endDate,
    preferredDays: preferredDayNumbers,
    preferredStartTime,
    preferredEndTime,
    sessionDuration,
    chapters: chaptersWithSessions,
  };

  // Get API key for the model
  const apiKey = getAPIKeyForProvider(aiModel.provider);

  // Execute the agent
  console.log('🚀 Launching AI agent...');
  const agentResult = await executeAgent(
    {
      provider: aiModel.provider,
      model: aiModel.model_name,
      apiKey,
    },
    context,
    20 // max iterations
  );

  console.log('✅ Agent completed successfully');
  console.log(`📊 Scheduled ${agentResult.sessions.length} sessions`);
  console.log(`💬 Reasoning steps: ${agentResult.reasoning.length}`);
  console.log(`🪙 Token usage: ${agentResult.token_usage.input} input + ${agentResult.token_usage.output} output`);
  console.log(`💰 Cost: $${agentResult.cost_usd.toFixed(6)}`);

  // Convert agent sessions to the expected format
  const events = agentResult.sessions.map(session => ({
    title: session.title,
    description: `Topics: ${session.topics.join(', ')}`,
    date: session.date,
    start_time: session.start_time,
    end_time: session.end_time,
    chapter_number: session.chapter_number,
    topics: session.topics,
  }));

  return {
    events,
    reasoning: agentResult.reasoning,
    token_usage: agentResult.token_usage,
    cost_usd: agentResult.cost_usd,
  };
}

/**
 * Get API key for a provider from environment variables
 */
function getAPIKeyForProvider(provider: string): string {
  switch (provider) {
    case 'anthropic':
      return Deno.env.get('ANTHROPIC_API_KEY') || '';
    case 'google':
    case 'gemini':
      return Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GEMINI_ASSISTANT_API_KEY') || Deno.env.get('GOOGLE_AI_API_KEY') || '';
    case 'openai':
      return Deno.env.get('OPENAI_API_KEY') || '';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Check if agent mode should be used based on request parameters
 */
export function shouldUseAgentMode(
  existingEventCount: number,
  threshold: number = 50
): boolean {
  // Use agent mode if there are many existing events
  // This avoids sending huge prompts to the AI
  return existingEventCount >= threshold;
}

/**
 * Check if agent mode is explicitly enabled via request parameter
 */
export function isAgentModeEnabled(requestData: any): boolean {
  return requestData.use_agent_mode === true;
}
