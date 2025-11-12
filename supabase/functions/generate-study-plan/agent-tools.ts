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
 * NEW BULK ARCHITECTURE FUNCTIONS
 */

export interface PlannedSession {
  date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  title: string;
  chapter_number: number;
  session_number: number;
  topics: string[];
}

export interface ConflictResult {
  session_index: number;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  conflict_with: string;
}

export interface BulkValidationResult {
  valid_count: number;
  total_count: number;
  conflicts: ConflictResult[];
  valid_sessions: PlannedSession[];
}

/**
 * Validate an entire schedule plan at once (bulk validation)
 * This is much more efficient than checking one slot at a time
 */
export async function validateBulkSchedule(
  supabaseClient: SupabaseClient,
  userId: string,
  plannedSessions: PlannedSession[],
  subjectId: string,
  gradeId: string
): Promise<BulkValidationResult> {
  console.log(`🔍 Bulk validating ${plannedSessions.length} planned sessions...`);

  // Get all existing events in the date range
  const dates = plannedSessions.map(s => s.date);
  const minDate = dates.reduce((min, date) => date < min ? date : min);
  const maxDate = dates.reduce((max, date) => date > max ? date : max);

  const { data: existingEvents, error } = await supabaseClient
    .from('study_plan_events')
    .select(`
      id,
      title,
      event_date,
      start_time,
      end_time,
      study_plan_schedules!inner(subject_id, grade_id, subjects(name))
    `)
    .eq('user_id', userId)
    .gte('event_date', minDate)
    .lte('event_date', maxDate);

  if (error) {
    console.error('Error fetching existing events:', error);
    return {
      valid_count: plannedSessions.length,
      total_count: plannedSessions.length,
      conflicts: [],
      valid_sessions: plannedSessions,
    };
  }

  // Check each planned session for conflicts
  const conflicts: ConflictResult[] = [];
  const validSessions: PlannedSession[] = [];

  for (let i = 0; i < plannedSessions.length; i++) {
    const planned = plannedSessions[i];
    const plannedStart = new Date(`${planned.date}T${planned.start_time}:00`).getTime();
    const plannedEnd = new Date(`${planned.date}T${planned.end_time}:00`).getTime();

    // Check for overlaps with existing events on the same date
    const conflictingEvents = (existingEvents || []).filter(event => {
      if (event.event_date !== planned.date) return false;

      const eventStartTime = typeof event.start_time === 'string' && event.start_time.includes('T')
        ? event.start_time
        : `${planned.date}T${event.start_time}`;
      const eventEndTime = typeof event.end_time === 'string' && event.end_time.includes('T')
        ? event.end_time
        : `${planned.date}T${event.end_time}`;

      const eventStart = new Date(eventStartTime).getTime();
      const eventEnd = new Date(eventEndTime).getTime();

      // Overlap if: plannedStart < eventEnd AND eventStart < plannedEnd
      return plannedStart < eventEnd && eventStart < plannedEnd;
    });

    if (conflictingEvents.length > 0) {
      const conflict = conflictingEvents[0];
      conflicts.push({
        session_index: i,
        date: planned.date,
        start_time: planned.start_time,
        end_time: planned.end_time,
        title: planned.title,
        conflict_with: `${conflict.title} at ${conflict.start_time}-${conflict.end_time}`,
      });
    } else {
      validSessions.push(planned);
    }
  }

  console.log(`✅ Validation complete: ${validSessions.length} valid, ${conflicts.length} conflicts`);

  return {
    valid_count: validSessions.length,
    total_count: plannedSessions.length,
    conflicts,
    valid_sessions: validSessions,
  };
}

/**
 * Find alternative time slots for conflicting sessions
 * Tries to find available slots within the preferred time range
 */
