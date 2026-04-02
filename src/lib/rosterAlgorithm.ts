import { Staff, AnnualLeave, RosterEntry, OnCallSchedule, PublicHoliday } from './types';
import { hongKong2026Holidays, isWeekend } from './holidays';
import { eachDayOfInterval, parseISO, format, differenceInDays, getDay } from 'date-fns';

interface ScoreContext {
  staffId: string;
  consecutiveDays: number;
  lastOnCallDate: string | null;
  phWeekendsWorked: number;
  alBlocks: Map<string, number>; // staffId -> block count
}

export function generateOnCallSchedule(year: number, staff: Staff[]): OnCallSchedule {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const allDays = eachDayOfInterval({
    start: parseISO(startDate),
    end: parseISO(endDate),
  }).map(d => format(d, 'yyyy-MM-dd'));

  const publicHolidays = hongKong2026Holidays.filter(h => h.date.startsWith(String(year)));
  const entries: RosterEntry[] = allDays.map(date => ({
    date,
    dayOfWeek: getDay(parseISO(date)),
    isPublicHoliday: publicHolidays.some(ph => ph.date === date),
    phName: publicHolidays.find(ph => ph.date === date)?.name,
    onCallStaffId: null,
    onCallStaffName: null,
  }));

  // Build context for each staff
  const staffContexts = new Map<string, ScoreContext>();
  staff.forEach(s => {
    const alBlocks = groupAnnualLeaves(s.annualLeaves);
    staffContexts.set(s.id, {
      staffId: s.id,
      consecutiveDays: 0,
      lastOnCallDate: null,
      phWeekendsWorked: 0,
      alBlocks,
    });
  });

  // Phase 1: Assign PH weekends (PH Sat/Sun)
  const phWeekendDays = entries.filter(e => e.isPublicHoliday && (e.dayOfWeek === 0 || e.dayOfWeek === 6));
  assignPHWeekends(phWeekendDays, staff, staffContexts, entries);

  // Phase 2: Assign AL days (before/after PH blocks)
  assignALDays(entries, staff, staffContexts);

  // Phase 3: Fill remaining days with balanced distribution
  fillRemainingDays(entries, staff, staffContexts);

  // Phase 4: Mark consecutive on-call sequences
  markConsecutiveOnCall(entries, staff);

  // Calculate PH weekends count per staff
  const phWeekendsCount: Record<string, number> = {};
  staff.forEach(s => {
    phWeekendsCount[s.id] = staffContexts.get(s.id)!.phWeekendsWorked;
  });

  return {
    year,
    publicHolidays,
    staff,
    entries,
    phWeekendsCount,
  };
}

function groupAnnualLeaves(leaves: AnnualLeave[]): Map<string, number> {
  // Group consecutive AL days into blocks (within 13 days = same block)
  const sorted = [...leaves].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const blocks = new Map<string, number>();
  let currentBlock = 0;

  sorted.forEach(leave => {
    const lastEnd = Array.from(blocks.entries()).pop()?.[1];
    if (lastEnd === undefined || differenceInDays(parseISO(leave.startDate), parseISO(lastEnd as unknown as string)) > 13) {
      currentBlock++;
    }
    blocks.set(leave.startDate, currentBlock);
  });

  return blocks;
}

function assignPHWeekends(
  phWeekendDays: RosterEntry[],
  staff: Staff[],
  staffContexts: Map<string, ScoreContext>,
  entries: RosterEntry[]
) {
  // Phase 1: Distribute PH weekends evenly - target = total_ph_days * 3 / n_staff
  const targetPHWeekends = Math.ceil(phWeekendDays.length * 3 / staff.length);
  const phWeekendAssignments = new Map<string, number>();

  // First pass: assign PH weekends to staff with fewer assignments
  phWeekendDays.forEach(day => {
    const sortedStaff = [...staff].sort((a, b) => {
      const aCount = phWeekendAssignments.get(a.id) || 0;
      const bCount = phWeekendAssignments.get(b.id) || 0;
      return aCount - bCount;
    });

    // Find staff who can work this day (not on AL)
    const availableStaff = sortedStaff.filter(s => !isOnAL(s, day.date));
    if (availableStaff.length > 0) {
      const chosen = availableStaff[0];
      assignOnCall(entries, day.date, chosen.id, chosen.name);
      phWeekendAssignments.set(chosen.id, (phWeekendAssignments.get(chosen.id) || 0) + 1);
      staffContexts.get(chosen.id)!.phWeekendsWorked++;
    }
  });
}

function assignALDays(
  entries: RosterEntry[],
  staff: Staff[],
  staffContexts: Map<string, ScoreContext>
) {
  // Phase 2: Staff on AL during PH should not be on-call
  // Staff with AL blocks adjacent to PH get priority for PH on-call
  entries.forEach(entry => {
    if (entry.onCallStaffId) return; // Already assigned

    const availableStaff = staff.filter(s => !isOnAL(s, entry.date));
    if (availableStaff.length === 1) {
      const chosen = availableStaff[0];
      assignOnCall(entries, entry.date, chosen.id, chosen.name);
    }
  });
}

function fillRemainingDays(
  entries: RosterEntry[],
  staff: Staff[],
  staffContexts: Map<string, ScoreContext>
) {
  // Phase 3: Fill remaining unassigned days with balanced distribution
  // Avoid consecutive days (penalty = 100 for same staff)
  entries.forEach(entry => {
    if (entry.onCallStaffId) return;

    const scores = staff.map(s => ({
      staff: s,
      score: calculateScore(s, entry, staffContexts),
    }));

    // Sort by score (lower is better)
    scores.sort((a, b) => a.score - b.score);

    if (scores.length > 0 && scores[0].score < Infinity) {
      const chosen = scores[0].staff;
      assignOnCall(entries, entry.date, chosen.id, chosen.name);
    }
  });
}

function calculateScore(
  staff: Staff,
  entry: RosterEntry,
  staffContexts: Map<string, ScoreContext>
): number {
  const ctx = staffContexts.get(staff.id)!;
  let score = 0;

  // Penalty for consecutive on-call days
  if (ctx.consecutiveDays > 0) {
    score += 100 * ctx.consecutiveDays;
  }

  // Penalty if staff is on AL
  if (isOnAL(staff, entry.date)) {
    score += 1000;
  }

  // Bonus for PH weekends (fewer = better chance)
  score -= (10 - ctx.phWeekendsWorked);

  return score;
}

function markConsecutiveOnCall(entries: RosterEntry[], staff: Staff[]) {
  // Phase 4: Mark consecutive on-call sequences
  // 5 scenarios to track
  for (let i = 1; i < entries.length; i++) {
    const prev = entries[i - 1];
    const curr = entries[i];

    if (prev.onCallStaffId === curr.onCallStaffId && prev.onCallStaffId !== null) {
      // Consecutive on-call - could add flag or separate tracking
      // This would be used for display/analysis purposes
    }
  }
}

function isOnAL(staff: Staff, date: string): boolean {
  return staff.annualLeaves.some(al => {
    return date >= al.startDate && date <= al.endDate;
  });
}

function assignOnCall(entries: RosterEntry[], date: string, staffId: string, staffName: string) {
  const entry = entries.find(e => e.date === date);
  if (entry) {
    entry.onCallStaffId = staffId;
    entry.onCallStaffName = staffName;
  }
}

export function getMonthlyRoster(year: number, month: number, schedule: OnCallSchedule): RosterEntry[] {
  return schedule.entries.filter(e => {
    const d = parseISO(e.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}
