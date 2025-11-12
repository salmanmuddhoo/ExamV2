/**
 * AI Agent Tools for Calendar-Aware Study Plan Generation
 *
 * These tools allow the AI agent to interact with the calendar
 * and make intelligent scheduling decisions incrementally.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface TimeSlot {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
}

export interface ConflictInfo {
  has_conflict: boolean;
  conflict_count: number;
  conflicts: Array<{
    event_id: string;
    title: string;
    start_time: string;
    end_time: string;
    subject: string;
    is_same_subject: boolean;
  }>;
  suggestion?: string;
}

export interface BusyPeriod {
  date: string;
  event_count: number;
  time_slots: Array<{ start: string; end: string }>;
}

/**
 * Check if a specific time slot has calendar conflicts
 */
export async function checkTimeSlot(
  supabaseClient: SupabaseClient,
  userId: string,
  slot: TimeSlot,
  subjectId: string,
  gradeId: string
): Promise<ConflictInfo> {
  const slotStart = `${slot.date}T${slot.start_time}:00`;
  const slotEnd = `${slot.date}T${slot.end_time}:00`;

  // Query events on this specific date
  // Need to join with study_plan_schedules to get subject_id and grade_id
  const { data: existingEvents, error } = await supabaseClient
    .from('study_plan_events')
    .select(`
      id,
      title,
      start_time,
      end_time,
      study_plan_schedules!inner(subject_id, grade_id, subjects(name))
    `)
    .eq('user_id', userId)
    .eq('event_date', slot.date);

  if (error) {
    console.error('Error checking time slot:', error);
    return {
      has_conflict: false,
      conflict_count: 0,
      conflicts: [],
    };
  }

  // Check for time overlap using interval intersection
  const conflicts = (existingEvents || [])
    .filter(event => {
      // Convert TIME values to full timestamps for comparison
      // start_time and end_time might be TIME type (e.g., "09:00:00") or TIMESTAMPTZ
      const eventStartTime = typeof event.start_time === 'string' && event.start_time.includes('T')
        ? event.start_time
        : `${slot.date}T${event.start_time}`;
      const eventEndTime = typeof event.end_time === 'string' && event.end_time.includes('T')
        ? event.end_time
        : `${slot.date}T${event.end_time}`;

      const eventStart = new Date(eventStartTime).getTime();
      const eventEnd = new Date(eventEndTime).getTime();
      const newStart = new Date(slotStart).getTime();
      const newEnd = new Date(slotEnd).getTime();

      // Overlap if: newStart < eventEnd AND eventStart < newEnd
      return newStart < eventEnd && eventStart < newEnd;
    })
    .map(event => ({
      event_id: event.id,
      title: event.title,
      start_time: event.start_time,
      end_time: event.end_time,
      subject: event.study_plan_schedules?.subjects?.name || 'Unknown',
      is_same_subject: event.study_plan_schedules?.subject_id === subjectId && event.study_plan_schedules?.grade_id === gradeId,
    }));

  let suggestion = '';
  if (conflicts.length > 0) {
    const sameSubject = conflicts.find(c => c.is_same_subject);
    if (sameSubject) {
      suggestion = 'Same subject session exists - consider replacing or rescheduling';
    } else {
      suggestion = 'Try a different time on this day or choose another day';
    }
  }

  return {
    has_conflict: conflicts.length > 0,
    conflict_count: conflicts.length,
    conflicts,
    suggestion,
  };
}

/**
 * Get busy periods within a date range
 * Helps AI identify days with fewer conflicts
 */
export async function getBusyPeriods(
  supabaseClient: SupabaseClient,
  userId: string,
  startDate: string,
  endDate: string,
  preferredDays?: number[] // 0=Sunday, 6=Saturday
): Promise<BusyPeriod[]> {
  const { data: events, error } = await supabaseClient
    .from('study_plan_events')
    .select('event_date, start_time, end_time')
    .eq('user_id', userId)
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error || !events) {
    console.error('Error fetching busy periods:', error);
    return [];
  }

  // Group events by date
  const eventsByDate = new Map<string, Array<{ start: string; end: string }>>();

  for (const event of events) {
    const date = event.event_date;
    // start_time and end_time are either TIME or TIMESTAMPTZ
    // Handle both formats
    const startTime = typeof event.start_time === 'string' && event.start_time.includes('T')
      ? event.start_time.split('T')[1].substring(0, 5)
      : event.start_time.toString().substring(0, 5);
    const endTime = typeof event.end_time === 'string' && event.end_time.includes('T')
      ? event.end_time.split('T')[1].substring(0, 5)
      : event.end_time.toString().substring(0, 5);

    if (!eventsByDate.has(date)) {
      eventsByDate.set(date, []);
    }
    eventsByDate.get(date)!.push({ start: startTime, end: endTime });
  }

  // Convert to BusyPeriod array and filter by preferred days if specified
  const busyPeriods: BusyPeriod[] = [];

  eventsByDate.forEach((timeSlots, date) => {
    if (preferredDays) {
      const dayOfWeek = new Date(date).getDay();
      if (!preferredDays.includes(dayOfWeek)) {
        return; // Skip non-preferred days
      }
    }

    busyPeriods.push({
      date,
      event_count: timeSlots.length,
      time_slots: timeSlots,
    });
  });

  // Sort by event count (least busy first)
  busyPeriods.sort((a, b) => a.event_count - b.event_count);

  return busyPeriods;
}