export async function findAlternativeSlots(
  supabaseClient: SupabaseClient,
  userId: string,
  conflicts: ConflictResult[],
  plannedSessions: PlannedSession[],
  preferredTimeStart: string, // e.g., "18:00"
  preferredTimeEnd: string, // e.g., "23:00"
  sessionDuration: number, // in minutes
  preferredDays: number[], // 0=Sunday, 6=Saturday
  startDate: string,
  endDate: string,
  subjectId: string,
  gradeId: string
): Promise<PlannedSession[]> {
  console.log(`🔄 Finding alternatives for ${conflicts.length} conflicts...`);

  const alternatives: PlannedSession[] = [];

  // Parse time range
  const [startHour, startMin] = preferredTimeStart.split(':').map(Number);
  const [endHour, endMin] = preferredTimeEnd.split(':').map(Number);

  for (const conflict of conflicts) {
    const originalSession = plannedSessions[conflict.session_index];
    let found = false;

    // Try different times on the same day first
    const currentDate = new Date(conflict.date);

    for (let hour = startHour; hour < endHour && !found; hour++) {
      for (let min = 0; min < 60 && !found; min += 30) {
        if (hour === startHour && min < startMin) continue;
        if (hour === endHour - 1 && min >= endMin) break;

        const startTime = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        const endHour2 = hour + Math.floor((min + sessionDuration) / 60);
        const endMin2 = (min + sessionDuration) % 60;
        const endTime = `${endHour2.toString().padStart(2, '0')}:${endMin2.toString().padStart(2, '0')}`;

        // Skip if end time exceeds preferred range
        if (endHour2 > endHour || (endHour2 === endHour && endMin2 > endMin)) continue;

        // Check if this slot is free
        const checkResult = await checkTimeSlot(
          supabaseClient,
          userId,
          { date: conflict.date, start_time: startTime, end_time: endTime },
          subjectId,
          gradeId
        );

        if (!checkResult.has_conflict) {
          alternatives.push({
            ...originalSession,
            date: conflict.date,
            start_time: startTime,
            end_time: endTime,
          });
          found = true;
          console.log(`✅ Found alternative for session ${conflict.session_index}: ${conflict.date} ${startTime}-${endTime}`);
        }
      }
    }

    // If not found on same day, try next preferred days
    if (!found) {
      let daysChecked = 0;
      const maxDaysToCheck = 14;

      while (!found && daysChecked < maxDaysToCheck) {
        currentDate.setDate(currentDate.getDate() + 1);
        daysChecked++;

        if (currentDate > new Date(endDate)) break;
        if (!preferredDays.includes(currentDate.getDay())) continue;

        const dateStr = currentDate.toISOString().split('T')[0];

        // Try preferred start time first
        const checkResult = await checkTimeSlot(
          supabaseClient,
          userId,
          {
            date: dateStr,
            start_time: preferredTimeStart,
            end_time: addMinutesToTime(preferredTimeStart, sessionDuration)
          },
          subjectId,
          gradeId
        );

        if (!checkResult.has_conflict) {
          alternatives.push({
            ...originalSession,
            date: dateStr,
            start_time: preferredTimeStart,
            end_time: addMinutesToTime(preferredTimeStart, sessionDuration),
          });
          found = true;
          console.log(`✅ Found alternative on ${dateStr} for session ${conflict.session_index}`);
        }
      }
    }

    if (!found) {
      console.warn(`⚠️ Could not find alternative for session ${conflict.session_index}`);
    }
  }

  return alternatives;
}

/**
 * Helper function to add minutes to a time string
 */
function addMinutesToTime(time: string, minutes: number): string {
  const [hour, min] = time.split(':').map(Number);
  const totalMinutes = hour * 60 + min + minutes;
  const newHour = Math.floor(totalMinutes / 60);
  const newMin = totalMinutes % 60;
  return `${newHour.toString().padStart(2, '0')}:${newMin.toString().padStart(2, '0')}`;
}

/**
 * Generate function definitions for AI function calling (NEW BULK ARCHITECTURE)
 */
export function getAgentFunctionDefinitions() {
  return [
    {
      name: 'get_calendar_overview',
      description: 'Optional first step: Get a summary of busy periods to understand calendar density. This helps in planning distribution of sessions.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of busy periods to return (default: 20)',
          },
        },
      },
    },
    {
      name: 'submit_complete_plan',
      description: 'Submit your complete schedule plan for all sessions at once. This will be bulk-validated against the calendar. Return format: array of PlannedSession objects.',
      parameters: {
        type: 'object',
        properties: {
          sessions: {
            type: 'array',
            description: 'Complete array of ALL planned sessions',
            items: {
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
        },
        required: ['sessions'],
      },
    },
  ];
}

/**
 * Execute agent function calls (NEW BULK ARCHITECTURE)
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
    preferredStartTime?: string;
    preferredEndTime?: string;
    sessionDuration?: number;
  }
): Promise<any> {
  switch (functionName) {
    case 'get_calendar_overview':
      // Get busy periods as calendar overview
      const busyPeriods = await getBusyPeriods(
        context.supabaseClient,
        context.userId,
        context.startDate,
        context.endDate,
        context.preferredDays
      );
      return {
        busy_periods: busyPeriods.slice(0, args.limit || 20),
        total_days_in_range: Math.ceil(
          (new Date(context.endDate).getTime() - new Date(context.startDate).getTime()) / (1000 * 60 * 60 * 24)
        ),
      };

    case 'submit_complete_plan':
      // Validate the complete plan and find alternatives for conflicts
      console.log(`📥 Received complete plan with ${args.sessions.length} sessions`);

      const validationResult = await validateBulkSchedule(
        context.supabaseClient,
        context.userId,
        args.sessions,
        context.subjectId,
        context.gradeId
      );

      // If there are conflicts, automatically find alternatives
      let finalSessions = validationResult.valid_sessions;

      if (validationResult.conflicts.length > 0) {
        console.log(`🔄 Finding alternatives for ${validationResult.conflicts.length} conflicts...`);

        const alternatives = await findAlternativeSlots(
          context.supabaseClient,
          context.userId,
          validationResult.conflicts,
          args.sessions,
          context.preferredStartTime || '18:00',
          context.preferredEndTime || '23:00',
          context.sessionDuration || 60,
          context.preferredDays || [1, 2, 3, 4, 5],
          context.startDate,
          context.endDate,
          context.subjectId,
          context.gradeId
        );

        finalSessions = [...validationResult.valid_sessions, ...alternatives];
      }

      return {
        success: true,
        validation_result: {
          total_planned: validationResult.total_count,
          valid_count: validationResult.valid_count,
          conflict_count: validationResult.conflicts.length,
          alternatives_found: finalSessions.length - validationResult.valid_count,
        },
        final_sessions: finalSessions,
        conflicts: validationResult.conflicts.slice(0, 5), // Only show first 5 conflicts for brevity
      };

    default:
      throw new Error(`Unknown function: ${functionName}`);
  }
}