/**
 * Get all sessions for the same subject/grade combination
 * Used to identify potential conflicts or sessions that could be replaced
 */
export async function getConflictingSessions(
  supabaseClient: SupabaseClient,
  userId: string,
  subjectId: string,
  gradeId: string,
  startDate: string,
  endDate: string
): Promise<Array<{
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  schedule_id: string;
}>> {
  // Need to join with study_plan_schedules to filter by subject_id and grade_id
  const { data, error } = await supabaseClient
    .from('study_plan_events')
    .select('id, title, start_time, end_time, schedule_id, event_date, study_plan_schedules!inner(subject_id, grade_id)')
    .eq('user_id', userId)
    .eq('study_plan_schedules.subject_id', subjectId)
    .eq('study_plan_schedules.grade_id', gradeId)
    .gte('event_date', startDate)
    .lte('event_date', endDate)
    .order('event_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching conflicting sessions:', error);
    return [];
  }

  return data || [];
}

/**
 * Generate function definitions for AI function calling
 */
export function getAgentFunctionDefinitions() {
  return [
    {
      name: 'check_time_slot',
      description: 'Check if a specific date and time slot has calendar conflicts. Use this before scheduling each session to ensure no overlaps.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format',
          },
          start_time: {
            type: 'string',
            description: 'Start time in HH:MM format (24-hour)',
          },
          end_time: {
            type: 'string',
            description: 'End time in HH:MM format (24-hour)',
          },
        },
        required: ['date', 'start_time', 'end_time'],
      },
    },
    {
      name: 'get_busy_periods',
      description: 'Get a summary of busy periods within the date range. This helps identify days with fewer conflicts. Returns days sorted by event count (least busy first).',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 20)',
          },
        },
      },
    },
    {
      name: 'get_conflicting_sessions',
      description: 'Get all existing study sessions for the same subject and grade. These can potentially be replaced or rescheduled if needed.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'schedule_session',
      description: 'Schedule a study session at a specific time. Only call this after checking that the time slot is free using check_time_slot.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date in YYYY-MM-DD format',
          },
          start_time: {
            type: 'string',
            description: 'Start time in HH:MM format (24-hour)',
          },
          end_time: {
            type: 'string',
            description: 'End time in HH:MM format (24-hour)',
          },
          title: {
            type: 'string',
            description: 'Session title (e.g., "Mathematics - Chapter 1: Session 1")',
          },
          chapter_number: {
            type: 'number',
            description: 'Chapter number (1-based)',
          },
          session_number: {
            type: 'number',
            description: 'Session number within the chapter (1-based)',
          },
          topics: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of topics to cover in this session',
          },
        },
        required: ['date', 'start_time', 'end_time', 'title', 'chapter_number', 'session_number', 'topics'],
      },
    },
  ];
}

/**
 * Execute agent function calls
 */
export async function executeAgentFunction(
  functionName: string,
  args: any,
  context: {
    supabaseClient: SupabaseClient;
    userId: string;
    subjectId: string;
    gradeId: string;
    startDate: string;
    endDate: string;
    preferredDays?: number[];
  }
): Promise<any> {
  switch (functionName) {
    case 'check_time_slot':
      return await checkTimeSlot(
        context.supabaseClient,
        context.userId,
        {
          date: args.date,
          start_time: args.start_time,
          end_time: args.end_time,
        },
        context.subjectId,
        context.gradeId
      );

    case 'get_busy_periods':
      const busyPeriods = await getBusyPeriods(
        context.supabaseClient,
        context.userId,
        context.startDate,
        context.endDate,
        context.preferredDays
      );
      return busyPeriods.slice(0, args.limit || 20);

    case 'get_conflicting_sessions':
      return await getConflictingSessions(
        context.supabaseClient,
        context.userId,
        context.subjectId,
        context.gradeId,
        context.startDate,
        context.endDate
      );

    case 'schedule_session':
      // This will be handled by the main function to actually insert into DB
      // For now, just return the session details for validation
      return {
        success: true,
        session: args,
      };

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}
